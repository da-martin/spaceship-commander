-- Sustituye el acceso por OAuth por claves generadas con `npm run invite`.
--
-- Rehace las tres tablas en vez de hacer ALTER porque en el momento de escribir
-- esta migración no había ningún dato (0 usuarios, 0 sesiones, 0 partidas).
-- Si se aplica sobre una base con partidas, las borra.

DROP TABLE IF EXISTS sessions;   -- dependen de users por clave foránea
DROP TABLE IF EXISTS saves;
DROP TABLE IF EXISTS users;

-- `key_hash` es el SHA-256 de la clave. La clave en claro solo existe en el
-- momento de generarla: ni se guarda aquí ni en el navegador.
CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  key_hash   TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,          -- SHA-256 del token de la cookie
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user    ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE saves (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  rev        INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
