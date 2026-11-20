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
 * Viajes (docs/plan-viajes.md, fase 4): cualquier miembro propone viajar a otro
 * sistema y la alianza vota durante 3 días. La votación se resuelve al
 * consultar la alianza (resolveTrip), sin cron. Todo esto está apagado mientras
 * la variable TRAVEL_ON del Worker no valga '1': entonces no se lee ni se
 * escribe nada de la migración 0009, y la API responde como antes.
 *
 * El chat va por consulta: el cliente pide «lo nuevo desde el último que vi».
 * Enviar mensajes no tiene límite de frecuencia (decisión de producto); el
 * tope es el tamaño del mensaje y los que se conservan por alianza.
 */

import { cleanName, json, readBody, str } from './lib/http.js';
import { bump, MIN, throttled, tooMany } from './lib/throttle.js';
import { HOME, SYSTEMS, canJump, jumpDays } from '../public/js/systems.js';

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

const LIMITS = {
  // La búsqueda da nombres de cuenta: con tope, no sirve para listarlos todos.
  search: { max: 120, window: 10 * MIN },
  invite: { max: 40, window: 60 * MIN },
};

const fail = (error, status = 400) => json({ error }, status);

export const TRIP_VOTE_MS = 3 * 24 * 60 * MIN;   // la votación dura 3 días
export const travelOn = (env) => env.TRAVEL_ON === '1' || env.TRAVEL_ON === true;
// Sistema guardado → id ('madre' para el Sistema Madre, que se guarda como NULL).
const sysId = (s) => (s && Object.hasOwn(SYSTEMS, s) ? s : HOME);
const sysCol = (id) => (id === HOME ? null : id);

// Con los viajes apagados no se toca la columna `system`: así funciona aunque
// aún no se haya aplicado la migración.
const membership = (env, userId) =>
  env.DB.prepare(
    `SELECT a.id, a.name, a.founder_id AS founderId, a.created_at AS createdAt, m.last_read_id AS lastRead${travelOn(env) ? ', a.system' : ''}
       FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id
      WHERE m.user_id = ?`
  )
    .bind(userId)
    .first();

async function overview(env, user) {
  let mine = await membership(env, user.id);
  // La votación se resuelve al mirar: puede que zarpéis ahora, o que te quedes fuera.
  if (mine && travelOn(env) && (await resolveTrip(env, mine))) mine = await membership(env, user.id);
  if (!mine) {
    // Con viajes: dónde está cada alianza que te invita, para avisar del salto antes de aceptar.
    const { results } = await env.DB.prepare(
      `SELECT a.id AS allianceId, a.name, u.name AS invitedBy, i.created_at AS createdAt,
              (SELECT COUNT(*) FROM alliance_members m WHERE m.alliance_id = a.id) AS members${travelOn(env) ? ', a.system' : ''}
         FROM alliance_invites i
         JOIN alliances a ON a.id = i.alliance_id
         JOIN users u ON u.id = i.invited_by
        WHERE i.user_id = ?
        ORDER BY i.created_at DESC`
    )
      .bind(user.id)
      .all();
    return { alliance: null, invites: travelOn(env) ? results.map((i) => ({ ...i, system: sysId(i.system) })) : results };
  }
  const [members, invites, unread] = await env.DB.batch([
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
  ]);
  const a = { ...mine, max: ALLIANCE_MAX, unread: unread.results[0].n, members: members.results.map(memberOut), invites: invites.results };
  if (travelOn(env)) { a.system = sysId(mine.system); a.trip = await tripOut(env, mine.id); }
  return { alliance: a, invites: [] };
}

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
  if (path.startsWith('/trip') && !travelOn(env)) return fail('not_found', 404);
  if (path === '/trip' && method === 'POST') return propose(request, env, user);
  if (path === '/trip/vote' && method === 'POST') return vote(request, env, user);
  if (path === '/trip/withdraw' && method === 'POST') return withdraw(request, env, user);
  if (method !== 'POST') return fail('not_found', 404);

  if (path === '/leave') return leave(env, user);
  if (path === '/disband') return disband(env, user);
  if (path === '/kick') return kick(request, env, user);
  if (path === '/invite') return invite(request, env, user);
  if (path === '/invite/cancel') return cancelInvite(request, env, user);
  if (path === '/accept') return accept(request, env, user);
  if (path === '/decline') return decline(request, env, user);
  return fail('not_found', 404);
}

