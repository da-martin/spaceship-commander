/**
 * Alianzas: grupos de hasta 5 jugadores.
 *
 * Un jugador está como mucho en una. Cualquiera puede crear la suya (y queda
 * de fundador), cualquier miembro puede invitar, y el invitado decide. Solo el
 * fundador expulsa o disuelve. Si el fundador sale, hereda el más antiguo; si
 * sale el último, la alianza desaparece.
 *
 * Todas las rutas que cambian la alianza responden con la misma foto que
 * GET /api/alliance, para que el cliente repinte sin otra petición.
 *
 * El chat va por consulta: el cliente pide «lo nuevo desde el último que vi».
 * Enviar mensajes no tiene límite de frecuencia (decisión de producto); el
 * tope es el tamaño del mensaje y los que se conservan por alianza.
 *
 * Viajes (docs/plan-viajes.md, fase 4): la alianza está en un sistema y puede
 * votar un viaje a otro; sin el sí del fundador no se viaja. La votación se resuelve sin relojes: cada foto
 * (`overview`) mira antes si toca zarpar o cancelar (`settle`). Las rutas de
 * viaje responden 404 mientras la variable TRAVEL_ON del Worker no sea "1".
 */

import { cleanName, json, readBody, str } from './lib/http.js';
import { bump, MIN, throttled, tooMany } from './lib/throttle.js';

export const ALLIANCE_MAX = 5;
const INVITES_MAX = 10;              // pendientes por alianza
const ANAME_MIN = 3;
const ANAME_MAX = 30;
const SEARCH_MIN = 3;                // letras para empezar a buscar
const SEARCH_RESULTS = 8;
const MSG_MAX = 500;                 // caracteres por mensaje
const MSG_KEEP = 500;                // mensajes que se conservan por alianza
const MSG_PAGE = 100;                // los que se dan al abrir el chat
const MSG_OLDER = 50;                // cada «ver anteriores»
const MSG_NEW = 200;                 // tope de una consulta de novedades
const DAY = 864e5;
const VOTE_MS = 3 * DAY;             // la votación de un viaje dura 3 días

// Días de salto de cada sistema: los de public/js/systems.js (un test lo
// comprueba). El Sistema Madre es el centro: desde él se va a cualquiera, y
// desde los demás solo se vuelve a él. Volver dura los días del sistema que se deja.
const HOME = 'madre';
export const SYSTEM_DAYS = { madre: 0, zeta: 3, umbral: 1, canopo: 4, betelgeuse: 5 };
const known = (id) => Object.hasOwn(SYSTEM_DAYS, id);
export const jumpDays = (from, to) => Math.max(1, SYSTEM_DAYS[to] || SYSTEM_DAYS[from] || 1);
const canJump = (from, to) => known(to) && to !== from && (from === HOME || to === HOME);
const travelOn = (env) => env.TRAVEL_ON === '1';

// ¿Está aplicada la migración 0009? Sin ella las alianzas funcionan como antes
// (todas en el Sistema Madre, sin viajes) y las rutas de viaje responden 503:
// así da igual desplegar antes o después de migrar. Una vez lista, no se vuelve a mirar.
const ready = new WeakSet();
async function tripsReady(env) {
  if (ready.has(env.DB)) return true;
  try {
    await env.DB.batch([env.DB.prepare('SELECT system FROM alliances LIMIT 0'), env.DB.prepare('SELECT 1 FROM alliance_trips LIMIT 0')]);
  } catch (err) {
    if (/no such (table|column)/i.test(String(err?.message))) return false;
    throw err;
  }
  ready.add(env.DB);
  return true;
}

const LIMITS = {
  // La búsqueda da nombres de cuenta: con tope, no sirve para listarlos todos.
  search: { max: 120, window: 10 * MIN },
  invite: { max: 40, window: 60 * MIN },
};

const fail = (error, status = 400) => json({ error }, status);

