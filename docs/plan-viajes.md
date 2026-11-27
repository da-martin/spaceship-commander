# Viajes a otros sistemas

La alianza puede viajar junta a otro sistema siguiendo una historia. Lo que se propone y se vota es un **viaje**; la misión de ir de un sistema a otro es el **salto**. Viajar es **mudarse**: no hay vuelta obligatoria. En el nuevo sistema hay misiones propias y, según su historia, otros precios en el mercado, otro astillero y otro tablón de tripulación. Volver al Sistema Madre, o seguir hacia otro sistema, es otro viaje.

Los capítulos de la historia de cada sistema son misiones de toda la alianza: se proponen y se votan como un viaje (ver «Capítulos de historia en grupo»). Las demás misiones en grupo quedan fuera de este plan.

## Reglas de fondo

- Cada jugador está siempre en un sistema: `state.ship.system` (`'madre'` por defecto).
- **Toda la alianza está siempre en el mismo sistema**, o haciendo el mismo salto.
- Solo se viaja dentro de una alianza. Quien juega solo crea una alianza de uno: su votación se resuelve al momento.

## Sistemas

Cada sistema es una ficha en `public/js/systems.js`, como el catálogo de `missions.js`:

| Campo | Qué hace |
|---|---|
| `id`, `name`, `art`, `desc` | Identidad, artículo («el » en «el Sistema Madre») y texto de la tarjeta de destino |
| `quote` | Epígrafe: una cita célebre, sin atribución, que abre la llegada y la tarjeta de destino |
| `days` | Días de salto para llegar |
| `intro`, `travel[]` | Relato de llegada y un fragmento por día de salto |
| `market` | Multiplicador de precio por material (×1 si no aparece); ×0 es que allí no se compra ni se vende |
| `yard` | `mult` del astillero (mejoras y reparaciones) y `closed`, los módulos que no se pueden mejorar allí (sí reparar) |
| `missions` | Catálogo del tablón: las misiones con `system` igual al id del sistema (las que no lo llevan son del Sistema Madre), sin los capítulos |
| `story[]` | Capítulos de la historia del sistema (misiones con `chapter`, ver abajo) |
| `roles` | Opcional: roles de tripulación que salen en el tablón de tripulación |

El Sistema Madre también tiene ficha, con el catálogo de `missions.js`. Cada uno de los demás vive en `public/js/systems/<id>.js` (solo datos, con su catálogo y su historia); `missions.js` los junta todos en `MISSIONS`, marcados con `system`, para que una misión aceptada encuentre su relato esté donde esté.

**El Sistema Madre es el centro** (`canJump`): desde él se puede viajar a cualquier sistema, y desde cualquier otro solo se vuelve a él. Los días de salto de cada sistema son su distancia al Sistema Madre; para ir de uno a otro hay que hacer dos viajes.

**Los viajes están cerrados** mientras `TRAVEL_ON` (en `config.js`) sea `false`: `destinations()` no ofrece ningún destino. La interfaz de viajes, cuando exista, tiene que pasar por ahí.

- `priceOf(k, día)` multiplica por `market[k]` del sistema en el que estás, antes de redondear; `onSale(k)` dice si allí se comercia.
- `yardMult()` incluye `yard.mult`, así que afecta a mejoras y reparaciones; `yardClosed(k)` dice si el módulo está cerrado allí.
- `pickMission()` sortea solo del catálogo del sistema. Las historias de las misiones se buscan en todos los catálogos, porque una misión aceptada puede ser de otro sistema.
- `here()` da la ficha del sistema actual y `herePrep('en' | 'de' | 'a')` su nombre con preposición («en el Sistema Madre», «del…», «al…»).

## Los sistemas de destino

Cuatro sistemas que rinden homenaje a clásicos de la ciencia ficción. El clásico se reconoce por el ambiente y los temas, no por los nombres:

