# Contabilidad

Una pestaña nueva en Spaceship, junto a Nave, Alianza y VR Training. Muestra los próximos 7 días, **de mañana a dentro de 7 días**, con las entradas y los gastos de ¢ previstos para cada día y el saldo que quedaría. Al pulsar una cifra se abre un modal que explica de dónde sale.

Lo primero que se hace es el **aviso de impago**: decir con días de antelación qué tripulante no podrá cobrar y cuánto falta para pagarle.

Solo cuenta los Megacréditos (¢). Los materiales no entran.

## Aviso de impago

### Qué pasa hoy

`crewPayroll` cobra los sueldos al cambiar de día, la primera vez que se abre la app. Recorre la tripulación en orden y a cada uno le cobra el sueldo entero si hay saldo. Si no hay, ese tripulante queda con sueldo pendiente: deja de trabajar (sin bono ni experiencia) y su deuda sube cada día. El siguiente de la lista puede cobrar si su sueldo es más bajo y aún alcanza.

El único aviso que hay ahora es `#crewWarn` en el panel de tripulación. Sale solo si el saldo de ahora no llega a los sueldos de toda la semana juntos. No dice quién ni cuándo, y avisa aunque el primer cobro sea dentro de 6 días.

### Qué calcula

Una función pura en `core/books.js` repite `crewPayroll` día a día durante los próximos 7 días, con el mismo orden y la misma regla (sueldo entero o nada):

- **Cuándo cobra cada uno:** el día `addDays(m.until,1)` y de nuevo cada 7 días. Solo los que tienen contrato y no lo han cancelado (ni `idle`, ni `owed`, ni `cancel`). El sueldo es `wageOf(m.wage)`, con el descuento del Salón de ahora.
- **Con qué saldo cuenta ese día:** el sueldo se cobra al empezar el día, antes de ganar nada. Así que para un cobro el día D cuenta el saldo de ahora + las entradas previstas de mañana a D−1 − lo ya cobrado. Lo que se gane hoy desde ahora no cuenta: es margen a favor.
- **Dos escenarios para cada cobro:**
  - **No alcanza** (rojo): no hay saldo ni con las entradas previstas.
  - **Justo** (ámbar): con las entradas previstas alcanza, pero con el saldo de ahora solo no. Depende de lo que ganes.
  - Sin marca: alcanza con el saldo de ahora.
- **Cuánto falta:** sueldo − saldo previsto ese día. Es la cifra que se puede usar para decidir algo: «Faltan 34 ¢».
- Si un cobro falla, la simulación sigue como el juego: ese tripulante deja de cobrar y los demás pueden cobrar con el saldo que queda.

Mientras no haya previsión de entradas, el aviso se calcula solo con el saldo de ahora: es el peor caso y ya sirve. Hecho así en la fase 1: `payForecast` en `core/crew.js` y el aviso en `#crewWarn`, en ámbar, con el cobro de mañana en rojo porque ya solo queda lo que se gane hoy.

### Dónde sale

- **Pestaña Contabilidad:** banda arriba, antes de los días:
  > ⚠ **vie 21 · Lina Okafor no cobrará** — sueldo 90 ¢, saldo previsto 56 ¢. Faltan 34 ¢.

  Un aviso por cobro en riesgo, primero el más cercano. El día también se marca en la lista y su gasto sale en rojo o ámbar.
- **Panel de tripulación (Nave):** `#crewWarn` deja de comparar con la semana entera y usa este cálculo: «Lina Okafor cobra el vie 21 (90 ¢) y faltan 34 ¢». En la tarjeta del tripulante, una línea «Próximo cobro: vie 21 · en riesgo».
- **Punto en la pestaña** Contabilidad (como `data-logdot` en Nave) si hay algún cobro en rojo. Se enciende también el del botón Spaceship desde Commander, porque es donde más tiempo se pasa.
- No hay aviso emergente: se ve al entrar, igual que la bitácora.

El modal del gasto de ese día (abajo) explica el cálculo paso a paso.

## Libro de cuentas

La partida solo guarda el saldo (`state.wallet.mc`). No hay historial de lo que entró ni de lo que se gastó cada día, y hace falta para prever las entradas.

