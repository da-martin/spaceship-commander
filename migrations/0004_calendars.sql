-- Calendarios iCal conectados a una cuenta.
--
-- Solo se guarda la URL: el Worker la descarga y la pasa tal cual, y el
-- cliente parsea. Parsear aquí se pasaría de los 10 ms de CPU del plan gratis.
--
-- La URL va en claro y es un secreto de quien la pega: las direcciones
-- privadas de Google dan lectura del calendario entero. Nunca sale de aquí:
-- la API devuelve id y nombre, no la URL.
CREATE TABLE IF NOT EXISTS calendars (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,             -- X-WR-CALNAME, o el host si no lo trae
  url        TEXT NOT NULL,             -- siempre https: (webcal: se reescribe)
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendars_user ON calendars(user_id);