- Nombres propios originales para empresas, naves, personajes, planetas y criaturas; nada de nombres de las películas, ni tal cual ni con letras cambiadas.
- Una sola cita célebre por sistema, como epígrafe (`quote`). Fuera de ahí no hay frases célebres ni escenas calcadas.
- Escala de nave: cada misión y cada capítulo es un trabajo de la nave (transportar, escoltar, rescatar, sondear, remolcar…), nunca una aventura a pie. La tripulación es la del jugador, y la historia nunca la trata como prescindible.

Cada sistema tiene un catálogo de 16 misiones (2 por tema, 2 o 3 sin plazo) y su historia.

| Sistema | Homenaje | Salto | Mercado | Astillero | Historia |
|---|---|---|---|---|---|
| Zeta Reticuli (`zeta`) | Alien | 3 días | aleaciones ×0,6 · biomasa ×0 · nexos ×1,5 | ×0,8; Enfermería cerrada | 9 capítulos |
| el Umbral (`umbral`) | Interstellar | 1 día | biomasa ×2,5 · aleaciones ×1,3 · ecos ×0,5 | ×1,5 | 5 capítulos |
| Canopo (`canopo`) | Dune | 4 días | biomasa ×3 · ecos ×0,4 · aleaciones ×1,4 | ×1,2; Motores cerrados | 6 capítulos |
| Betelgeuse (`betelgeuse`) | Blade Runner | 5 días | nexos ×2 · biomasa ×1,5 · ecos ×0,7 | ×1 | 9 capítulos |

Zeta Reticuli no tiene Instrucción ni Comercio en el tablón de tripulación; el Umbral, ni Comercio ni Intendencia.

## Propuesta y votación

- **Cualquier miembro** propone un viaje desde la vista de alianza, eligiendo el destino. Quien propone vota sí.
- Solo hay una propuesta abierta a la vez, y no se puede proponer durante un salto.
- Cada miembro vota **sí** o **no**, y puede cambiar su voto mientras la votación esté abierta.
- La votación dura **3 días** (72 h desde que se propone).
- **Si todos dicen que sí, zarpan en ese momento**, sin esperar al plazo.
- **Si más de la mitad dice que no, la propuesta se cancela en ese momento** y nadie se mueve. Un empate no cancela.
- **El fundador tiene la última palabra**: si vota que no, la propuesta se cancela en ese momento, aunque el resto quiera ir. Sin su sí no se viaja, así que nunca se queda fuera de su propia alianza. Si sale de la alianza durante la votación, la última palabra pasa a quien hereda el cargo.
- Al cabo de 3 días, si el fundador ha dicho que sí, zarpan los que han dicho que sí; si no ha votado, se cancela. **Quien ha dicho que no o no ha votado se queda** en el sistema actual y sale de la alianza, con un aviso en el chat.
- Quien entra en la alianza con una votación abierta también vota, y cuenta para la mayoría.
- Quien propone puede retirar la propuesta mientras esté abierta.
- Las votaciones y las salidas se anuncian en el chat como hitos (como los ascensos y las misiones).

## Al zarpar

- **La misión en curso se cancela sin penalización**: si es urgente, la reputación no se daña. Se cobra la parte hecha, como cuando expira.
- El tablón se vacía, porque sus misiones son del sistema que se deja, y la barra de señal vuelve a cero.
- Empieza el salto.

Al votar que sí con una misión en curso, la tarjeta avisa de que se cancelará al zarpar.

## Salto

- Es un contrato `kind: 'jump'` **sin cuota**, que dura los `days` del destino (`jumpDays`). Para volver al Sistema Madre, que no tiene `days`, dura los del sistema que se deja. Todos salen a la vez, así que todos llegan a la vez.
- La nave sigue en el sistema de origen hasta llegar: `state.ship.system` cambia al final. Durante el salto el tablón está congelado.
- Como en cualquier misión, durante el salto no hay tablón, mercado ni astillero. Conviene prepararse antes de zarpar.
- Las tareas y los hábitos pagan como siempre. La tripulación gana su XP por día de misión y cobra su sueldo.
- Cada día de salto llega a la bitácora un fragmento de la historia (`travel[]`): el primero al zarpar, en un informe grande, y otro cada 24 h. El contrato cuenta los ya contados (`told`), así que con la app cerrada no se repite ni se salta ninguno. El regreso al Sistema Madre usa los fragmentos de su ficha.
- El salto no se puede abandonar.
- **Llegada**: entrada grande en la bitácora con la cita (`quote`) y el relato del sistema (`intro`); quien terminó su contrato desembarca, y la señal empieza con una transmisión al momento, como la primera vez que se desbloquea la Antena.

