# Misiones sin plazo: distancia, amenazas y rasgos

Hoy la cuota de una misión es `días × ritmo medio de 14 días × push`, y `push` vale 0,95, 1,10 o 1,25 según la dificultad. Una misión normal pide un 10 % más que tu media. Si la cumples, la media sube y la siguiente pide un 10 % más sobre la media nueva: el listón no deja de subir. Además, el plazo hace que importe el volumen por día y no la constancia.

Este plan cambia el modelo:

1. **Distancia** (fase A, hecha): la misión es un tramo fijo de puntos, sin plazo. El plazo pasa a ser una bonificación opcional.
2. **Amenaza y escudo** (fase B, hecha): cada noche de misión hay un impacto contra la nave. El escudo lo bloquea, pero tarda en recargarse.
3. **Rasgos** (fase C, hecha): modificadores que cambian *qué* cuenta y *cuánto*, no la cantidad que se pide.

Cada fase se puede publicar por separado. La fase A ya quita el problema de raíz.

Las rutas por etapas (idea 4) y las habilidades de tripulación (idea 5) quedan fuera de este plan. Se apoyarán en el escudo y en los rasgos.

## Reglas de fondo

- **La dificultad nunca sube la cuota.** `push` desaparece (vale 1 en todas). La dificultad cambia el daño, los rasgos y la paga.
- **Sin plazo no se pierde nunca la misión por tiempo.** Ir despacio cuesta desgaste y la bonificación, nada más.
- **Abandonar sigue igual**: sin cobro, y con la urgente, reputación dañada.
- Lo que ya está en marcha no se migra: los contratos y ofertas de antes terminan con las reglas de antes (ver *Partidas guardadas*).

## Fase A · Distancia

### Tamaño de la misión

Cada oferta sortea un tamaño, independiente de la dificultad. **La distancia es fija en puntos**, como el HP de un jefe de Habitica: no depende de tu ritmo, así que hacer más nunca agranda las misiones siguientes.

| Tamaño | Distancia | Bonificación si llegas en | Probabilidad |
|---|---|---|---|
| Corta | 15 puntos | 3 días | 35 % |
| Media | 30 puntos | 4 días | 45 % |
| Larga | 60 puntos | 7 días | 20 % |

- Las cifras son constantes (`SIZES` en `config.js`) para poder ajustarlas tras jugar unas semanas. Están calibradas a **10 puntos al día**: a ese ritmo una misión dura 1,5, 3 o 6 días, y la bonificación se consigue con un día de margen.
- La distancia se guarda en la oferta como `quota`, igual que ahora, junto con `size` y `window` (los días de la bonificación).
- El tablón muestra «Media · 30 puntos · +25 % si llegas en 4 días».

### Paga

- `¢ = distancia × 12 × pay de la dificultad`, como las misiones sin plazo de ahora. La Bodega y Navegación se aplican al cobrar, como siempre.
- Material: `rollMats(window, D)`.
- **Bonificación de rapidez: +25 % de ¢** si la misión se completa antes de `aceptación + window × 24 h`. Se guarda como `bonusAt` en el contrato. Llegar más tarde no tiene castigo: solo no hay bonificación.
- La paga no sube por días en el tablón (como pasa ya con las de sin plazo).

### Urgentes

- Son las únicas misiones con plazo (`kind:'run'`). Se mantienen el 20 % de probabilidad, la paga +50 % y la reputación dañada si fallan.
- Siguen dependiendo de tu ritmo, porque tienen plazo: su cuota pasa a `días × ritmo medio` (sin push). Se eligen a propósito: son el reto para quien quiere presión.
- Salen del catálogo sin `open:true` (sus textos `partial` y `fail` hablan de plazos).

### Motores

«+1 día de duración máx.» deja de tener sentido sin plazo. Pasa a: **+6 % de avance en misión por nivel efectivo** (cada punto de esfuerzo cuenta 1 + 0,06 × nivel; con nivel 5, +30 %). `maxDays()` sigue usándose para la duración de las urgentes.

### Cambios en el código

| Dónde | Qué |
|---|---|
| `config.js` | `SIZES = {short:{pts:15,days:3,w:.35}, mid:{pts:30,days:4,w:.45}, long:{pts:60,days:7,w:.20}}`, `SPEED_BONUS = 0.25`, `ENGINE_PUSH = 0.06`. Quitar `push` de `DIFFS`. Quitar `OPEN_P` y `OPEN_DAYS`: toda oferta no urgente es sin plazo. Texto de Motores en `MODS`. |
| `core/missions.js` | `genOffer()`: urgente → `run` como ahora, sin push; si no, `genOpenOffer()`. `genOpenOffer()` sortea el tamaño y guarda `size`, `quota` y `window`; los capítulos de historia (`storyOffer()`) son siempre medios. `pickMission(open)` pasa a filtrar «puede salir sin plazo» (todas) o «puede salir urgente» (las que no son `open`). `contractFrom()` añade `bonusAt`. `freshOffer()`: la oferta «segura» ya no hace falta para el plazo, solo para la dificultad (fácil o normal). |
| `core/ship.js` | `addEffort()`: multiplica por `1 + ENGINE_PUSH × eff('engines')` lo que suma a la misión (no lo que suma a `activity`). Al completar, aplica la bonificación si `Date.now() < c.bonusAt`. Guarda en `g.cef` lo que contó para la misión, para que `onUndo()` reste exactamente eso. |
| `core/crew.js` | `missionCrewXp()`: sin plazo, los días de experiencia se limitan a `window`, para que ir despacio no dé más experiencia. |
| `ui/ship-view.js` | Tarjeta de oferta: tamaño, distancia y bonificación. Panel de misión: «Bonificación +25 % si llegas antes del vie 30, 18:00». Texto de Motores en el astillero. |
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
- Cada amenaza tiene cuatro frases de impacto, que nombran el módulo dañado con su artículo (`MODS[k].the`), y dos de bloqueo. Se elige una al azar: «Dos cazas piratas pasan rozando el casco y ametrallan los Motores».

