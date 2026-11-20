-- Viajes de la alianza (docs/plan-viajes.md, fase 4): dónde está y qué
-- viaje se vota o se está haciendo.
--
-- Solo añade.

-- Sistema en el que está la alianza: el id de public/js/systems.js. Cambia al
-- zarpar (durante el salto ya es el de destino).
ALTER TABLE alliances ADD COLUMN system TEXT NOT NULL DEFAULT 'madre';

-- Un viaje propuesto. `status`: 'open' (en votación), 'sailing' (saltando),
-- 'done' (llegó), 'withdrawn' (lo retiró quien lo propuso) o 'cancelled'
-- (mayoría de no, o nadie dijo que sí). Al zarpar se fijan `departed_at` y
-- `arrives_at`: el salto es el mismo para todos.
CREATE TABLE alliance_trips (
  id          TEXT PRIMARY KEY,
  alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  from_system TEXT NOT NULL,
  to_system   TEXT NOT NULL,
  proposed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  closes_at   INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  departed_at INTEGER,
  arrives_at  INTEGER
);
CREATE INDEX idx_alliance_trips ON alliance_trips(alliance_id, created_at);
-- Una sola votación abierta por alianza, aunque dos propongan a la vez.
CREATE UNIQUE INDEX idx_alliance_trips_open ON alliance_trips(alliance_id) WHERE status = 'open';

-- El voto de cada miembro. Solo cuentan los de quien sigue en la alianza.
CREATE TABLE alliance_trip_votes (
  trip_id  TEXT NOT NULL REFERENCES alliance_trips(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote     TEXT NOT NULL CHECK (vote IN ('yes', 'no')),
  voted_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);