async function create(request, env, user) {
  const body = await readBody(request);
  const name = cleanName(body?.name);
  if (name.length < ANAME_MIN || name.length > ANAME_MAX) return fail('bad_name');
  // Con viajes, la alianza nace donde está quien la funda (lo dice su partida).
  const system = travelOn(env) ? sysCol(sysId(str(body?.system))) : null;

  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    // La clave de alliance_members para al que ya está en una alianza, y el
    // lote es una transacción: no queda una alianza sin nadie dentro.
    await env.DB.batch([
      travelOn(env)
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

// Si el fundador ya no está, hereda el miembro más antiguo.
const passFounder = (env, allianceId) =>
  env.DB.prepare(
    `UPDATE alliances
        SET founder_id = (SELECT user_id FROM alliance_members WHERE alliance_id = ?1 ORDER BY joined_at, user_id LIMIT 1)
      WHERE id = ?1
        AND founder_id NOT IN (SELECT user_id FROM alliance_members WHERE alliance_id = ?1)
        AND EXISTS (SELECT 1 FROM alliance_members WHERE alliance_id = ?1)`
  ).bind(allianceId);

async function leave(env, user) {
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM alliance_members WHERE user_id = ? AND alliance_id = ?').bind(user.id, mine.id),
    notice(env, mine.id, 'leave', user.id),
    // Si quien sale era el fundador, hereda el miembro más antiguo.
    env.DB.prepare(
      `UPDATE alliances
          SET founder_id = (SELECT user_id FROM alliance_members WHERE alliance_id = ?1 ORDER BY joined_at, user_id LIMIT 1)
        WHERE id = ?1 AND founder_id = ?2
          AND EXISTS (SELECT 1 FROM alliance_members WHERE alliance_id = ?1)`
    ).bind(mine.id, user.id),
    // Si no queda nadie, la alianza se va (y con ella sus invitaciones).
    env.DB.prepare('DELETE FROM alliances WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM alliance_members WHERE alliance_id = ?1)').bind(mine.id),
  ]);
  return snapshot(env, user);
}

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

/* ---------- chat ---------- */

// Aviso del sistema en el chat: quién entra, sale o es expulsado. Los hitos
// del juego ('rank', 'mission') entran por postEvent.
// Los avisos de viaje llevan en `body` el sistema del que hablan.
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

/* ---------- viajes ---------- */

// El último viaje que importa al cliente: la propuesta abierta, el salto en
// curso o el último que llegó (para quien no abrió la app mientras zarpaba).
async function tripOut(env, allianceId) {
  const t = await env.DB.prepare(
    `SELECT t.id, t.origin AS "from", t.dest AS "to", t.status, t.proposed_by AS proposedBy, u.name AS proposerName,
            t.created_at AS createdAt, t.closes_at AS closesAt, t.departed_at AS departedAt, t.arrives_at AS arrivesAt
       FROM alliance_trips t LEFT JOIN users u ON u.id = t.proposed_by
      WHERE t.alliance_id = ? AND t.status IN ('open', 'sailing', 'done')
      ORDER BY t.created_at DESC LIMIT 1`
  )
    .bind(allianceId)
    .first();
  if (!t) return null;
  if (t.status !== 'open') return { ...t, votes: [] };
  // Solo cuentan los votos de quien sigue en la alianza.
  const { results } = await env.DB.prepare(
    `SELECT v.user_id AS userId, v.vote FROM alliance_trip_votes v
       JOIN alliance_members m ON m.user_id = v.user_id AND m.alliance_id = ?
      WHERE v.trip_id = ?`
  )
    .bind(allianceId, t.id)
    .all();
  return { ...t, votes: results };
}

// Resuelve la votación abierta o el salto en curso de la alianza. Devuelve true
// si cambió algo (para volver a leer la foto). Cada cambio de estado es una
// UPDATE condicionada al estado anterior: dos peticiones a la vez no zarpan dos veces.
export async function resolveTrip(env, mine, now = Date.now()) {
  const t = await env.DB.prepare(
    `SELECT id, origin, dest, status, closes_at AS closesAt, arrives_at AS arrivesAt
       FROM alliance_trips WHERE alliance_id = ? AND status IN ('open', 'sailing')`
  )
    .bind(mine.id)
    .first();
  if (!t) return false;
  if (t.status === 'sailing') {
    if (now < t.arrivesAt) return false;
    await env.DB.prepare(`UPDATE alliance_trips SET status = 'done' WHERE id = ? AND status = 'sailing'`).bind(t.id).run();
    return true;
  }
  const tally = await env.DB.prepare(
    `SELECT COUNT(*) AS members,
            COALESCE(SUM(v.vote = 'yes'), 0) AS yes,
            COALESCE(SUM(v.vote = 'no'), 0) AS no
       FROM alliance_members m LEFT JOIN alliance_trip_votes v ON v.user_id = m.user_id AND v.trip_id = ?
      WHERE m.alliance_id = ?`
  )
    .bind(t.id, mine.id)
    .first();
  // Más de la mitad dice que no: se cancela (un empate no cancela).
  if (tally.no * 2 > tally.members) return cancelTrip(env, mine.id, t);
  // Todos dicen que sí: zarpan ya. Al cumplirse el plazo, zarpan los que dijeron que sí.
  if (tally.yes === tally.members) return depart(env, mine.id, t, now);
  if (now >= t.closesAt) return tally.yes > 0 ? depart(env, mine.id, t, t.closesAt) : cancelTrip(env, mine.id, t);
  return false;
}

async function cancelTrip(env, allianceId, t) {
  const res = await env.DB.prepare(`UPDATE alliance_trips SET status = 'cancelled' WHERE id = ? AND status = 'open'`).bind(t.id).run();
  if (res.meta.changes) await notice(env, allianceId, 'trip_cancel', null, t.dest).run();
  return true;
}

// Zarpan los que han dicho que sí. Quien dijo que no o no votó se queda en el
// sistema y sale de la alianza, con un aviso en el chat.
async function depart(env, allianceId, t, at) {
  const arrives = at + jumpDays(t.origin, t.dest) * 24 * 60 * MIN;
  const res = await env.DB.prepare(
    `UPDATE alliance_trips SET status = 'sailing', departed_at = ?, arrives_at = ? WHERE id = ? AND status = 'open'`
  )
    .bind(at, arrives, t.id)
    .run();
  if (!res.meta.changes) return true;
  const { results: stay } = await env.DB.prepare(
    `SELECT m.user_id AS id FROM alliance_members m
       LEFT JOIN alliance_trip_votes v ON v.user_id = m.user_id AND v.trip_id = ?
      WHERE m.alliance_id = ? AND COALESCE(v.vote, 'no') != 'yes'`
  )
    .bind(t.id, allianceId)
    .all();
  await env.DB.batch([
    ...stay.flatMap((m) => [
      env.DB.prepare('DELETE FROM alliance_members WHERE user_id = ? AND alliance_id = ?').bind(m.id, allianceId),
      notice(env, allianceId, 'trip_stay', m.id, t.origin),
    ]),
    passFounder(env, allianceId),
    env.DB.prepare('UPDATE alliances SET system = ? WHERE id = ?').bind(sysCol(t.dest), allianceId),
    notice(env, allianceId, 'trip_go', null, t.dest),
  ]);
  return true;
}

async function propose(request, env, user) {
  const to = str((await readBody(request))?.to);
  let mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  await resolveTrip(env, mine);
  mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  const from = sysId(mine.system);
  if (!canJump(from, to)) return fail('bad_destination');
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO alliance_trips (id, alliance_id, origin, dest, proposed_by, status, created_at, closes_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
      ).bind(id, mine.id, from, to, user.id, now, now + TRIP_VOTE_MS),
      // Quien propone vota que sí.
      env.DB.prepare(`INSERT INTO alliance_trip_votes (trip_id, user_id, vote, voted_at) VALUES (?, ?, 'yes', ?)`).bind(id, user.id, now),
      notice(env, mine.id, 'trip', user.id, to),
    ]);
  } catch (err) {
    // Ya hay una propuesta abierta o un salto en curso (índice único).
    if (/UNIQUE|PRIMARY/i.test(String(err?.message))) return fail('trip_busy', 409);
    throw err;
  }
  return snapshot(env, user, 201);   // en una alianza de uno, la foto ya trae el salto
}