- Nuevo `state.ship.books`: un total de ¢ por día, separado por categoría y por sentido:
  ```js
  books: {
    since: '2026-11-20',                 // primer día anotado
    days: { '2026-11-19': { in: {task:40, habit:25, free:6, mission:180},
                            out:{wages:90, yard:125} } }
  }
  ```
- Se guarda con la nave (y en la nube). Se borra lo de hace más de 30 días en `processDays`, como `activity`.
- `normShip` lo normaliza: se descartan las categorías desconocidas y los valores que no sean enteros ≥ 0.
- `core/books.js` tiene `earn(n,cat,day)`, `unearn(n,cat,day)` y `spend(n,cat,day)`. Al desmarcar algo se resta de la **categoría y el día en que se ganó** (`g.day`), no del día de hoy, igual que hace `onUndo` con la actividad.
- Los gastos solo se hacen si hay saldo para pagarlos enteros, así que se anota la cifra que se cobra. Lo que se desmarca se resta entero de su día (sin bajar de 0).

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

Antes de `books.since` no hay libro. Para esos días, las entradas se reconstruyen con lo que hay (`x.grant` de las tareas y de las acciones rápidas del Forster, `h.g[día]` de los hábitos, `g.tap × h.log[día]` de los libres y `rew` de las misiones de la bitácora) y el modal las marca como **estimadas**. Se pierden las tareas borradas, el Pilotaje y las ventas. El día en que empezó el libro solo se anotó desde que se abrió: de cada categoría se queda lo mayor entre el libro y lo reconstruido. A las dos semanas ya no hace falta.

Los días anteriores al primer día con historial (el libro o la actividad más antigua) no cuentan como días a cero: la partida aún no existía.

## Previsión de entradas

Para cada día, **lo que entró el mismo día de la semana pasada**:

- Para mañana hasta dentro de 6 días, el día de referencia es D−7, es decir, de hace 6 días a ayer.
- Para dentro de 7 días el día de la semana es el de hoy. Hoy está a medias, así que se usa el de hace 7 días (D−14).
- Sin datos de ese día (partida de menos de una semana), se usa la media de los días que sí hay, y se marca «media: aún no hay datos del mismo día».
- Sin ningún día de historial: «Aún no hay datos · vuelve mañana». Entonces solo hay aviso de impago en el peor caso.
- Si el día de referencia incluye una misión, cuenta igual, pero el modal lo avisa: «Incluye 180 ¢ de una misión: sin ella serían 12 ¢».

## Previsión de gastos

Solo los **sueldos**, que son el único gasto con fecha. Son los mismos cobros que usa el aviso de impago.

- Las mejoras, reparaciones, compras y barridos se deciden cada vez y no se prevén. El modal lo dice y muestra cuánto se gastó en eso la semana pasada.
- Los que tienen el contrato cancelado no cobran: se marchan ese día (sale como nota, sin cifra).
- Los que tienen sueldo pendiente no van en ningún día. Salen arriba, junto al aviso de impago: «Deuda pendiente con Lina Okafor: 26 ¢ y sube 13 ¢ al día».

## Saldo previsto

Saldo de cada día = saldo del día anterior − sueldos cobrados al empezar el día + entradas previstas. El primero parte del saldo de ahora.

## Pantalla

La pestaña se llama **Cuentas** en el móvil y **Contabilidad** desde `sm`.

```
┌ Contabilidad ──────────────────────────────┐
│ ⚠ vie 21 · Lina Okafor no cobrará          │
│   sueldo 90 ¢ · saldo previsto 56 ¢        │
│   Faltan 34 ¢                              │
├────────────────────────────────────────────┤
│ Saldo 20 ¢   ·  en 7 días ≈ 287 ¢          │
│ Gastado la última semana: 215 ¢            │
├────────────────────────────────────────────┤
│ jue 20   +36 ¢                    56 ¢     │
│ vie 21   +41 ¢   −90 ¢ ⚠          97 ¢     │
│ sáb 22   +12 ¢                   109 ¢     │
│ dom 23    +8 ¢                   117 ¢     │
│ lun 24   +60 ¢                   177 ¢     │
│ mar 25   +52 ¢                   229 ¢     │
│ mié 26   +58 ¢                   287 ¢     │
└────────────────────────────────────────────┘
```

