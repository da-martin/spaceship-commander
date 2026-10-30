-- Acceso por usuario y contraseña, con registro abierto.
--
-- Solo añade: no rehace `users`. Con las claves foráneas activas, DROP TABLE
-- users hace un DELETE implícito que dispara el ON DELETE CASCADE y se llevaría
-- todas las partidas.
--
-- Por eso `key_hash` sigue siendo NOT NULL UNIQUE. En las cuentas de antes es
-- el SHA-256 de su clave, que sirve una sola vez como contraseña para elegir
-- una de verdad. En las cuentas nuevas es el de 32 bytes al azar: una clave que
-- no tiene nadie.

-- Formato de src/password.js. NULL = cuenta de antes que aún no eligió
-- contraseña.
ALTER TABLE users ADD COLUMN pass_hash TEXT;

-- El nombre es el usuario con el que se entra, y «Ana» y «ana» son la misma
-- persona. Falla si ya hay dos nombres que solo difieren en mayúsculas.
CREATE UNIQUE INDEX idx_users_name_nocase ON users(name COLLATE NOCASE);

-- Contadores de intentos (logins fallidos, registros) por usuario o por IP.
-- `k` es p. ej. 'login:user:ana' o 'signup:ip:203.0.113.7'.
CREATE TABLE auth_throttle (
  k        TEXT PRIMARY KEY,
  n        INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