const membership = async (env, userId) =>
  env.DB.prepare(
    `SELECT a.id, a.name, a.founder_id AS founderId, a.created_at AS createdAt, ${(await tripsReady(env)) ? 'a.system' : `'${HOME}' AS system`}, m.last_read_id AS lastRead
       FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id
      WHERE m.user_id = ?`
  )
    .bind(userId)
    .first();

async function overview(env, user) {
  const trips = await tripsReady(env);
  let mine = await membership(env, user.id);
  // La votación se resuelve aquí: si toca zarpar, quien no votó que sí sale (y
  // puede que seas tú).
  if (mine && trips && (await settle(env, mine.id))) mine = await membership(env, user.id);
  if (!mine) {
    // `bound`: adónde salta la alianza si está en pleno salto.
    const { results } = await env.DB.prepare(
      `SELECT a.id AS allianceId, a.name, u.name AS invitedBy, i.created_at AS createdAt,
              (SELECT COUNT(*) FROM alliance_members m WHERE m.alliance_id = a.id) AS members,
              ${trips ? `a.system, (SELECT t.to_system FROM alliance_trips t
                WHERE t.alliance_id = a.id AND t.status = 'sailing' AND t.arrives_at > ?2) AS bound` : `'${HOME}' AS system, NULL AS bound`}
         FROM alliance_invites i
         JOIN alliances a ON a.id = i.alliance_id
         JOIN users u ON u.id = i.invited_by
        WHERE i.user_id = ?1
        ORDER BY i.created_at DESC`
    )
      .bind(...(trips ? [user.id, Date.now()] : [user.id]))
      .all();
    return { alliance: null, invites: results };
  }
  const [members, invites, unread, open = { results: [] }, jump = { results: [] }] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id, u.name, m.joined_at AS joinedAt, m.progress_day AS progressDay, m.progress_pct AS progressPct
         FROM alliance_members m JOIN users u ON u.id = m.user_id
        WHERE m.alliance_id = ?
        ORDER BY m.joined_at, u.id`
    ).bind(mine.id),
    env.DB.prepare(
      `SELECT u.id AS userId, u.name, b.name AS invitedBy, i.created_at AS createdAt
         FROM alliance_invites i
         JOIN users u ON u.id = i.user_id
         JOIN users b ON b.id = i.invited_by
        WHERE i.alliance_id = ?
        ORDER BY i.created_at`
    ).bind(mine.id),
    // Lo propio no cuenta: ni lo que escribes ni el aviso de que has entrado.
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM alliance_messages
        WHERE alliance_id = ? AND id > ? AND (user_id IS NULL OR user_id != ?)`
    ).bind(mine.id, mine.lastRead, user.id),
    ...(trips ? tripQueries(env, mine.id) : []),
  ]);
  const trip = open.results[0] ? { ...open.results[0], votes: JSON.parse(open.results[0].votes || '{}') } : null;
  return {
    alliance: {
      ...mine, max: ALLIANCE_MAX, unread: unread.results[0].n, members: members.results.map(memberOut), invites: invites.results,
      trip, jump: jump.results[0] ?? null,
    },
    invites: [],
  };
}

const tripQueries = (env, allianceId) => [
  // La votación abierta, con los votos de quien sigue dentro.
  env.DB.prepare(
    `SELECT t.id, t.from_system AS "from", t.to_system AS "to", t.proposed_by AS proposedBy, t.created_at AS createdAt, t.closes_at AS closesAt,
            (SELECT json_group_object(v.user_id, v.vote) FROM alliance_trip_votes v
               JOIN alliance_members m ON m.user_id = v.user_id AND m.alliance_id = t.alliance_id
              WHERE v.trip_id = t.id) AS votes
       FROM alliance_trips t WHERE t.alliance_id = ? AND t.status = 'open'`
  ).bind(allianceId),
  // El último salto, aunque ya haya llegado: quien tenía la app cerrada al
  // zarpar lo aplica al volver.
  env.DB.prepare(
    `SELECT id, from_system AS "from", to_system AS "to", departed_at AS departedAt, arrives_at AS arrivesAt
       FROM alliance_trips WHERE alliance_id = ? AND status IN ('sailing', 'done')
      ORDER BY departed_at DESC LIMIT 1`
  ).bind(allianceId),
];

