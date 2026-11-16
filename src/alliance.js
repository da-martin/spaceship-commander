/**
 * Alianzas: grupos de hasta 5 jugadores.
 *
 * Un jugador está como mucho en una. Cualquiera puede crear la suya (y queda
 * de fundador), cualquier miembro puede invitar, y el invitado decide. Solo el
 * fundador expulsa o disuelve. Si el fundador sale, hereda el más antiguo; si
 * sale el último, la alianza desaparece.
 *
 * Todas las rutas que cambian algo responden con la misma foto que
 * GET /api/alliance, para que el cliente repinte sin otra petición.
 */

import { cleanName, json, readBody, str } from './lib/http.js';
import { bump, MIN, throttled, tooMany } from './lib/throttle.js';

export const ALLIANCE_MAX = 5;
const INVITES_MAX = 10;              // pendientes por alianza
const ANAME_MIN = 3;
const ANAME_MAX = 30;
const SEARCH_MIN = 3;                // letras para empezar a buscar
const SEARCH_RESULTS = 8;

const LIMITS = {
  // La búsqueda da nombres de cuenta: con tope, no sirve para listarlos todos.
  search: { max: 120, window: 10 * MIN },
  invite: { max: 40, window: 60 * MIN },
};

const fail = (error, status = 400) => json({ error }, status);

const membership = (env, userId) =>
  env.DB.prepare(
    `SELECT a.id, a.name, a.founder_id AS founderId, a.created_at AS createdAt
       FROM alliance_members m JOIN alliances a ON a.id = m.alliance_id
      WHERE m.user_id = ?`
  )
    .bind(userId)
    .first();

async function overview(env, user) {
  const mine = await membership(env, user.id);
  if (!mine) {
    const { results } = await env.DB.prepare(
      `SELECT a.id AS allianceId, a.name, u.name AS invitedBy, i.created_at AS createdAt,
              (SELECT COUNT(*) FROM alliance_members m WHERE m.alliance_id = a.id) AS members
         FROM alliance_invites i
         JOIN alliances a ON a.id = i.alliance_id
         JOIN users u ON u.id = i.invited_by
        WHERE i.user_id = ?
        ORDER BY i.created_at DESC`
    )
      .bind(user.id)
      .all();
    return { alliance: null, invites: results };
  }
  const [members, invites] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id, u.name, m.joined_at AS joinedAt
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
  ]);
  return {
    alliance: { ...mine, max: ALLIANCE_MAX, members: members.results, invites: invites.results },
    invites: [],
  };
}

const snapshot = async (env, user, status = 200) => json(await overview(env, user), status);

export async function alliance(request, env, user, url) {
  const path = url.pathname.slice('/api/alliance'.length);
  const { method } = request;

  if (path === '' && method === 'GET') return snapshot(env, user);
  if (path === '' && method === 'POST') return create(request, env, user);
  if (path === '/search' && method === 'GET') return search(env, user, url);
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
  const name = cleanName((await readBody(request))?.name);
  if (name.length < ANAME_MIN || name.length > ANAME_MAX) return fail('bad_name');

  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    // La clave de alliance_members para al que ya está en una alianza, y el
    // lote es una transacción: no queda una alianza sin nadie dentro.
    await env.DB.batch([
      env.DB.prepare('INSERT INTO alliances (id, name, founder_id, created_at) VALUES (?, ?, ?, ?)').bind(id, name, user.id, now),
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
  await env.DB.prepare('DELETE FROM alliance_invites WHERE user_id = ?').bind(user.id).run();
  return snapshot(env, user);
}

async function decline(request, env, user) {
  const allianceId = str((await readBody(request))?.allianceId);
  await env.DB.prepare('DELETE FROM alliance_invites WHERE alliance_id = ? AND user_id = ?').bind(allianceId, user.id).run();
  return snapshot(env, user);
}