## Vivir en otro sistema

- Mercado, astillero, tablón de misiones y tablón de tripulación funcionan con la ficha del sistema.
- Los textos que hoy dicen «de vuelta en el Sistema Madre» pasan a nombrar el sistema actual.
- **Historia del sistema**: los capítulos de `story[]` se hacen de uno en uno y en orden, en grupo con la alianza (ver «Capítulos de historia en grupo»). Son misiones sin plazo (ver abajo) con relato propio.
  - Mientras dura un capítulo, el dibujo de la nave la muestra en órbita, con el planeta grande de cerca (ver «La nave en pantalla»).
- Cuando se acaba la historia se puede seguir en el sistema todo el tiempo que se quiera, con sus misiones normales.

## Capítulos de historia en grupo

Los capítulos de la historia de un sistema son misiones de toda la alianza. Se proponen y se votan igual que un viaje, y los que dicen que sí salen juntos y reúnen una sola cuota entre todos. La historia avanza para la alianza entera.

Hasta ahora cada jugador hacía su historia por su cuenta: el capítulo pendiente estaba siempre en el tablón y se aceptaba como cualquier misión. Eso desaparece. El Sistema Madre no tiene historia, y a los demás sistemas solo se llega con una alianza, así que siempre hay alianza a la que proponer.

### Propuesta y votación

Las mismas reglas que el viaje (ver «Propuesta y votación»), con estas diferencias:

- Se propone desde la vista de alianza: «Proponer el capítulo 3: título». Siempre es el capítulo siguiente de la alianza en su sistema; no se elige.
- Viajes y capítulos comparten el límite de **una propuesta abierta a la vez**. Además, no se puede proponer un capítulo durante un salto ni con otro capítulo en curso, ni un viaje mientras la alianza hace un capítulo.
- **Quien dice que no, o no vota, no va, pero sigue en la alianza.** Se queda en el sistema con su tablón, su mercado y su astillero, y sigue con su misión si tenía una. A diferencia del viaje, nadie sale de la alianza: todos siguen en el mismo sistema.
- Como en el viaje: si todos dicen que sí, salen en ese momento; si más de la mitad dice que no, o el fundador dice que no, se cancela en ese momento; al cabo de 3 días, con el sí del fundador salen los que han dicho que sí, y sin él se cancela. Quien propone puede retirar la propuesta mientras esté abierta.
- Al votar que sí con una misión en curso, la tarjeta avisa de que se cancelará al salir.
- Quien juega solo tiene una alianza de uno: su propuesta sale al momento.

### Al salir

- Para los que van, la misión en curso se cancela sin penalización y se cobra la parte hecha, como al zarpar. El tablón no se vacía: siguen en el mismo sistema y lo encuentran al volver.
- Cada uno recibe el contrato del capítulo (`kind: 'open'`, `story: true` y `group` con el id de la propuesta) y su relato de entrada (`brief`) va a la bitácora.
- La hora de salida es la del servidor, como en el salto: quien tenía la app cerrada lo aplica al abrirla (`followChapter`), igual que `followJump`.
- El capítulo ya no sale en el tablón. En su lugar, una línea dice qué capítulo toca y que se propone desde la alianza.

### Cuota compartida