En el ejemplo, el cobro del viernes falla: 90 ¢ no salen del saldo de 56 ¢. Por eso el saldo de ese día sigue subiendo.

- En el móvil es una lista de 7 filas. Desde `sm` es una rejilla de 7 columnas con una barra pequeña por día (verde la entrada, ámbar el gasto, rojo el que no se cobra).
- **+41 ¢** y **−90 ¢** son botones que abren el modal de ese día. Un día sin gastos muestra «—» sin botón.
- Mismos estilos que la Nave: `mono` para las cifras y ámbar para los ¢.

### Modal de entradas

```
ENTRADAS PREVISTAS // VIE 21
≈ 41 ¢ — lo que entró el vie 14

 Tareas       20 ¢   2 tareas
 Hábitos      15 ¢   3 hábitos
 Libres        6 ¢   3 toques
 ──────────────
 Total        41 ¢

 Semana pasada: jue 36 · vie 41 · sáb 12 · dom 8 · lun 60 · mar 52 · mié 58
```

- La línea de la semana marca el día de referencia y los días reconstruidos («est.»).
- El número de tareas y hábitos se saca de sus `grant` y `g[día]`. Del libro solo sale el total por categoría.

### Modal de gastos

```
GASTOS PREVISTOS // VIE 21
−90 ¢ — sueldos que se renuevan ese día

 Lina Okafor · Intendencia · Veterano
   90 ¢/sem − 0 % Salón = 90 ¢ · pagado hasta el jue 20

 ⚠ No alcanza
   Saldo ahora                      20 ¢
   + entradas previstas jue 20      36 ¢
   = saldo al empezar el vie 21     56 ¢
   Faltan 34 ¢. Si no cobra, deja de trabajar y su
   deuda sube 13 ¢ al día.

 No incluye gastos voluntarios: astillero, reparaciones,
 mercado ni barridos (215 ¢ la última semana).
```

## Código

- `index.html`: cuarto botón en `#shipTabs` (`data-stab="books"`, «Cuentas» / «Contabilidad»), `<main id="books-view">` y el modal `#booksModal`.
- `ui/mode.js`: `books` es una pestaña más de Spaceship (`navMode`, la pestaña recordada en `STABKEY`, `setMode`).
- `ui/books-view.js`: pinta la pestaña, el aviso y el modal.
- `ui/crew-view.js`: `#crewWarn` y la línea de próximo cobro usan el cálculo del impago.
- `core/books.js`: cobros previstos, impago, libro, previsión y desglose. Lo usan las funciones de `core/` y `ui/actions.js` de la tabla.
- `store.js`: `books` en `normShip` y en `freshState`.
- `test/books.test.js`:
  - Impago: orden de cobro, sueldo entero o nada, un sueldo más bajo que cobra tras uno que falla, dos cobros del mismo tripulante en la semana, cancelados, deudas, Salón.
  - Escenarios rojo y ámbar, y lo que falta.
  - Libro: anotar y desmarcar en su día, y el recorte a 30 días.
  - Previsión: mismo día de la semana pasada, D−14 para dentro de 7 días, la media cuando falta el día, y la misión en el día de referencia.

## Fases

1. ✅ **Aviso de impago (peor caso)**: cobros previstos y simulación con el saldo de ahora, el aviso en el panel de tripulación (sustituye al `#crewWarn` de ahora) y tests. No necesita el libro y se puede publicar ya.
2. ✅ **Libro de cuentas**: anotaciones en todas las llamadas, normalización y tests. Cuanto antes se publique, antes habrá una semana de datos reales.
3. ✅ **Previsión de entradas**: mismo día de la semana pasada, con la reconstrucción para los días sin libro. El aviso de impago gana el ámbar. Hecho en `core/books.js` (`pastIn`, `incomeForecast`, `incomeFn`); `payForecast` marca `tight` y `rely` (lo que hace falta ganar antes).
4. **Pestaña Contabilidad y modales**, con el punto de aviso.