// `progress`: null si no comparte; si no, el día y el porcentaje (null = nada programado ese día).
const memberOut = ({ progressDay, progressPct, ...m }) => ({ ...m, progress: progressDay ? { day: progressDay, pct: progressPct } : null });

const snapshot = async (env, user, status = 200) => json(await overview(env, user), status);

export async function alliance(request, env, user, url) {
  const path = url.pathname.slice('/api/alliance'.length);
  const { method } = request;

  if (path === '' && method === 'GET') return snapshot(env, user);
  if (path === '' && method === 'POST') return create(request, env, user);
  if (path === '/search' && method === 'GET') return search(env, user, url);
  if (path === '/messages' && method === 'GET') return messages(env, user, url);
  if (path === '/messages' && method === 'POST') return postMessage(request, env, user);
  if (path === '/read' && method === 'POST') return markRead(request, env, user);
  if (path === '/progress' && method === 'POST') return setProgress(request, env, user);
  if (path === '/event' && method === 'POST') return postEvent(request, env, user);
  if (method !== 'POST') return fail('not_found', 404);

  if (path === '/leave') return leave(env, user);
  if (path === '/disband') return disband(env, user);
  if (path === '/kick') return kick(request, env, user);
  if (path === '/invite') return invite(request, env, user);
  if (path === '/invite/cancel') return cancelInvite(request, env, user);
  if (path === '/accept') return accept(request, env, user);
  if (path.startsWith('/trip') && !travelOn(env)) return fail('not_found', 404);
  if (path.startsWith('/trip') && !(await tripsReady(env))) return fail('not_ready', 503);
  if (path === '/trip') return propose(request, env, user);
  if (path === '/trip/vote') return vote(request, env, user);
  if (path === '/trip/withdraw') return withdraw(request, env, user);
  if (path === '/decline') return decline(request, env, user);
  return fail('not_found', 404);
}

async function create(request, env, user) {
  const body = await readBody(request);
  const name = cleanName(body?.name);
  if (name.length < ANAME_MIN || name.length > ANAME_MAX) return fail('bad_name');
  // La alianza nace donde está quien la funda (lo dice su partida).
  const system = known(str(body?.system)) ? body.system : HOME;

  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    // La clave de alliance_members para al que ya está en una alianza, y el
    // lote es una transacción: no queda una alianza sin nadie dentro.
    await env.DB.batch([
      (await tripsReady(env))
        ? env.DB.prepare('INSERT INTO alliances (id, name, founder_id, created_at, system) VALUES (?, ?, ?, ?, ?)').bind(id, name, user.id, now, system)
        : env.DB.prepare('INSERT INTO alliances (id, name, founder_id, created_at) VALUES (?, ?, ?, ?)').bind(id, name, user.id, now),
      env.DB.prepare('INSERT INTO alliance_members (user_id, alliance_id, joined_at) VALUES (?, ?, ?)').bind(user.id, id, now),
      env.DB.prepare('DELETE FROM alliance_invites WHERE user_id = ?').bind(user.id),
    ]);
  } catch (err) {
    if (/UNIQUE|PRIMARY/i.test(String(err?.message))) return fail('already_in_alliance', 409);
    throw err;
  }
  return snapshot(env, user, 201);
}