- **Una sola barra para todos.** La cuota es de **50 puntos por participante** (`STORY_PTS` en `config.js`, aparte de los tamaños de `SIZES`): con 3 a bordo, 150 puntos. La bonificación de rapidez cuenta 6 días (`window`), al mismo ritmo que una misión larga (60 puntos en 7 días).
- Cada uno suma a la barra con sus tareas y hábitos, como en cualquier misión, y envía al servidor su total de puntos en el capítulo, no la diferencia: reenviar no cuenta doble, y deshacer lo baja. Sin conexión, los puntos esperan en el dispositivo y se envían al volver.
- La barra muestra el total de la última foto de la alianza más lo tuyo aún sin enviar, y debajo la parte de cada participante.
- **Termina para todos a la vez**, cuando la suma llega a la cuota. Lo decide el servidor (`settle`), con su hora, y cada cliente lo aplica en cuanto lo ve, aunque ese día no haya aportado nada.
- **Cada participante cobra la paga entera del capítulo**, la de un capítulo de 50 puntos (no se multiplica ni se reparte), y la bonificación de rapidez si la alianza termina en `window` días desde la salida.
- Lo que no se comparte: la amenaza, los impactos de cada noche y el escudo son de cada nave, como ahora. Los capítulos siguen sin rasgos ni rutas por etapas.

### Abandonar

- Cada uno puede abandonar el capítulo cuando quiera y vuelve al sistema sin cobrar, como en cualquier misión sin plazo. Lo que ya aportó sigue contando para los demás.
- La cuota baja 50 puntos por cada uno que se va, pero nunca por debajo de lo ya reunido: si con la bajada ya se llega, el capítulo termina para los que quedan.
- Salir de la alianza durante un capítulo es abandonarlo.
- Si abandonan todos, el capítulo se cancela sin completarse y se puede volver a proponer.
- Quien entra en la alianza con un capítulo en curso no se suma: espera al siguiente.

### La historia es de la alianza

- El servidor guarda por qué capítulo va la alianza en cada sistema. Al completarse uno, la alianza pasa al siguiente para todos sus miembros, hayan ido o no. Quien no fue se lo pierde: lo ve en el chat, pero no recibe el relato ni la paga.
- `state.ship.story` pasa a ser la copia local de la historia de la alianza: el cliente la toma de la foto.
- Quien entra en una alianza toma su historia. Quien sale se queda con la que tenía (su última copia) y, con una alianza de uno, sigue desde ahí.
- Cuando se acaba la historia del sistema, ya no se proponen capítulos.

### En el chat

Hitos como los del viaje, con el número y el título del capítulo: `chapter_propose`, `chapter_go` (salen, con quiénes van) y `chapter_done` destacan; `chapter_withdraw`, `chapter_cancel` y `chapter_leave` (quien abandona) van como avisos.

### Pruebas

- Las reglas de la votación son las del viaje, y quien dice que no sigue en la alianza.
- La cuota crece con los participantes y baja con cada abandono, sin bajar de lo reunido; si con la bajada se llega, termina.
- Enviar el mismo total dos veces no cuenta doble, y deshacer lo baja.
- Al completarse cobran los participantes, no los demás, y la historia de la alianza avanza para todos.
- Quien entra con un capítulo en curso no se suma; salir de la alianza lo abandona.
- No se puede proponer un viaje con un capítulo en curso, ni un capítulo durante un salto.
- El número de capítulos por sistema del servidor coincide con `systems.js`, y su cuota por participante con `STORY_PTS`.

## Invitaciones entre sistemas

- Se puede invitar a alguien que está en otro sistema. La invitación dice dónde está la alianza.
- **Aceptar una invitación desde otro sistema lanza tu propio salto** hasta el sistema de la alianza, con los días de ese destino. Tu misión en curso se cancela sin penalización, igual que al zarpar.
- Si no hay ruta directa (estás en un sistema y la alianza en otro, y ninguno es el Sistema Madre), el salto da el rodeo por el Sistema Madre en un solo viaje que suma los dos tramos: primero los fragmentos de regreso y luego los del destino. **Antes de aceptar se avisa** de la duración y del rodeo (`routeText`). Es el único caso en que se salta entre dos sistemas sin pasar por el Sistema Madre como parada (`startJump(to, now, {invite:true})`).
- Si la alianza está en pleno salto, saltas a su destino.
- Quien está saltando no puede aceptar invitaciones hasta llegar.
- Durante tu salto ya eres miembro: tienes chat y votas, pero no puedes proponer viajes hasta llegar.

## Misiones sin plazo

