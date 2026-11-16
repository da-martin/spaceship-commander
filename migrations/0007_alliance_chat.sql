-- Chat de la alianza.
--
-- Solo añade.

-- `kind`: 'text' es un mensaje escrito por `user_id`; 'join', 'leave' y 'kick'
-- son avisos del sistema sobre `user_id` y no llevan texto.
-- El id crece solo y es lo que usa el cliente para pedir «lo nuevo desde aquí».
CREATE TABLE alliance_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL DEFAULT 'text',
  body        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_alliance_messages ON alliance_messages(alliance_id, id);

-- Hasta dónde ha leído cada miembro: el aviso de mensajes sin leer es el mismo
-- en todos sus dispositivos.
ALTER TABLE alliance_members ADD COLUMN last_read_id INTEGER NOT NULL DEFAULT 0;