async function leave(env, user) {
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM alliance_members WHERE user_id = ? AND alliance_id = ?').bind(user.id, mine.id),
    notice(env, mine.id, 'leave', user.id),
    heir(env, mine.id),
    // Si no queda nadie, la alianza se va (y con ella sus invitaciones).
    env.DB.prepare('DELETE FROM alliances WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM alliance_members WHERE alliance_id = ?1)').bind(mine.id),
  ]);
  return snapshot(env, user);
}

// Si el fundador ya no está, hereda el miembro más antiguo.
const heir = (env, allianceId) =>
  env.DB.prepare(
    `UPDATE alliances
        SET founder_id = (SELECT user_id FROM alliance_members WHERE alliance_id = ?1 ORDER BY joined_at, user_id LIMIT 1)
      WHERE id = ?1
        AND NOT EXISTS (SELECT 1 FROM alliance_members WHERE alliance_id = ?1 AND user_id = alliances.founder_id)
        AND EXISTS (SELECT 1 FROM alliance_members WHERE alliance_id = ?1)`
  ).bind(allianceId);

async function disband(env, user) {
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  if (mine.founderId !== user.id) return fail('not_founder', 403);
  // Miembros e invitaciones caen por ON DELETE CASCADE.
  await env.DB.prepare('DELETE FROM alliances WHERE id = ? AND founder_id = ?').bind(mine.id, user.id).run();
  return snapshot(env, user);
}

async function kick(request, env, user) {
  const target = str((await readBody(request))?.userId);
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  if (mine.founderId !== user.id) return fail('not_founder', 403);
  if (!target || target === user.id) return fail('bad_request');
  const res = await env.DB.prepare('DELETE FROM alliance_members WHERE user_id = ? AND alliance_id = ?').bind(target, mine.id).run();
  if (!res.meta.changes) return fail('not_member', 404);
  await notice(env, mine.id, 'kick', target).run();
  return snapshot(env, user);
}

// Escapa los comodines de LIKE: se busca el texto tal cual.
const likePrefix = (q) => q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';

async function search(env, user, url) {
  const q = cleanName(url.searchParams.get('q'));
  if (q.length < SEARCH_MIN || q.length > 60) return json({ results: [] });

  const key = `ally:search:${user.id}`;
  if (await throttled(env, [[key, LIMITS.search]])) return tooMany();
  await bump(env, key, LIMITS.search).run();

  const mine = await membership(env, user.id);
  // `status`: 'free' se puede invitar · 'member' ya está en la tuya ·
  // 'invited' ya tiene invitación tuya · 'taken' está en otra alianza.
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.name,
            CASE WHEN m.alliance_id IS NULL THEN
                   CASE WHEN i.user_id IS NULL THEN 'free' ELSE 'invited' END
                 WHEN m.alliance_id = ?3 THEN 'member'
                 ELSE 'taken' END AS status
       FROM users u
       LEFT JOIN alliance_members m ON m.user_id = u.id
       LEFT JOIN alliance_invites i ON i.user_id = u.id AND i.alliance_id = ?3
      WHERE u.name LIKE ?1 ESCAPE '\\' AND u.id != ?2
      ORDER BY u.name COLLATE NOCASE
      LIMIT ${SEARCH_RESULTS}`
  )
    .bind(likePrefix(q), user.id, mine?.id ?? '')
    .all();
  return json({ results });
}

async function invite(request, env, user) {
  const target = str((await readBody(request))?.userId);
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  if (!target || target === user.id) return fail('bad_request');

  const key = `ally:invite:${user.id}`;
  if (await throttled(env, [[key, LIMITS.invite]])) return tooMany();

  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM alliance_members WHERE alliance_id = ?1) AS members,
            (SELECT COUNT(*) FROM alliance_invites WHERE alliance_id = ?1) AS pending,
            (SELECT 1 FROM users WHERE id = ?2) AS found,
            (SELECT 1 FROM alliance_members WHERE user_id = ?2) AS taken`
  )
    .bind(mine.id, target)
    .first();
  if (!row.found) return fail('no_user', 404);
  if (row.taken) return fail('already_in_alliance', 409);
  if (row.members >= ALLIANCE_MAX) return fail('full', 409);
  if (row.pending >= INVITES_MAX) return fail('too_many_invites', 409);

  await env.DB.batch([
    bump(env, key, LIMITS.invite),
    // Invitar dos veces a la misma persona no es un error: ya está invitada.
    env.DB.prepare(
      `INSERT INTO alliance_invites (alliance_id, user_id, invited_by, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(alliance_id, user_id) DO NOTHING`
    ).bind(mine.id, target, user.id, Date.now()),
  ]);
  return snapshot(env, user);
}

