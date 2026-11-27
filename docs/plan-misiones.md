# Misiones sin plazo: distancia, amenazas y rasgos

Hoy la cuota de una misión es `días × ritmo medio de 14 días × push`, y `push` vale 0,95, 1,10 o 1,25 según la dificultad. Una misión normal pide un 10 % más que tu media. Si la cumples, la media sube y la siguiente pide un 10 % más sobre la media nueva: el listón no deja de subir. Además, el plazo hace que importe el volumen por día y no la constancia.

Este plan cambia el modelo:

1. **Distancia** (fase A): la misión es un tramo fijo de puntos, sin plazo. El plazo pasa a ser una bonificación opcional.
2. **Amenaza y escudo** (fase B): cada noche de misión hay un impacto contra la nave. El escudo lo bloquea, pero tarda en recargarse.
3. **Rasgos** (fase C): modificadores que cambian *qué* cuenta y *cuánto*, no la cantidad que se pide.

Cada fase se puede publicar por separado. La fase A ya quita el problema de raíz.

Las rutas por etapas (idea 4) y las habilidades de tripulación (idea 5) quedan fuera de este plan. Se apoyarán en el escudo y en los rasgos.

## Reglas de fondo

- **La dificultad nunca sube la cuota.** `push` desaparece (vale 1 en todas). La dificultad cambia el daño, los rasgos y la paga.
- **Sin plazo no se pierde nunca la misión por tiempo.** Ir despacio cuesta desgaste y la bonificación, nada más.
- **Abandonar sigue igual**: sin cobro, y con la urgente, reputación dañada.
- Lo que ya está en marcha no se migra: los contratos y ofertas de antes terminan con las reglas de antes (ver *Partidas guardadas*).

## Fase A · Distancia

### Tamaño de la misión

Cada oferta sortea un tamaño, independiente de la dificultad:

| Tamaño | Días de crucero | Probabilidad |
|---|---|---|
| Corta | 3 | 35 % |
| Media | 5 | 45 % |
| Larga | 8 | 20 % |

- `distancia = días de crucero × ritmo de referencia` (mínimo 2). Se fija al generar la oferta y no cambia después.
- **Ritmo de referencia**: el `avgDaily()` de ahora (media de los últimos 14 días, mínimo 1,5), **sin push**.
- Por qué ya no se acumula: si tu ritmo sube, la siguiente misión tiene más puntos, pero sigue durando los mismos días. Ninguna misión te pide hacer más al día que tu media; solo cambia cuánto tardas.
- El tablón muestra «Media · ~5 días a tu ritmo», no los puntos en grande (los puntos van al lado, en pequeño).

### Paga

- `¢ = distancia × 12 × pay de la dificultad`, como las misiones sin plazo de ahora. La Bodega y Navegación se aplican al cobrar, como siempre.
- Material: `rollMats(días de crucero, D)`.
- **Bonificación de rapidez: +25 % de ¢** si la misión se completa antes de `aceptación + (días de crucero + 1) × 24 h`. Al ritmo de siempre se consigue con un día de margen, así que premia la constancia, no hacer más. Se guarda como `bonusAt` en el contrato.
- La paga no sube por días en el tablón (como pasa ya con las de sin plazo).

### Urgentes

- Son las únicas misiones con plazo (`kind:'run'`). Se mantienen el 20 % de probabilidad, la paga +50 % y la reputación dañada si fallan.
- Su cuota pasa a `días × ritmo` (sin push). Se eligen a propósito: son el reto para quien quiere presión.
- Salen del catálogo sin `open:true` (sus textos `partial` y `fail` hablan de plazos).

### Motores

«+1 día de duración máx.» deja de tener sentido sin plazo. Pasa a: **+6 % de avance en misión por nivel efectivo** (cada punto de esfuerzo cuenta 1 + 0,06 × nivel; con nivel 5, +30 %). `maxDays()` sigue usándose para la duración de las urgentes.