Valen para el Sistema Madre y para cualquier otro sistema. Te sacan del sistema como cualquier otra misión; lo único que cambia es que no tienen plazo.

- Llegan al tablón como las demás (`OPEN_P` en `config.js`; la idea es 1 de cada 6) y caducan en el tablón igual que las otras. Desde [plan-misiones.md](plan-misiones.md) (fase A) `OPEN_P` ya no existe: toda misión no urgente llega sin plazo, con una distancia fija según su tamaño.
- Cuota de entre 4 y 7 días al ritmo medio, del tamaño de una misión normal (de 2 a 7 días, según los Motores), porque mientras dura estás sin mercado, astillero, tripulación ni tablón. Terminan al reunir la cuota.
- Salen solo de las misiones marcadas `open: true` en el catálogo, y esas nunca salen con plazo. En el Sistema Madre son 8: `min-pecio`, `min-gas`, `min-cristal`, `exp-ruinas`, `pat-perimetro`, `pat-minas`, `pat-balizas` y `rec-satelite`. Su final está reescrito como un trabajo de semanas en un mismo sitio (en órbita de una luna, de un pecio, de una estación…).
- La paga por punto es la de una misión de 1 día (sin plazo no hay prisa que pagar), y no sube con los días en el tablón. Nunca son urgentes, y no cuentan como la misión fácil que el tablón siempre intenta tener.
- Se pueden abandonar cuando quieras, sin daño de reputación y sin cobrar nada, igual que una misión normal que no sea urgente.
- Como en cualquier misión: reparaciones a bordo, la tripulación gana su XP por día y cobra su sueldo, y quien termina su contrato sigue a bordo hasta volver.
- En pantalla es la vista de misión de siempre, con «sin plazo» donde normalmente dice cuánto queda.

Se probó primero una variante «en órbita», sin salir del sistema y con mercado y astillero abiertos. Se descartó porque muy pocas historias justifican estar de misión y a la vez junto al puerto, y porque añadía un tercer estado difícil de entender.

«Tener misión» significaba «estar fuera del sistema» (`atHome()`). Desde la fase 1 lo decide `docked()` según el tipo de contrato (`CONTRACT_KINDS` en `config.js`):

| `kind` | Qué es | ¿Fuera del sistema? | ¿Plazo? |
|---|---|---|---|
| `run` | Misión normal del tablón | Sí | Sí |
| `open` | Misión sin plazo (y capítulos de historia) | Sí | No |
| `jump` | Salto | Sí | Sí: los días del destino |

## La nave en pantalla

| Estado | Fondo | Motores |
|---|---|---|
| En el sistema | El planeta del sistema asoma por la esquina, todo quieto | Apagados: la nave espera |
| Capítulo de la historia de un sistema | El planeta del sistema, de cerca, ocupa todo el lateral izquierdo: la nave está en órbita | Encendidos |
| Otra misión (con plazo o sin él) | Sin planeta; las estrellas caen como trazos cortos | Encendidos |
| Salto | Túnel de luz violeta delante del morro del que brotan las estrellas | A tope, estela larga |

Cada sistema tiene su planeta (`PLANETS` en `ui/ship-view.js`), el mismo en la esquina y en órbita: el Umbral, azul celeste de mar y hielo; Canopo, desierto color arena; Zeta Reticuli, gris verdoso industrial con tormentas; Betelgeuse, gigante gaseoso en rojos con alguna banda naranja.

## Servidor

La alianza deja de ser solo «quién está con quién»: pasa a tener ubicación y votaciones (migración `0009_alliance_trips.sql`, código en `src/alliance.js`).