async function cancelInvite(request, env, user) {
  const target = str((await readBody(request))?.userId);
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  await env.DB.prepare('DELETE FROM alliance_invites WHERE alliance_id = ? AND user_id = ?').bind(mine.id, target).run();
  return snapshot(env, user);
}

async function accept(request, env, user) {
  const allianceId = str((await readBody(request))?.allianceId);
  if (await membership(env, user.id)) return fail('already_in_alliance', 409);

  let res;
  try {
    // Una sola sentencia: entra solo si sigue invitado y queda sitio, así que
    // dos aceptaciones a la vez no pueden pasar de 5.
    res = await env.DB.prepare(
      `INSERT INTO alliance_members (user_id, alliance_id, joined_at)
       SELECT ?1, ?2, ?3
        WHERE EXISTS (SELECT 1 FROM alliance_invites WHERE alliance_id = ?2 AND user_id = ?1)
          AND (SELECT COUNT(*) FROM alliance_members WHERE alliance_id = ?2) < ${ALLIANCE_MAX}`
    )
      .bind(user.id, allianceId, Date.now())
      .run();
  } catch (err) {
    if (/UNIQUE|PRIMARY/i.test(String(err?.message))) return fail('already_in_alliance', 409);
    throw err;
  }
  if (!res.meta.changes) {
    const still = await env.DB.prepare('SELECT 1 FROM alliance_invites WHERE alliance_id = ? AND user_id = ?').bind(allianceId, user.id).first();
    return still ? fail('full', 409) : fail('no_invite', 404);
  }
  // Ya está en una: las demás invitaciones dejan de tener sentido.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM alliance_invites WHERE user_id = ?').bind(user.id),
    notice(env, allianceId, 'join', user.id),
  ]);
  return snapshot(env, user);
}

async function decline(request, env, user) {
  const allianceId = str((await readBody(request))?.allianceId);
  await env.DB.prepare('DELETE FROM alliance_invites WHERE alliance_id = ? AND user_id = ?').bind(allianceId, user.id).run();
  return snapshot(env, user);
}

/* ---------- viajes ---------- */

const openTrip = (env, allianceId) =>
  env.DB.prepare(`SELECT id, from_system AS "from", to_system AS "to", proposed_by AS proposedBy, closes_at AS closesAt
                    FROM alliance_trips WHERE alliance_id = ? AND status = 'open'`).bind(allianceId).first();
const sailingTo = (env, allianceId, now) =>
  env.DB.prepare(`SELECT to_system AS "to" FROM alliance_trips WHERE alliance_id = ? AND status = 'sailing' AND arrives_at > ?`).bind(allianceId, now).first();

