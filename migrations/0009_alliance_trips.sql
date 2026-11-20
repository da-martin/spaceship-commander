-- Viajes de la alianza a otros sistemas (docs/plan-viajes.md, fase 4).
--
-- Solo añade. Mientras la variable TRAVEL_ON del Worker no valga '1', nadie
-- escribe aquí.

-- Dónde está la alianza. NULL es el Sistema Madre.
ALTER TABLE alliances ADD COLUMN system TEXT;

-- Un viaje: se propone (open), zarpa (sailing) y llega (done); o se cancela por
-- mayoría de no (cancelled) o lo retira quien lo propuso (withdrawn). La
-- votación se resuelve al consultar la alianza: no hay cron.
-- `origin` y `dest` son ids de sistema ('madre' es el Sistema Madre).
CREATE TABLE alliance_trips (
  id          TEXT PRIMARY KEY,
  alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  origin      TEXT NOT NULL,
  dest        TEXT NOT NULL,
  proposed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  INTEGER NOT NULL,
  closes_at   INTEGER NOT NULL,
  departed_at INTEGER,
  arrives_at  INTEGER
);
CREATE INDEX idx_alliance_trips ON alliance_trips(alliance_id, created_at);
-- Una sola propuesta abierta o salto en curso por alianza, aunque dos miembros
-- propongan a la vez.
CREATE UNIQUE INDEX idx_alliance_trips_live ON alliance_trips(alliance_id) WHERE status IN ('open', 'sailing');

-- El voto de cada miembro. Se puede cambiar mientras la votación esté abierta.
CREATE TABLE alliance_trip_votes (
  trip_id  TEXT NOT NULL REFERENCES alliance_trips(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote     TEXT NOT NULL CHECK (vote IN ('yes', 'no')),
  voted_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);