const openTrip = (env, allianceId, tripId) =>
  env.DB.prepare(`SELECT id, proposed_by AS proposedBy, dest FROM alliance_trips WHERE id = ? AND alliance_id = ? AND status = 'open'`)
    .bind(tripId, allianceId)
    .first();

async function vote(request, env, user) {
  const body = await readBody(request);
  const v = str(body?.vote);
  if (v !== 'yes' && v !== 'no') return fail('bad_request');
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  await resolveTrip(env, mine);
  const t = await openTrip(env, mine.id, str(body?.tripId));
  if (!t) return fail('no_trip', 404);
  await env.DB.prepare(
    `INSERT INTO alliance_trip_votes (trip_id, user_id, vote, voted_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(trip_id, user_id) DO UPDATE SET vote = excluded.vote, voted_at = excluded.voted_at`
  )
    .bind(t.id, user.id, v, Date.now())
    .run();
  return snapshot(env, user);
}

async function withdraw(request, env, user) {
  const mine = await membership(env, user.id);
  if (!mine) return fail('no_alliance', 409);
  await resolveTrip(env, mine);
  const t = await openTrip(env, mine.id, str((await readBody(request))?.tripId));
  if (!t) return fail('no_trip', 404);
  if (t.proposedBy !== user.id) return fail('not_proposer', 403);
  const res = await env.DB.prepare(`UPDATE alliance_trips SET status = 'withdrawn' WHERE id = ? AND status = 'open'`).bind(t.id).run();
  if (res.meta.changes) await notice(env, mine.id, 'trip_withdraw', user.id, t.dest).run();
  return snapshot(env, user);
}