// Mira si la votación abierta ya está decidida y la resuelve; de paso, da por
// llegado el salto que haya cumplido su plazo. Devuelve true si zarpó o se
// canceló. Cada cambio de estado es condicional: si dos peticiones resuelven
// a la vez, solo una escribe los avisos.
async function settle(env, allianceId, now = Date.now()) {
  await env.DB.prepare(`UPDATE alliance_trips SET status = 'done' WHERE alliance_id = ? AND status = 'sailing' AND arrives_at <= ?`).bind(allianceId, now).run();
  const trip = await openTrip(env, allianceId);
  if (!trip) return false;
  const { results } = await env.DB.prepare(
    `SELECT m.user_id AS id, v.vote, m.user_id = a.founder_id AS founder FROM alliance_members m
       JOIN alliances a ON a.id = m.alliance_id
       LEFT JOIN alliance_trip_votes v ON v.trip_id = ? AND v.user_id = m.user_id
      WHERE m.alliance_id = ?`
  ).bind(trip.id, allianceId).all();
  const yes = results.filter((r) => r.vote === 'yes'), no = results.filter((r) => r.vote === 'no');
  const founder = results.find((r) => r.founder);
  // El fundador tiene la última palabra: si dice que no, no hay viaje, y nunca
  // se queda fuera de su propia alianza.
  if (founder?.vote === 'no') return cancel(env, allianceId, trip, founder.id);
  // Todos que sí: se zarpa ya. Más de la mitad que no: se cancela ya (un empate no).
  if (yes.length === results.length) return sail(env, allianceId, trip, [], now);
  if (no.length * 2 > results.length) return cancel(env, allianceId, trip);
  if (now < trip.closesAt) return false;
  // Plazo cumplido: sin el sí del fundador no se va nadie; con él, zarpan los
  // que dijeron que sí, a la hora del cierre.
  if (founder?.vote !== 'yes') return cancel(env, allianceId, trip);
  return sail(env, allianceId, trip, results.filter((r) => r.vote !== 'yes').map((r) => r.id), trip.closesAt);
}

// `by`: el fundador, si se cancela porque votó que no.
async function cancel(env, allianceId, trip, by = null) {
  const res = await env.DB.prepare(`UPDATE alliance_trips SET status = 'cancelled' WHERE id = ? AND status = 'open'`).bind(trip.id).run();
  if (res.meta.changes) await notice(env, allianceId, 'trip_cancel', by, trip.to).run();
  return !!res.meta.changes;
}

// Zarpa: la alianza pasa a estar en el destino y quien no dijo que sí (`stay`)
// se queda en el sistema de origen, fuera de la alianza. El fundador nunca está
// entre ellos (sin su sí no se zarpa); `heir` queda por si acaso.
async function sail(env, allianceId, trip, stay, at) {
  const arrives = at + jumpDays(trip.from, trip.to) * DAY;
  const res = await env.DB.prepare(`UPDATE alliance_trips SET status = 'sailing', departed_at = ?, arrives_at = ? WHERE id = ? AND status = 'open'`)
    .bind(at, arrives, trip.id).run();
  if (!res.meta.changes) return false;
  await env.DB.batch([
    env.DB.prepare('UPDATE alliances SET system = ? WHERE id = ?').bind(trip.to, allianceId),
    notice(env, allianceId, 'trip_sail', null, trip.to),
    ...stay.flatMap((id) => [
      env.DB.prepare('DELETE FROM alliance_members WHERE user_id = ? AND alliance_id = ?').bind(id, allianceId),
      notice(env, allianceId, 'trip_stay', id, trip.from),
    ]),
    heir(env, allianceId),
  ]);
  return true;
}

// Cualquier miembro propone un viaje desde el sistema de la alianza, y vota sí.
async function propose(request, env, user) {
  const to = str((await readBody(request))?.to);
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  const now = Date.now();
  await settle(env, mine.id, now);
  if (await sailingTo(env, mine.id, now)) return fail('jumping', 409);
  const here = (await membership(env, user.id))?.system;
  if (!here) return fail('no_alliance', 409);
  if (!canJump(here, to)) return fail('bad_destination');
  const id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO alliance_trips (id, alliance_id, from_system, to_system, proposed_by, created_at, closes_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, mine.id, here, to, user.id, now, now + VOTE_MS),
      env.DB.prepare(`INSERT INTO alliance_trip_votes (trip_id, user_id, vote, voted_at) VALUES (?, ?, 'yes', ?)`).bind(id, user.id, now),
      notice(env, mine.id, 'trip_propose', user.id, to),
    ]);
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message))) return fail('trip_open', 409);
    throw err;
  }
  return snapshot(env, user, 201);   // la foto resuelve: una alianza de uno zarpa ya
}

