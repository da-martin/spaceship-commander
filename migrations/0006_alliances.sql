-- Alianzas: grupos de hasta 5 jugadores para darse apoyo. El juego de cada uno
-- sigue igual; aquí solo vive quién está con quién.
--
-- Solo añade tablas.

-- El fundador es siempre un miembro (lo mantiene src/alliance.js): si se va,
-- el cargo pasa al miembro más antiguo.
CREATE TABLE alliances (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  founder_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- user_id es la clave: un jugador solo puede estar en una alianza.
CREATE TABLE alliance_members (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  joined_at   INTEGER NOT NULL
);
CREATE INDEX idx_alliance_members_alliance ON alliance_members(alliance_id);

-- Invitaciones pendientes. Se borran al aceptar, rechazar o retirar; no queda
-- historial.
CREATE TABLE alliance_invites (
  alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (alliance_id, user_id)
);
CREATE INDEX idx_alliance_invites_user ON alliance_invites(user_id);