- `alliances.system`: dónde está la alianza, con el id del sistema (`'madre'` por defecto). Nace donde está quien la funda (o adonde va, si está saltando) y cambia al zarpar.
- Tabla nueva `alliance_trips`: id, alianza, origen, destino, quién la propone, `created_at`, `closes_at`, estado (`open`, `sailing`, `done`, `withdrawn`, `cancelled`), `departed_at` y `arrives_at`. Un índice único impide dos votaciones abiertas a la vez.
- Tabla nueva `alliance_trip_votes`: viaje, jugador y voto (sí o no). Solo cuentan los de quien sigue en la alianza.
- El servidor tiene su copia de los días de salto (`SYSTEM_DAYS`); un test comprueba que coincide con `systems.js`.
- Rutas: `POST /api/alliance/trip` (`{to}`: propone y vota sí), `/trip/vote` (`{tripId, vote}`) y `/trip/withdraw`. Responden 404 mientras la variable del Worker `TRAVEL_ON` no sea `"1"`.
- **La votación se resuelve sin relojes** (`settle`): cada foto comprueba si el fundador ha votado que no (se cancela ya), si todos han votado que sí (zarpan ya), si más de la mitad ha votado que no (se cancela ya) o si ha pasado `closes_at`. Al cerrar, con el sí del fundador zarpan los del sí, con la hora del cierre aunque nadie abriera la app entonces; sin él, se cancela. Al zarpar saca de la alianza a quien no votó que sí y escribe los avisos. Cada cambio de estado es condicional, así que dos peticiones a la vez no zarpan dos veces. No hace falta un cron.
- Avisos en el chat: `trip_propose` y `trip_sail` destacan; `trip_withdraw`, `trip_cancel` (con el fundador como autor si fue su no) y `trip_stay` (quien se queda y sale) van como avisos. Llevan en `body` el sistema.
- La foto de `GET /api/alliance` incluye `system`, la votación abierta (`trip`, con los votos) y el último salto (`jump`), aunque ya haya llegado. Las invitaciones dicen dónde está la alianza (`system`) y adónde salta si está saltando (`bound`).

Los capítulos en grupo usan las mismas tablas (migración `0010_alliance_chapters.sql`):

- `alliance_trips` gana `kind` (`'trip'` por defecto o `'chapter'`), `chapter` (el número), `quota` y `done_at`. En un capítulo, `from_system` y `to_system` son el sistema de la alianza. Los estados son los mismos: `sailing` es el capítulo en curso. El índice único ya impide un viaje y un capítulo abiertos a la vez.
- Los votos van en `alliance_trip_votes`, sin cambios.
- Tabla nueva `alliance_trip_crew`: propuesta, jugador, puntos aportados y `left_at`. Se llena al salir con los del sí.
- `alliances.story`: JSON con los capítulos hechos por sistema.
- El servidor tiene su copia del número de capítulos por sistema (`SYSTEM_CHAPTERS`) y de la cuota por participante; un test comprueba que coinciden con `systems.js` y `STORY_PTS`.
- Rutas: `POST /api/alliance/chapter` (propone el siguiente y vota sí), `/chapter/progress` (`{tripId, points}`, el total de quien envía, como mucho la cuota) y `/chapter/leave`. Votar y retirar usan `/trip/vote` y `/trip/withdraw`, que valen para la propuesta abierta sea del tipo que sea. Todo detrás de la misma variable `TRAVEL_ON`.
- `settle` también resuelve los capítulos: la votación como la del viaje, pero al salir no saca a nadie de la alianza; con un capítulo en curso, si la suma llega a la cuota lo marca hecho, avanza `alliances.story` y escribe el hito.
- La foto incluye `story`, la propuesta abierta con su `kind` y el capítulo en curso o el último terminado (`chapter`: cuota, participantes y sus puntos).

En el cliente:

- Al recibir una salida que todavía no ha aplicado (`followJump`, en `core/travel.js`), la aplica: cancela la misión, vacía el tablón y crea el contrato de salto que sale a la hora del servidor y llega con su `arrives_at`. Así funciona aunque la app estuviera cerrada cuando zarpó la alianza: puede llegar al momento, con todos los fragmentos. `state.ship.trip` guarda el último salto aplicado. Quien entró después de zarpar no lo aplica, y quien aún va de camino hacia la alianza lo aplica al llegar.
- Al entrar en una alianza que está en otro sistema, `joinAlliance` lanza tu salto hasta ella. Antes de aceptar, la invitación avisa de la ruta y de la misión que se cancela, y el botón pasa a «Unirme y zarpar». Saltando no se puede aceptar.
- En la vista de alianza: la votación abierta (votos de cada uno, Sí / No y retirar), el salto en curso o el capítulo en curso van arriba, antes del chat; la lista de destinos para proponer y el botón del capítulo siguiente, debajo de los miembros. Todo esto solo con `TRAVEL_ON`.
- Capítulos: `followChapter` aplica la salida, la cuota que cambia y el final que decide el servidor (en `core/chapters.js`, nuevo). `storyOffer` deja de llegar al tablón. `addEffort` y deshacer guardan los puntos del capítulo, y `sync/alliance.js` los envía con una cola como la de los hitos. El panel de misión muestra la barra compartida y la parte de cada uno.
- Votar necesita conexión; el salto en sí corre sin conexión, como cualquier misión.