// Votar o cambiar el voto mientras siga abierta. `tripId` evita votar otra
// propuesta distinta de la que se estaba viendo.
async function vote(request, env, user) {
  const body = await readBody(request);
  const v = str(body?.vote);
  if (v !== 'yes' && v !== 'no') return fail('bad_request');
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  await settle(env, mine.id);
  const trip = await openTrip(env, mine.id);
  if (!trip || trip.id !== str(body?.tripId)) return fail('no_trip', 404);
  await env.DB.prepare(
    `INSERT INTO alliance_trip_votes (trip_id, user_id, vote, voted_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(trip_id, user_id) DO UPDATE SET vote = excluded.vote, voted_at = excluded.voted_at`
  ).bind(trip.id, user.id, v, Date.now()).run();
  return snapshot(env, user);
}

// Solo quien la propuso la retira, y solo mientras está abierta.
async function withdraw(request, env, user) {
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  await settle(env, mine.id);
  const trip = await openTrip(env, mine.id);
  if (!trip) return fail('no_trip', 404);
  if (trip.proposedBy !== user.id) return fail('not_proposer', 403);
  const res = await env.DB.prepare(`UPDATE alliance_trips SET status = 'withdrawn' WHERE id = ? AND status = 'open'`).bind(trip.id).run();
  if (res.meta.changes) await notice(env, mine.id, 'trip_withdraw', user.id, trip.to).run();
  return snapshot(env, user);
}

/* ---------- chat ---------- */

// Aviso del sistema en el chat: quién entra, sale o es expulsado, y cómo va
// un viaje ('trip_propose', 'trip_withdraw', 'trip_cancel', 'trip_sail' y
// 'trip_stay', quien se queda y sale de la alianza). Los hitos
// del juego ('rank', 'mission') entran por postEvent.
// Los avisos de viaje llevan en `body` el sistema del que se habla.
const notice = (env, allianceId, kind, userId, body = '') =>
  env.DB.prepare('INSERT INTO alliance_messages (alliance_id, user_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(allianceId, userId, kind, body, Date.now());

const MSG_COLS = `g.id, g.user_id AS userId, u.name, g.kind, g.body, g.created_at AS createdAt
       FROM alliance_messages g LEFT JOIN users u ON u.id = g.user_id`;

const posInt = (x) => (/^\d{1,15}$/.test(String(x ?? '')) ? Number(x) : null);

// Sin parámetros: los últimos. `after`: lo nuevo desde ese id. `before`: una
// página de anteriores. `more` dice si quedan más antiguos por pedir.
async function messages(env, user, url) {
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);

  const after = posInt(url.searchParams.get('after'));
  if (after !== null) {
    const { results } = await env.DB.prepare(`SELECT ${MSG_COLS} WHERE g.alliance_id = ? AND g.id > ? ORDER BY g.id LIMIT ${MSG_NEW}`)
      .bind(mine.id, after)
      .all();
    return json({ messages: results, lastRead: mine.lastRead });
  }

  const before = posInt(url.searchParams.get('before'));
  const page = before === null ? MSG_PAGE : MSG_OLDER;
  const { results } = await env.DB.prepare(
    `SELECT ${MSG_COLS} WHERE g.alliance_id = ?1 AND (?2 IS NULL OR g.id < ?2) ORDER BY g.id DESC LIMIT ${page + 1}`
  )
    .bind(mine.id, before)
    .all();
  const more = results.length > page;
  return json({ messages: results.slice(0, page).reverse(), more, lastRead: mine.lastRead });
}

// Saltos de línea sí; el resto de caracteres de control, fuera.
const cleanMessage = (x) =>
  str(x).normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n').trim();

