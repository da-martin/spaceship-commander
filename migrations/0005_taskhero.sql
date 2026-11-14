-- Cuenta de TaskHero conectada: lo que se completa aquí se completa allí, o se
-- envía su esfuerzo como tracker points.
--
-- La clave de API va en claro, como las URL de los calendarios, y es un secreto
-- de quien la pega: da acceso de escritura a su cuenta de TaskHero. Nunca sale
-- de aquí: la API solo dice si hay una conectada.
CREATE TABLE IF NOT EXISTS taskhero_links (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  api_key    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
