-- Lo que cada miembro comparte con su alianza: el porcentaje de su día.
--
-- Solo añade. No guarda tareas ni hábitos, ni siquiera cuántos son: solo el
-- porcentaje hecho y de qué día es. NULL en `progress_pct` con día puesto
-- significa «hoy no tenía nada programado»; NULL en `progress_day`, que no
-- comparte (o aún no ha publicado nada).
--
-- Los hitos (ascensos y misiones completadas) son mensajes del chat con
-- `kind` 'rank' y 'mission': no necesitan tabla.
ALTER TABLE alliance_members ADD COLUMN progress_day TEXT;
ALTER TABLE alliance_members ADD COLUMN progress_pct INTEGER;