## Partidas guardadas

- Sin `system` → `'madre'`.
- Sin `trip` → `null`.
- Contratos sin `kind` → `'run'`.
- Las ofertas de historia del tablón (`story: true`) se descartan.
- Un capítulo aceptado antes del cambio (sin `group`) sigue como antes, solo, hasta que se complete o se abandone.

## Fases

1. **Sistemas en local** (hecha): `systems.js` con la ficha del Sistema Madre, `state.ship.system`, mercado, astillero, tablón y candidatos por sistema, el `kind` de los contratos y `docked()`. Sin cambios visibles.
2. **Misiones sin plazo** (hecha, sin activar): el tipo `open`, su oferta en el tablón (`genOpenOffer`), aceptarlas (`contractFrom`), las 8 misiones sin plazo del Sistema Madre y la escena del salto en el dibujo de la nave. Para que lleguen al tablón basta con subir `OPEN_P`; entonces tocará anunciarlo en las novedades.
3. **Salto** (hecha, oculta): `core/travel.js` con `startJump`, los fragmentos diarios y la llegada; la historia del sistema en el tablón; la vista del salto y los informes con cita. No hay ningún botón para viajar: lo lanzará la votación de la fase 4, y la alianza de uno se prueba allí.
4. **Votación en el servidor** (hecha, oculta): tablas, propuesta, votos, salida perezosa e hitos en el chat; en el cliente, aplicar la salida, saltar al entrar en una alianza de otro sistema y la parte de viajes de la vista de alianza.
5. **Contenido** (escrito, sin activar): los cuatro sistemas de destino con su ficha, su catálogo y su historia; los capítulos llegan al tablón desde la fase 3 (hasta que la fase 6 los pase a la alianza).
6. **Capítulos en grupo** (por hacer): la migración `0010`, las rutas y `settle` de capítulos en el servidor; en el cliente `core/chapters.js`, la cola de puntos, la vista de alianza y el panel de misión; y los tests. Se hace antes de abrir los viajes.

Para abrir los viajes, después de la fase 6, hacen falta dos interruptores: `TRAVEL_ON` a `true` en `config.js` y la variable `TRAVEL_ON` a `"1"` en el Worker (`vars` en `wrangler.jsonc`), con la migración `0009` aplicada. Entonces tocará anunciarlo en las novedades.

## Decidido

- **Quien sale de la alianza en otro sistema** se queda allí. Basta con eso: puede crear una alianza de uno y proponer un viaje de vuelta.
- **Cobro al cancelar por zarpar**: se cobra la parte hecha, como cuando una misión expira.
- **Motores**: no afectan al salto. Dura los días del destino para todos, así la alianza llega junta.
- **Capítulos en grupo**: la historia es de la alianza y cada capítulo se vota como un viaje. Quien no va sigue en la alianza. Una sola cuota compartida, de 50 puntos por participante, y cada uno cobra la paga entera.
- **El fundador decide**: un viaje necesita su sí. Se descartaron que nadie saliera de la alianza (repartida entre sistemas), que solo el fundador propusiera y partir la alianza en dos.

## Por decidir

- **Quien dice que sí y luego no aporta** hace más grande la cuota de los demás. Se puede esperar a ver si pasa; si pasa, que salga del capítulo tras unos días sin aportar.
- **Misiones en grupo del tablón** (las que no son de historia): plan aparte.