### Cambios en el código

| Dónde | Qué |
|---|---|
| `config.js` | `SIZES = {short:{days:3,w:.35}, mid:{days:5,w:.45}, long:{days:8,w:.20}}`, `SPEED_BONUS = 0.25`, `ENGINE_PUSH = 0.06`. Quitar `push` de `DIFFS`. `OPEN_P` deja de usarse: toda oferta no urgente es sin plazo. Texto de Motores en `MODS`. |
| `core/missions.js` | `genOffer()`: urgente → `run` como ahora, sin push; si no, `genOpenOffer()`. `genOpenOffer()` y `storyOffer()` sortean el tamaño y guardan `size` y `cruise`. `pickMission(open)` pasa a filtrar «puede salir sin plazo» (todas) o «puede salir urgente» (las que no son `open`). `contractFrom()` añade `bonusAt`. `freshOffer()`: la oferta «segura» ya no hace falta para el plazo, solo para la dificultad (fácil o normal). |
| `core/ship.js` | `addEffort()`: multiplica por `1 + ENGINE_PUSH × eff('engines')` lo que suma a la misión (no lo que suma a `activity`). Al completar, aplica la bonificación si `Date.now() < c.bonusAt`. Guarda en `g.cef` lo que contó para la misión, para que `onUndo()` reste exactamente eso. |
| `core/crew.js` | `missionCrewXp()`: sin plazo, los días de experiencia se limitan a `cruise × 2`, para que ir despacio no dé más experiencia. |
| `ui/ship-view.js` | Tarjeta de oferta: tamaño, «~N días a tu ritmo» y bonificación. Panel de misión: «Bonificación +25 % si llegas antes del vie 30, 18:00». Texto de Motores en el astillero. |
| `config.js` `UPDATES` | Una novedad explicando el cambio. |

## Fase B · Amenaza y escudo

### Amenaza

Cada misión sin plazo trae una amenaza según su tema. Por ahora solo cambia el nombre y el texto; la mecánica es la misma:

| Tema | Amenaza | Barra de progreso |
|---|---|---|
| Escolta, Patrulla | Piratas | Casco enemigo |
| Minería | Lluvia de asteroides | Mineral extraído |
| Exploración, Reconocimiento | Radiación | Distancia |
| Rescate | Fallos estructurales | Rescate |
| Transporte, Chárter | Saboteadores | Distancia |

Datos: `THREATS` en `config.js` (`id`, `name`, `bar`, `hit`, que es la frase del impacto, y `topics`). La amenaza se guarda en la oferta (`threat`) al generarla.

### Impactos

- **Uno cada noche de misión, al cambiar de día.** El día en que se acepta no hay impacto. Se resuelve en `processDays()`, dentro del bucle de días, después del repaso de ayer: así lo marcado en el repaso ya cuenta para los rasgos de la fase C.
- Si la misión se completó ese día, no hay impacto.
- Si no has abierto la app en varios días, hay un impacto por noche, hasta 7 como mucho (el mismo tope que el desgaste).
- **Daño fijo, no depende de tu ritmo**: puntos de estado en un módulo general, con el reparto rotativo de `wear()`. Ingeniería lo reduce como cualquier desgaste.

| Dificultad | Impacto normal | Impacto fuerte (×2) |
|---|---|---|
| Fácil | 4 % | 8 % |
| Normal | 6 % | 12 % |
| Difícil | 8 % | 16 % |

- **Se avisa antes**: después de cada impacto (y al aceptar) se sortea si el siguiente será fuerte (30 %). El panel lo dice: «Próximo impacto esta noche · **fuerte**». Es lo que da sentido a elegir cuándo usar el escudo.
- Cada impacto va a la bitácora como entrada pequeña (`kind:'mission'`, `tone:'warn'`): «Piratas: impacto en Motores −6 %» o «Escudo: impacto bloqueado».

