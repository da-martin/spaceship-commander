-- Cuentas, sesiones y partidas de Spaceship Commander.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,          -- uuid propio, no el del proveedor
  provider    TEXT NOT NULL,             -- 'google' | 'github'
  provider_id TEXT NOT NULL,             -- id del usuario en el proveedor
  email       TEXT,
  name        TEXT,
  avatar_url  TEXT,
  created_at  INTEGER NOT NULL,
  UNIQUE (provider, provider_id)
);

-- id = SHA-256 del token que viaja en la cookie. El token en claro nunca se
-- guarda, así que una filtración de la base no permite suplantar sesiones.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Una partida por usuario. `data` es el sobre {app,v,savedAt,data} que ya
-- produce buildSave() en el cliente. `rev` sube en cada escritura y es lo que
-- detecta conflictos entre dispositivos.
CREATE TABLE IF NOT EXISTS saves (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  rev        INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
