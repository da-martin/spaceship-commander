-- Esfuerzo medio de los jugadores activos (partida guardada en los últimos 7 días),
-- sacado de ship.activity: los puntos de esfuerzo de cada día, sin contar hoy.
-- Solo devuelve cifras, sin nombres ni ids. Una fila por jugador, de más a menos esfuerzo.
--   media_dia         puntos al día en los últimos 14 días (los días sin nada cuentan como 0)
--   dias_activos      días con algo hecho de esos 14
--   media_dia_activo  puntos en los días con algo hecho
--   dias_corta/media/larga  días que tardaría en una misión de 15, 30 y 60 puntos
-- Uso: npx wrangler d1 execute spaceship-commander --remote --command "$(cat scripts/esfuerzo-jugadores.sql)"
WITH act AS (
  SELECT s.user_id, CAST(j.value AS REAL) AS ef
  FROM saves s, json_each(s.data, '$.ship.activity') j
  WHERE s.updated_at > (CAST(strftime('%s','now') AS INTEGER) - 7*86400) * 1000
    AND j.key >= date('now','-14 days') AND j.key < date('now')
),
per AS (
  SELECT user_id,
         SUM(ef) / 14.0 AS media,
         COUNT(CASE WHEN ef > 0 THEN 1 END) AS activos,
         SUM(ef) AS total
  FROM act GROUP BY user_id
)
SELECT ROUND(media, 1) AS media_dia,
       activos AS dias_activos,
       ROUND(total / MAX(1, activos), 1) AS media_dia_activo,
       ROUND(15 / media, 1) AS dias_corta,
       ROUND(30 / media, 1) AS dias_media,
       ROUND(60 / media, 1) AS dias_larga
FROM per WHERE media > 0
ORDER BY media DESC;