Referencia: una misión media normal (5 noches, 1 o 2 bloqueadas, 30 % fuertes) deja unos 25 puntos de estado repartidos. Es más o menos lo que desgastan 5 hábitos fallados, y se repara en el astillero o a bordo como siempre.

### Escudo deflector

- Botón en el panel de misión. **Al activarlo, bloquea el siguiente impacto** (el de esta noche).
- **Recarga**: después de bloquear, no se puede usar en los dos impactos siguientes. Bloquea como mucho uno de cada tres.
- Cada misión empieza con el escudo cargado.
- Estados del botón: «Activar escudo» · «Escudo activo: protegerá el impacto de esta noche» · «Recargando: listo el jueves».
- Se puede desactivar el mismo día sin gastarlo (por si se activa sin querer).
- Más adelante, la idea 5 (habilidades de tripulación) y un posible módulo Escudos mejorarán la recarga. Ahora no se añade módulo, para no tocar el nivel de la nave ni el dibujo.

### Cambios en el código

| Dónde | Qué |
|---|---|
| `config.js` | `THREATS`, `HIT = {easy:4, normal:6, hard:8}`, `HEAVY_P = 0.3`, `SHIELD_GAP = 2`. |
| `core/missions.js` | La amenaza al generar la oferta. Contrato: `shield:{armed:false, readyOn:día}`, `heavy:bool`, `hits:0`, `blocked:0`. Funciones `missionNight(día)` (resuelve el impacto) y `armShield()` / `disarmShield()`. |
| `core/day.js` | `processDays()`: en el bucle de días llama a `missionNight(day)` y junta sus líneas para la bitácora. |
| `ui/ship-view.js` | La barra con la etiqueta de la amenaza. Línea «Próximo impacto», botón del escudo y resumen «3 impactos · 1 bloqueado». |
| `ui/actions.js` | Acciones del escudo (activar y desactivar, `save()` y `render()`). |

## Fase C · Rasgos

Cada misión sin plazo trae rasgos que cambian cómo cuenta el esfuerzo **para la misión**. Las ¢, los méritos y el material de cada tarea o hábito no cambian.

| Rasgo | Tipo | Efecto |
|---|---|---|
| Viento solar | favorable | Lo Difícil y lo Épico cuenta ×1,5 |
| Ventana de lanzamiento | favorable | Lo primero que completas cada día cuenta ×3 |
| Ruta de hábitos | neutro | Los hábitos cuentan ×1,5; las tareas, ×0,5 |
| Ruta de encargos | neutro | Las tareas cuentan ×1,5; los hábitos, ×0,5 |
| Blindado | adverso | Lo Micro y lo Fácil cuenta ×0,5 |
| Regenerativo | adverso | Una noche sin avance, la amenaza recupera el 10 % de la distancia |
| Tormenta iónica | adverso | Cada caída de un hábito negativo resta sus puntos a la misión |
| Saqueadores | adverso | Cada impacto que no se bloquea quita 1 material de la recompensa |
| Artillería pesada | adverso | Los impactos fuertes salen el 50 % de las veces, no el 30 % |

Reparto por dificultad (sin repetir rasgo):

- **Fácil**: 1 favorable.
- **Normal**: 1 neutro o adverso.
- **Difícil**: 2 adversos.
- **Capítulos de historia**: sin rasgos.

Los rasgos van en la tarjeta de oferta, antes de aceptar, con una línea que explica cada uno. «Difícil» ya no significa hacer más: significa jugar con peores condiciones.

### Cómo se aplican

