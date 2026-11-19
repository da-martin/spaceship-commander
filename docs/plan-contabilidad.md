# Contabilidad

Una pestaña nueva en Spaceship, junto a Nave, Alianza y VR Training. Muestra los próximos 7 días con las entradas y los gastos de ¢ previstos para cada día y el saldo que quedaría. Al pulsar una cifra se abre un modal que explica de dónde sale.

Solo cuenta los Megacréditos (¢). Los materiales no entran.

## Lo que falta hoy

La partida solo guarda el saldo (`state.wallet.mc`). No hay historial de lo que entró ni de lo que se gastó cada día. Lo más parecido es `state.ship.activity`, que cuenta puntos de esfuerzo y no ¢.

Con lo que hay se puede reconstruir una parte de las entradas: `x.grant` de las tareas, `h.g[día]` de los hábitos y `rew` de las misiones en la bitácora. Pero se pierde lo de las tareas borradas, los toques de hábitos libres que no son el primero del día, lo que da el Pilotaje en el Protocolo Forster, las ventas del mercado y las misiones que ya han salido de la bitácora.

Por eso el primer paso es un **libro de cuentas**.

## Libro de cuentas

- Nuevo `state.ship.books`: un total de ¢ por día, separado por categoría y por sentido:
  ```js
  books: {
    since: '2026-11-20',                 // primer día anotado
    days: { '2026-11-19': { in: {task:40, habit:25, free:6, mission:180},
                            out:{wages:90, yard:125} } }
  }
  ```
- Se guarda con la nave (y en la nube). Como `activity`, se borra lo de hace más de 30 días en `processDays`.
- `normShip` lo normaliza: se descartan las categorías desconocidas y los valores que no sean enteros ≥ 0.
- Módulo puro nuevo `core/books.js` con `earn(n,cat,day)`, `unearn(n,cat,day)` y `spend(n,cat,day)`. Al desmarcar algo se resta de la **categoría y el día en que se ganó** (`g.day`), no del día de hoy, igual que hace `onUndo` con la actividad.
- Se anota lo que de verdad se movió: `subW` no baja de 0, así que tiene que devolver lo que restó.

### Dónde se anota

| Categoría | Sentido | Dónde |
|---|---|---|
| `task` Tareas | entra | `grantTask` / `revokeTask` |
| `habit` Hábitos | entra | `checkHabit` / `uncheckHabit` |
| `free` Hábitos libres | entra | `tapFree` / `untapFree` |
| `mission` Misiones | entra | `finishContract` |
| `forster` Protocolo Forster | entra | `focusProgress` (Pilotaje) |
| `sale` Venta de material | entra | `sellMat` |
| `wages` Sueldos | sale | `crewPayroll`, `rehireCrew` |
| `crew` Contratos y ascensos | sale | `hireCrew`, `promoteCrew` |
| `debt` Deudas | sale | `payDebt` |
| `yard` Astillero | sale | `buildMod` |
| `repair` Reparaciones | sale | `repairMod` |
| `buy` Compra de material | sale | `buyMat` |
| `sweep` Barrido de señal | sale | `sweep` |

Un test recorre todos los `addW('mc'…)` y `subW('mc'…)` de `public/js` y falla si alguno no anota, para que un ingreso nuevo no se quede fuera sin que nadie lo vea.

### Partidas que ya existían

Durante la primera semana el libro tiene menos de 7 días. Para los días anteriores a `books.since`, las entradas se reconstruyen con lo que hay (tareas, hábitos y misiones de la bitácora) y el modal los marca como **estimados**. A los 7 días ya no hace falta.

## Previsión

Funciones puras en `core/books.js`, sin DOM, como pide `architecture.test.js`.

### Entradas: media de los 7 días anteriores

- Se suman las entradas de los 7 días anteriores a hoy. Hoy no cuenta porque está a medias.
- Se divide entre los días que hay historial, como hace `avgDaily`: quien empezó hace 3 días divide entre 3. Un día sin actividad dentro de ese tramo cuenta como 0.
- Las entradas previstas son las mismas para los 7 días: esa media redondeada.
- Sin ningún día de historial no hay previsión: «Aún no hay datos · vuelve mañana».

### Gastos: lo comprometido

Las mejoras, reparaciones, compras y barridos son gastos que se deciden cada vez y no se pueden prever. Lo único fijo son los **sueldos**:

