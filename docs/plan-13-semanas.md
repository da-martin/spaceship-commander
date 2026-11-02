# Plan: vista de 13 semanas + calendarios iCal en Spaceship Commander

## Contexto
El diseño del lienzo (https://claude.ai/artifact/7rcSPWxLVqarxzXpM5DJDr) añade a Commander y a Focus una lista de las próximas 13 semanas con los proyectos que vencen en cada una:
- **Escritorio:** un panel derecho que se muestra y se oculta.
- **Teléfono:** una pantalla dedicada.
- **Ajustes:** una sección "Calendarios" para importar eventos iCal.

Decisiones tomadas:
- Las URL de iCal se guardan **en el servidor (D1), por cuenta**, nunca en la partida.
- Por ahora se **ignoran los eventos recurrentes** (RRULE).
- Las semanas empiezan el **lunes**, con numeración ISO (S45…).

Repo: `da-martin/spaceship-commander`. Todo el cliente está en `public/index.html` (vanilla JS + Tailwind CDN) y el Worker en `src/index.js` (D1). No hay tests ni build.

Se hace en dos fases que se pueden publicar por separado.

---

## Fase 1 — Panel de 13 semanas (solo cliente, proyectos)

### Marcado (`public/index.html`)
- **Botón nuevo en la cabecera** `#btnWeeks`, junto a `#btnMenu`. Es de 44×44, con el estilo de `#btnMenu`, un ícono de calendario y una insignia `#weeksBadge` con los proyectos que vencen esta semana.
  - Se oculta en modo Spaceship (`setMode`).
  - Debe quedar visible en la fila superior también en Focus, donde `#navToggle` lleva `nav-off`.
- **Un solo `<aside id="weeksPanel">`** al final de `<body>`, oculto por defecto. Contiene:
  - una cabecera: `sys-label` "Horizonte", título "Próximas 13 semanas", rango y total, y el botón cerrar/volver `#weeksClose`;
  - un cuerpo desplazable `#weeksBody`.
  - En el teléfono, `#weeksClose` muestra la flecha "‹" y en escritorio la ✕. Ambas versiones van en el marcado y se alternan con `lg:hidden` / `hidden lg:inline`.

### CSS (bloque `<style>`)
- **`lg+` (≥1024 px):** el aside queda `position:fixed; top:<alto cabecera>; right:0; bottom:0; width:384px`, con fondo `#0d1526` y `border-left:1px solid #1f2a3d`. Con `body.weeks-open` se aplica `padding-right:384px`, así la cabecera sticky y los `main` se encogen sin tocar su `max-w-*`. El alto de la cabecera se lee con JS y se guarda en una variable CSS `--hdr-h`.
- **`<lg`:** el aside es pantalla completa, `fixed; inset:0; bottom:<alto #bottomNav>; z-index:35` (por encima de la cabecera z-30 y por debajo de la barra inferior z-40), con `padding-top` para la zona segura.
- Filas: se reutilizan los tokens que ya existen (`.sys-label`, colores `#1f2a3d`, `#94a3b8`, `#67e8f9`, rojo de atrasado `text-red-400`).

### Lógica (cerca de `renderProjects`, `public/index.html` ~l.1569)
- **Funciones nuevas:**
  - `isoWeek(dateStr)`: devuelve `{n, year}`.
  - `mondayOf(dateStr)`: usa `dayParse` y `addDays`, que ya existen (~l.956).
  - `weeksData()`: arma 13 cubos desde `mondayOf(todayStr())`. Cada uno lleva `{n, rangeLabel, monthKey, current, items}`. Además devuelve `overdue` (proyectos con `due < hoy`).
    - Los proyectos salen de `state.projects` con `due`.
    - Se reutilizan `projDue(p)` (texto y clase del vencimiento, ~l.870), `projTaskCount(p.id)` (avance hecho/total) y `fmtDate`.
    - En la fase 2 se añaden también los eventos de la caché.
- **`renderWeeks()`:** genera el HTML de `#weeksBody`. Usa `escapeHtml` y el mismo patrón `innerHTML` que el resto del archivo:
  - un bloque "Atrasados";
  - una cabecera fija (`position:sticky`) por mes;
  - una sección por semana, con "ESTA SEMANA" o "sin vencimientos";
  - filas ▣ con barra de avance.
  - También actualiza `#weeksBadge`.
  - Se llama al final de `render()` (~l.1730), así se refresca con cada cambio de proyectos o tareas.
- **Abrir y cerrar:**
  - En escritorio: `weeksOpen` se persiste en localStorage con la clave `spaceship-commander:weeks`, igual que `PROJ_OPEN_KEY`.
  - En teléfono: `weeksScreen` es efímero y no se persiste, para que la app no arranque en esa pantalla.
  - `applyWeeks()` decide con `matchMedia('(min-width:1024px)')` y escucha el cambio de tamaño. Alterna `body.weeks-open`, la visibilidad del aside y `aria-expanded` del botón.
  - `setMode('ship')` cierra la pantalla del teléfono y oculta el panel. Al volver a Commander o Focus, en escritorio se respeta `weeksOpen`.
- **Clic en un proyecto (opcional, barato):** pone `pFilter=p.id` y lleva a Commander > Tareas, reutilizando el filtro de proyectos que ya existe.

---

## Fase 2 — Calendarios iCal (Worker + D1 + Ajustes)

### D1: `migrations/0004_calendars.sql`
```sql
CREATE TABLE IF NOT EXISTS calendars (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, url TEXT NOT NULL, created_at INTEGER NOT NULL,
  fetched_at INTEGER, ok_at INTEGER, error TEXT, events TEXT  -- JSON ya filtrado a la ventana
);
CREATE INDEX IF NOT EXISTS idx_calendars_user ON calendars(user_id);
```
`events` funciona como caché en la propia fila. Así no hace falta KV ni ningún binding nuevo, y `wrangler.jsonc` no cambia.

### Worker (`src/index.js`)
- **Rutas nuevas en `handleApi`.** Todas exigen `currentUser`, con el mismo patrón que `/api/state`:
  - `GET /api/calendars`: devuelve `[{id, name, okAt, error, count}]`, **sin la URL**.
  - `POST /api/calendars {url}`:
    - valida `https:` o `webcal:` (este último se reescribe a `https:`);
    - impone un máximo de 10 por usuario;
    - descarga la URL **una vez** para validarla;
    - toma el nombre de `X-WR-CALNAME` o, si no hay, del host;
    - guarda la fila y responde 400 `{error:'not_ical'}` si la URL no es un calendario.
  - `DELETE /api/calendars/:id`: solo borra si la fila es del usuario.
  - `GET /api/calendars/events`: por cada calendario con `fetched_at` de más de 1 h, lo vuelve a descargar (en paralelo, `Promise.allSettled`). Si falla, guarda `error` y conserva los `events` anteriores. Devuelve `{events:[{cal, title, date, time|null, allDay}], calendars:[…estado]}`.
- **`fetchIcs(url)`:**
  - corta a los 8 s con `AbortSignal.timeout(8000)`;
  - acepta como máximo 2 MB leyendo el cuerpo por partes;
  - sigue redirecciones;
  - exige que el texto empiece por `BEGIN:VCALENDAR`.
- **`parseIcs(text, fromDate, toDate)`:** un parser mínimo propio, sin dependencias.
  - Desdobla las líneas partidas (línea que empieza por espacio o tabulador) y recorre los bloques `VEVENT`.
  - Lee `SUMMARY` (deshaciendo los escapes `\,` `\;` `\n`), `DTSTART` en sus tres formas (`;VALUE=DATE:`, `…Z` y `;TZID=…`) y `STATUS`.
  - **Descarta** los eventos con `RRULE`, `RECURRENCE-ID` o `STATUS:CANCELLED`.
  - Filtra a la ventana [lunes actual, +13 semanas]. Las horas se convierten a la zona del cliente, que llega como `?tz=` (`Intl.DateTimeFormat().resolvedOptions().timeZone`), usando `Intl` en el Worker.
- **Límite de uso:** se reutilizan `throttled` y `bump` con una clave `cal:<userId>` (por ejemplo, 20 altas por hora), para que nadie use el Worker como descargador.

### Cliente (`public/index.html`)
- **`normSettings` (~l.795):** se añade `showEvents:true`, el único dato nuevo que va en la partida (un booleano, nada secreto).
- **Ajustes (`#settingsModal`, ~l.611):** se añade una sección "Calendarios" con este marcado:
  - el interruptor `#setEvents` (clase `.switch`, que ya existe);
  - la lista `#calList`;
  - un formulario con `#calUrl` y "+ Añadir";
  - `#calMsg`, con el estilo de error de `#importMsg`;
  - el texto de ayuda de Google.
  - **Sin sesión** (`cloud.user` es nulo) se muestra un aviso: "Entra en tu cuenta para conectar calendarios", que abre el `authModal` existente.
  - **Quitar un calendario pide dos toques**, con el patrón de `offerDiscarding` y `crewReleasing`.
  - `paintSettings()` (~l.2336) se amplía, y `openSettings()` llama a `loadCalendars()`.
- **Caché de eventos:** se guarda en localStorage con la clave `spaceship-commander:ical` como `{at, tz, events}`.
  - `loadCalEvents()` se dispara al iniciar con sesión, al volver el foco si la caché tiene más de 1 h, y al añadir o quitar un calendario.
  - Al cerrar sesión se borra la caché.
- **`weeksData()`** mete los eventos en el cubo de su semana solo si `state.settings.showEvents` está activo. Las filas de evento llevan ícono de calendario, texto `#cbd5e1` y la meta "jue 5 · 10:00".

### Documentación
- En `docs/despliegue.md` se añade `npm run db:remote` para la migración 0004, y que el Worker ahora hace peticiones salientes a URLs iCal.

---

## Archivos
- `public/index.html`: botón, aside, CSS, `renderWeeks`/`weeksData`, sección de Ajustes y caché de eventos.
- `src/index.js`: rutas `/api/calendars*`, `fetchIcs` y `parseIcs`.
- `migrations/0004_calendars.sql` (nuevo).
- `docs/despliegue.md`.

## Verificación
1. `npm run db:local && npm run dev` y abrir http://localhost:8787.
2. **Fase 1.** Crear proyectos con fechas en esta semana, dentro de 3 semanas, de aquí a 13 semanas, más allá de 13 semanas y en el pasado. Comprobar que:
   - cada uno cae en su semana (ISO, empezando el lunes);
   - el atrasado sale en rojo;
   - la insignia cuenta los de esta semana;
   - el panel se abre y se cierra y el estado se recuerda al recargar;
   - con el ancho a menos de 1024 px aparece la pantalla completa con "‹";
   - en Spaceship se oculta;
   - en Focus (Preparar y Trabajar) se ve igual.
3. **Fase 2.** Con una cuenta local:
   - añadir un `.ics` público (por ejemplo, el de feriados de Google) y ver nombre, recuento y eventos en las semanas;
   - pegar la URL normal de Google Calendar y ver el error;
   - quitar un calendario con los dos toques;
   - apagar "Mostrar eventos" y comprobar que desaparecen.
4. **Seguridad.** Exportar la partida y confirmar que el código no contiene la URL. Llamar a `GET /api/calendars` sin sesión y comprobar que responde 401.
5. **Parser.** Probarlo con un script de Node suelto en el scratchpad, con un `.ics` de prueba que incluya un evento de día completo, uno con `TZID`, uno con `Z`, uno con `RRULE` (que se descarta) y líneas partidas.