- `addEffort(ef, día, src)` recibe un tercer parámetro con el origen: `{kind:'task'|'habit'|'acc'|'focus', diff}`. Lo pasan `onComplete()` (con `x`) y el Progreso del Focus.
- El multiplicador de los rasgos se aplica después del de Motores. El resultado se guarda en `g.cef` (fase A), así que deshacer resta lo mismo que sumó aunque ya no sea «lo primero del día».
- El contrato guarda `daily[día]`, los puntos que contaron para la misión cada día. Ventana de lanzamiento mira si `daily[hoy]` está vacío y Regenerativo mira `daily[ayer]` en `missionNight()`. Deshacer también resta de `daily`.
- Tormenta iónica: en `core/rewards.js`, donde se registra la caída de un negativo (`WEAR_NEG`), restar `effOf(h)` del progreso (sin bajar de 0).
- Saqueadores: en `missionNight()`, si el impacto no se bloquea, quitar 1 unidad de un material sorteado de `c.reward.mats`.

### Cambios en el código

| Dónde | Qué |
|---|---|
| `config.js` | `TRAITS` (`id`, `name`, `kind`, `desc`) y el reparto por dificultad. |
| `core/missions.js` | Sorteo de rasgos en `genOpenOffer()`, `traitMult(c, src, día)` y los efectos de Regenerativo y Saqueadores en `missionNight()`. |
| `core/ship.js` | `addEffort()` con `src`; `daily` del contrato y `g.cef`. |
| `core/rewards.js`, `features/focus.js` | Tormenta iónica y el origen del Progreso. |
| `ui/ship-view.js` | Chips de rasgos con su descripción en la oferta y en el panel de misión. |

## Partidas guardadas

- **No se migra nada en marcha.** Un contrato o una oferta sin `cruise` sigue las reglas de antes: el `run` con su plazo y el `open` antiguo con su cuota. Las ofertas antiguas caducan en 6 días como mucho.
- `normShip()` normaliza los campos nuevos solo si están: `size`, `cruise`, `bonusAt`, `threat`, `traits` (filtrados contra `THREATS` y `TRAITS`), `shield`, `heavy`, `hits`, `blocked` y `daily`.
- Sin `threat` no hay impactos; sin `traits` no hay rasgos. Así un contrato antiguo nunca recibe mecánicas que no tenía al aceptarlo.

## Pruebas (`test/missions.test.js`)

Fase A:
- La distancia es `cruise × avgDaily()`, igual en fácil, normal y difícil.
- Toda oferta no urgente sale sin plazo; las urgentes salen con plazo y sin push.
- La bonificación se aplica antes de `bonusAt` y no después.
- Motores sube el avance de la misión, pero no la actividad del día.
- Deshacer resta exactamente lo que sumó (`g.cef`).
- Un contrato `run` antiguo sigue venciendo y cobrando la parte hecha.

Fase B:
- Un impacto por noche, ninguno el día de aceptación, como mucho 7 seguidos.
- El escudo bloquea un impacto y no vuelve a estar listo hasta pasados dos más.
- El impacto fuerte hace el doble y se sortea con antelación.
- Una misión completada no recibe impacto esa noche.

Fase C:
- Cada multiplicador, con deshacer en medio.
- Regenerativo solo resta si `daily[ayer]` está vacío, y el repaso de ayer lo evita.
- Los capítulos de historia no traen rasgos.
- `normShip()` descarta amenazas y rasgos que no existen.

## Decisiones abiertas

- **Ritmo de referencia o tamaños absolutos.** Este plan escala la distancia con tu ritmo, para que una misión media dure unos 5 días a cualquier persona. La alternativa es la de Habitica: tamaños fijos en puntos (15 / 40 / 80). Es más simple, pero dura muy distinto según cuánto hace cada jugador.
- **¿Mantener las urgentes con plazo?** El plan las deja como reto opcional. Se podrían quitar y convertir en «bonificación de rapidez más alta» sin castigo, pero así se pierde la reputación.
- **Misión eterna.** Sin plazo, una misión puede alargarse indefinidamente con un impacto cada noche. Si hace falta, se puede añadir que el daño suba un 50 % a partir de `cruise × 2` noches.