- Cada tripulante con contrato (ni `idle`, ni `owed`, ni `cancel`) cobra `wageOf(m.wage)` el día `addDays(m.until,1)` y de nuevo cada 7 días. En 7 días cobra una vez, o dos si cobra hoy.
- El descuento del Salón es el de ahora. Si el Salón se daña o mejora, la cifra cambia.
- Los que tienen el contrato cancelado no cobran: se marchan ese día (sale como nota, sin cifra).
- Los que tienen sueldo pendiente no se cobran solos. No van en ningún día: salen como aviso arriba («Deuda pendiente con Lina Okafor: 26 ¢ y sube 7 ¢ al día»).

### Saldo previsto

- Saldo de cada día = saldo del día anterior + entradas previstas − gastos previstos. El primero parte del saldo de ahora.
- Como `crewPayroll` solo cobra si hay saldo para el sueldo entero, la previsión comprueba lo mismo. Si un día no alcanza, ese sueldo se marca en rojo: «Saldo insuficiente: Lina Okafor dejaría de trabajar». Es el aviso más útil de la pestaña.

## Pantalla

```
┌ Contabilidad ─────────────────────────────┐
│ Saldo  420 ¢   ·  en 7 días  ≈ 611 ¢      │
│ Media de entradas 38 ¢/día (13–19 nov)    │
│ Gastado la última semana: 215 ¢           │
├───────────────────────────────────────────┤
│ jue 20   +38 ¢              458 ¢         │
│ vie 21   +38 ¢   −90 ¢      406 ¢         │
│ sáb 22   +38 ¢              444 ¢         │
│ dom 23   +38 ¢              482 ¢         │
│ lun 24   +38 ¢              520 ¢         │
│ mar 25   +38 ¢              558 ¢         │
│ mié 26   +38 ¢   −45 ¢      551 ¢   ⚠     │
└───────────────────────────────────────────┘
```

- En el móvil es una lista de 7 filas. Desde `sm` es una rejilla de 7 columnas con una barra pequeña por día (verde la entrada, ámbar el gasto).
- **+38 ¢** y **−90 ¢** son botones: abren el modal de ese día. Un día sin gastos muestra «—» sin botón.
- Mismos estilos que la Nave: `mono` para las cifras y ámbar para los ¢.

### Modal de entradas

```
ENTRADAS PREVISTAS // VIE 21
≈ 38 ¢ — media de los 7 días anteriores

 jue 13    52 ¢
 vie 14    20 ¢
 …
 mié 19    41 ¢
 ──────────────
 Total    266 ¢ ÷ 7 días = 38 ¢

 Por origen (7 días)
 Tareas       120 ¢  45 %
 Hábitos       96 ¢  36 %
 Misiones      40 ¢  15 %
 Libres        10 ¢   4 %
```

- Los días reconstruidos llevan la marca «estimado».
- Si entre los 7 días hay una misión, se avisa: «Incluye 180 ¢ de una misión: sin ella, la media sería 12 ¢».

### Modal de gastos

```
GASTOS PREVISTOS // VIE 21
−90 ¢ — sueldos que se renuevan ese día

 Lina Okafor · Intendencia · Veterano
   90 ¢/sem − 0 % Salón = 90 ¢ · pagado hasta el jue 20

 No incluye gastos voluntarios: astillero, reparaciones,
 mercado ni barridos (215 ¢ la última semana).
```

## Código

- `index.html`: cuarto botón en `#shipTabs` (`data-stab="books"`) y `<main id="books-view">`, más un modal `#booksModal`.
- `ui/mode.js`: `books` es una pestaña más de Spaceship (`navMode`, la pestaña recordada en `STABKEY`, `setMode`).
- `ui/books-view.js`: pinta la pestaña y el modal.
- `core/books.js`: libro, previsión y desglose. Lo usan las funciones de `core/` y `ui/actions.js` de la tabla de arriba.
- `store.js`: `books` en `normShip` y en `freshState`.
- Tests nuevos en `test/books.test.js`: anotar y desmarcar en su día, media con menos de 7 días, sueldos que caen dos veces en la semana, cancelados, deudas, saldo que no alcanza y recorte a 30 días.

## Fases

1. **Libro**: `core/books.js`, anotaciones en todas las llamadas, normalización y tests. Se puede publicar sin la pestaña para que el libro ya tenga días cuando llegue.
2. **Previsión**: entradas, sueldos y saldo, con tests.
3. **Pestaña y modales**.
4. **Reconstrucción** de los días anteriores al libro, si hace falta. Con la fase 1 publicada una semana antes, sobra.