async function postMessage(request, env, user) {
  const body = cleanMessage((await readBody(request))?.body);
  if (!body) return fail('empty');
  if ([...body].length > MSG_MAX) return fail('too_long');
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);

  const now = Date.now();
  const [ins] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO alliance_messages (alliance_id, user_id, kind, body, created_at) VALUES (?, ?, 'text', ?, ?) RETURNING id`
    ).bind(mine.id, user.id, body, now),
    // Solo se conservan los últimos: lo anterior se va al escribir.
    env.DB.prepare(
      `DELETE FROM alliance_messages
        WHERE alliance_id = ?1
          AND id <= (SELECT id FROM alliance_messages WHERE alliance_id = ?1 ORDER BY id DESC LIMIT 1 OFFSET ${MSG_KEEP})`
    ).bind(mine.id),
  ]);
  return json({ message: { id: ins.results[0].id, userId: user.id, name: user.name, kind: 'text', body, createdAt: now } }, 201);
}

// Solo avanza, y nunca más allá del último mensaje que existe.
async function markRead(request, env, user) {
  const id = posInt((await readBody(request))?.id);
  if (id === null) return fail('bad_request');
  await env.DB.prepare(
    `UPDATE alliance_members
        SET last_read_id = MAX(last_read_id, MIN(?1, COALESCE((SELECT MAX(id) FROM alliance_messages WHERE alliance_id = alliance_members.alliance_id), 0)))
      WHERE user_id = ?2`
  )
    .bind(id, user.id)
    .run();
  return json({ ok: true });
}

/* ---------- lo que comparte el juego de cada uno ---------- */

// El porcentaje lo calcula el cliente, igual que el resto del juego: el
// servidor solo guarda el número. {day: null} deja de compartir.
async function setProgress(request, env, user) {
  const body = await readBody(request);
  const day = body?.day ?? null;
  const pct = body?.pct ?? null;
  if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(str(day))) return fail('bad_request');
  if (pct !== null && !(Number.isInteger(pct) && pct >= 0 && pct <= 100)) return fail('bad_request');
  const res = await env.DB.prepare('UPDATE alliance_members SET progress_day = ?, progress_pct = ? WHERE user_id = ?')
    .bind(day, day === null ? null : pct, user.id)
    .run();
  if (!res.meta.changes) return fail('no_alliance', 409);
  return json({ ok: true });
}

const RANK_MAX = 99;
const TOPIC_MAX = 40;

// Hitos del juego que el chat anuncia. 'rank' lleva el índice del rango y
// 'mission' el tema de la misión; el texto lo pone el cliente al pintarlo.
async function postEvent(request, env, user) {
  const body = await readBody(request);
  const kind = str(body?.kind);
  let text;
  if (kind === 'rank') {
    if (!(Number.isInteger(body.rank) && body.rank >= 1 && body.rank <= RANK_MAX)) return fail('bad_request');
    text = String(body.rank);
  } else if (kind === 'mission') {
    text = cleanMessage(body.topic).replace(/\n/g, ' ');
    if (!text || [...text].length > TOPIC_MAX) return fail('bad_request');
  } else return fail('bad_request');

  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);

  // Un ascenso se anuncia una vez: desmarcar y volver a marcar una tarea puede
  // hacerte cruzar el mismo rango varias veces.
  const res = await env.DB.prepare(
    `INSERT INTO alliance_messages (alliance_id, user_id, kind, body, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5
      WHERE ?3 != 'rank' OR NOT EXISTS (
        SELECT 1 FROM alliance_messages WHERE alliance_id = ?1 AND user_id = ?2 AND kind = 'rank' AND body = ?4)`
  )
    .bind(mine.id, user.id, kind, text, Date.now())
    .run();
  return json({ ok: true, posted: res.meta.changes === 1 }, 201);
}
