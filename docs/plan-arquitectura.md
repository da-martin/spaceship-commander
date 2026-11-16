# Arquitectura y refactor del cliente

La app empezó como un `index.html` suelto y ha crecido a hábitos, tareas, proyectos, economía, nave, tripulación, misiones, bitácora, modo Focus, repaso de ayer, 13 semanas, calendarios iCal, TaskHero, nube y PWA. Esta es la revisión de noviembre de 2026 y el plan que sale de ella.

## Veredicto

**La arquitectura se queda.** PWA estática con la partida en `localStorage`, un Worker fino y D1 guardando la partida como un solo JSON con `rev` es lo adecuado para una app de un usuario, que funciona sin conexión y calcula la economía en el cliente. No compensa pasar a un framework, mover la economía al servidor, partir la partida en tablas ni migrar a TypeScript: cuesta mucho, arriesga regresiones sin tests y no ataca lo que duele.

**Lo que dolía era el cliente**: ~3.700 líneas de JS en un único `<script>` dentro de `index.html`, ~250 funciones, ~30 variables globales de la vista, la lógica del juego mezclada con el DOM y ningún test.

El Worker (`src/index.js`, ~600 líneas) se lee bien; partirlo es secundario.

## Fase 1 — Módulos ES (hecha)

El script salió de `index.html` a `public/js/`, sin bundler ni paso de build. Cambio de forma, no de comportamiento: con el azar y el reloj fijados, la misma partida antigua da el mismo estado y el mismo texto en pantalla que antes, al cargar y tras repasar el día, completar, crear tareas, mejorar y reparar módulos, comprar y vender y aceptar una misión.

```
public/js/
  main.js        arranque: carga la partida, llama al init() de cada módulo y arranca los relojes
  config.js      tablas y constantes (no importa nada de la app)
  util.js        fechas 'AAAA-MM-DD', formato, azar
  missions.js    catálogo de misiones
  store.js       la partida: normState (también partidas antiguas), load, save, setState
  core/          reglas del juego: rewards, projects, ship, missions, day, crew, shipyard, habits, log, events
  lib/ics.js     parser iCal
  ui/            vistas: commander (render), actions, rows, projects, weeks, ship-view, crew-view, alliance-view, alliance-chat, modal, settings, mode, toast, view
  features/      saves, review, log, focus
  integrations/  calendars, taskhero, taskhero-import, taskhero-modal
  sync/          cloud, auth, alliance
```

Reglas que hay que respetar al tocarlo:

- **`state` no se reasigna.** Lo importan todos los módulos; para sustituir la partida entera se usa `setState()` (`store.js`).
- **Una variable `let` solo se reasigna en su propio módulo.** Si varios módulos tienen que cambiarla, va en `view` (`ui/view.js`).
- **Al importarse, un módulo solo declara.** Lo que engancha botones va en su `init()`, y `main.js` los llama en orden. Así los imports circulares (p. ej. `core/` ↔ `render()`) no dan problemas: solo se usan dentro de funciones.
- **Tailwind** lee también `public/js/**/*.js`: las clases de las plantillas viven ahí.
- **Service worker**: los módulos van con red primero (mezclar versiones de módulos rompería la app) y la página le pasa la lista de los que ha cargado para que la app abra sin conexión desde la primera visita.

## Fase 2 — Núcleo puro y tests (hecha)

`core/`, `store.js`, `util.js`, `config.js` y `lib/` ya no dependen de la vista: no importan nada de `ui/`, `features/`, `sync/` ni `integrations/`, no tocan el DOM y se pueden importar desde Node. Con el azar y el reloj fijados, la app sigue dando el mismo estado, el mismo texto y los mismos avisos que antes.

- **Acciones de botón → `ui/actions.js`.** Contratar, aceptar, barrer o descartar misiones, mejorar, reparar, comprar y vender, borrar proyectos, completar tareas y marcar hábitos: aplican la regla de `core/`, guardan, repintan y avisan.
- **Avisos → `core/events.js`.** Cuando la lógica necesita que pase algo en la vista, emite un aviso y `main.js` decide quién lo atiende: `saved` (la nube programa la subida), `log`/`logged` (bitácora), `rankUp` (ascenso) y `track` (cola de TaskHero). Los oyentes corren en el acto y en orden.
- **Bitácora → `core/log.js`.** La entrada se guarda en la partida; qué se marca como leído, el aviso y el informe los decide `features/log.js`.
- **Cambio de día partido en dos.** `processDays()` (`core/day.js`) aplica la regla sin guardar; `dailyTick()` (`features/review.js`) pide antes el repaso de ayer y guarda.
- **Tests:** `npm test` (`node --test`, sin dependencias, con `TZ=Europe/Madrid`). Cubren la migración de partidas antiguas, la paga y su devolución al desmarcar, el astillero y el mercado, las misiones (cuotas, plazos, urgentes, ofertas y señal), el cambio de día, las fechas alrededor del cambio de hora y el parser iCal. `test/architecture.test.js` hace cumplir la regla de arriba.

Regla nueva: **una función de `core/` no guarda, no pinta y no avisa.** Si hace falta que la vista reaccione, se emite un aviso.

## Fase 3 — Partir el Worker (opcional)

`src/index.js` → `src/lib/http.js` (json, cookies, readBody), `src/lib/throttle.js`, `src/session.js` y `src/routes/{auth,state,calendars,taskhero}.js`, con `index.js` solo de router. Sin frameworks.

## Solo si llega a doler

- Render por vista en vez de repintarlo todo en cada toque, si en el móvil se nota.
- Delegación de eventos con `data-action` en vez de `.onclick` sueltos.
- `// @ts-check` + JSDoc en `core/` si los tipos de la partida empiezan a confundir.

## A vigilar

- **Tamaño de la partida**: el historial de cada hábito crece cada día y el Worker corta en 1 MB. A largo plazo, `normState` debería podar o compactar lo antiguo.
- **Secretos en claro en D1**: URL privadas de calendarios y la clave de TaskHero. Cifrarlas con AES-GCM y una clave en un secret del Worker es barato.
- La partida lleva `v:1`, pero las migraciones son implícitas en `normState`. Si un día se renombra un campo, pasos de migración por versión.