Referencia: una misión larga normal hecha en 7 días (7 noches, 2 bloqueadas, 30 % fuertes) deja unos 40 puntos de estado repartidos entre los módulos. Es más o menos lo que desgastan 8 hábitos fallados, y se repara en el astillero o a bordo como siempre.

### Escudo deflector

- Botón en el panel de misión. **Al activarlo, bloquea el siguiente impacto** (el de esta noche).
- **Recarga**: después de bloquear, no se puede usar en los dos impactos siguientes. Bloquea como mucho uno de cada tres.
- Cada misión empieza con el escudo cargado.
- Estados del botón: «Activar escudo» · «Escudo activo: protegerá el impacto de esta noche» · «Recargando: listo el jueves».
- Se puede desactivar el mismo día sin gastarlo (por si se activa sin querer).
- Los capítulos de historia también traen amenaza (la de su tema).
- Más adelante, la idea 5 (habilidades de tripulación) y un posible módulo Escudos mejorarán la recarga. Ahora no se añade módulo, para no tocar el nivel de la nave ni el dibujo.

### Cambios en el código

| Dónde | Qué |
|---|---|
| `config.js` | `THREATS`, `HIT = {easy:4, normal:6, hard:8}`, `HEAVY_P = 0.3`, `SHIELD_GAP = 2`. |
| `core/missions.js` | La amenaza al generar la oferta. Contrato: `shield:{armed:false, readyOn:día}`, `heavy:bool`, `hits:0`, `blocked:0`. Funciones `missionNight(día)` (resuelve el impacto) y `armShield()` / `disarmShield()`. |
| `core/day.js` | `processDays()`: después del aviso de desgaste, llama a `missionNight(day)` por cada noche. Va aparte para que los impactos no salgan como desgaste por hábitos o tareas. |
| `ui/ship-view.js` | La barra con la etiqueta de la amenaza. Línea «Próximo impacto», botón del escudo y resumen «3 impactos · 1 bloqueado». |
| `ui/actions.js` | Acciones del escudo (activar y desactivar, `save()` y `render()`). |

## Fase C · Rasgos

Cada misión sin plazo trae rasgos que cambian cómo cuenta el esfuerzo **para la misión**. Las ¢, los méritos y el material de cada tarea o hábito no cambian.

| Rasgo | Tipo | Efecto |
|---|---|---|
| Viento solar | favorable | Lo Difícil y lo Épico cuenta ×1,5 |
| Ventana de lanzamiento | favorable | Lo primero que completas cada día cuenta ×2 |
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

- `addEffort(ef, día, g, src)` recibe el origen: `{kind:'task'|'habit', diff}`. `onComplete(x, g, día, kind)` lo arma: las acciones rápidas del Focus cuentan como tareas fáciles, y el Progreso del Focus, como tarea Micro.
- El multiplicador de los rasgos se aplica después del de Motores. El resultado se guarda en `g.cef` (fase A), así que deshacer resta lo mismo que sumó aunque ya no sea «lo primero del día».
- El contrato guarda `daily[día]`, los puntos que contaron para la misión cada día. Ventana de lanzamiento mira si `daily[hoy]` está vacío y Regenerativo mira `daily[ayer]` en `missionNight()`. Deshacer también resta de `daily`.
- Tormenta iónica: en `core/rewards.js`, `tapNeg()` resta `effOf(h)` del progreso (sin bajar de 0) y lo guarda en `h.g[día].storm`, en paralelo a `hits`, para que `untapNeg()` lo devuelva. El aviso de la caída lo dice.
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

- **No se migra nada en marcha.** Un contrato o una oferta sin `size` sigue las reglas de antes: el `run` con su plazo y el `open` antiguo con su cuota. Las ofertas antiguas caducan en 6 días como mucho.
- `normShip()` normaliza los campos nuevos solo si están: `size`, `window`, `bonusAt`, `threat`, `traits` (filtrados contra `THREATS` y `TRAITS`), `shield`, `heavy`, `hits`, `blocked` y `daily`.
- Sin `threat` no hay impactos; sin `traits` no hay rasgos. Así un contrato antiguo nunca recibe mecánicas que no tenía al aceptarlo.

## Pruebas (`test/missions.test.js`)

Fase A:
- La distancia es la de su tamaño, igual en fácil, normal y difícil, y no cambia con el ritmo.
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

## Decisiones tomadas

- **Distancia fija en puntos** (15 / 30 / 60), no según el ritmo de cada uno, calibrada a 10 puntos al día.
- **Las urgentes se quedan** como reto opcional con plazo.
- **Sin escalada**: una misión larga no aumenta su daño con el tiempo. El coste de ir despacio es el desgaste de cada noche y perder la bonificación.
