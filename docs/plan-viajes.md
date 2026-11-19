# Viajes a otros sistemas

La alianza puede viajar junta a otro sistema siguiendo una historia. Lo que se propone y se vota es un **viaje**; la misión de ir de un sistema a otro es el **salto**. Viajar es **mudarse**: no hay vuelta obligatoria. En el nuevo sistema hay misiones propias y, según su historia, otros precios en el mercado, otro astillero y otro tablón de tripulación. Volver al Sistema Madre, o seguir hacia otro sistema, es otro viaje.

Las misiones en grupo quedan fuera de este plan: se planificarán aparte.

## Reglas de fondo

- Cada jugador está siempre en un sistema: `state.ship.system` (`'madre'` por defecto).
- **Toda la alianza está siempre en el mismo sistema**, o haciendo el mismo salto.
- Solo se viaja dentro de una alianza. Quien juega solo crea una alianza de uno: su votación se resuelve al momento.

## Sistemas

Cada sistema es una ficha en `public/js/systems.js`, como el catálogo de `missions.js`:

| Campo | Qué hace |
|---|---|
| `id`, `name`, `art`, `desc` | Identidad, artículo («el » en «el Sistema Madre») y texto de la tarjeta de destino |
| `days` | Días de salto para llegar |
| `intro`, `travel[]` | Relato de llegada y un fragmento por día de salto |
| `market` | Multiplicador de precio por material (×1 si no aparece); ×0 es que allí no se compra ni se vende |
| `yard` | `mult` del astillero (mejoras y reparaciones) y `closed`, los módulos que no se pueden mejorar allí (sí reparar) |
| `missions` | Catálogo del tablón: las misiones de `missions.js` con `system` igual al id del sistema (las que no lo llevan son del Sistema Madre) |
| `story[]` | Capítulos de la historia del sistema (ver abajo) |
| `roles` | Opcional: roles de tripulación que salen en el tablón de tripulación |

El Sistema Madre también tiene ficha: es la que hoy está repartida entre `config.js`, `missions.js` y `core/shipyard.js`.

- `priceOf(k, día)` multiplica por `market[k]` del sistema en el que estás, antes de redondear; `onSale(k)` dice si allí se comercia.
- `yardMult()` incluye `yard.mult`, así que afecta a mejoras y reparaciones; `yardClosed(k)` dice si el módulo está cerrado allí.
- `pickMission()` sortea solo del catálogo del sistema. Las historias de las misiones se buscan en todos los catálogos, porque una misión aceptada puede ser de otro sistema.
- `here()` da la ficha del sistema actual y `herePrep('en' | 'de' | 'a')` su nombre con preposición («en el Sistema Madre», «del…», «al…»).

## Propuesta y votación

- **Cualquier miembro** propone un viaje desde la vista de alianza, eligiendo el destino. Quien propone vota sí.
- Solo hay una propuesta abierta a la vez, y no se puede proponer durante un salto.
- Cada miembro vota **sí** o **no**, y puede cambiar su voto mientras la votación esté abierta.
- La votación dura **3 días** (72 h desde que se propone).
- **Si todos dicen que sí, zarpan en ese momento**, sin esperar al plazo.
- **Si más de la mitad dice que no, la propuesta se cancela en ese momento** y nadie se mueve. Un empate no cancela.
- Al cabo de 3 días, zarpan los que han dicho que sí. **Quien ha dicho que no o no ha votado se queda** en el sistema actual y sale de la alianza, con un aviso en el chat.
- Quien entra en la alianza con una votación abierta también vota, y cuenta para la mayoría.
- Quien propone puede retirar la propuesta mientras esté abierta.
- Las votaciones y las salidas se anuncian en el chat como hitos (como los ascensos y las misiones).

## Al zarpar

- **La misión en curso se cancela sin penalización**: si es urgente, la reputación no se daña. Se cobra la parte hecha, como cuando expira.
- El tablón se vacía, porque sus misiones son del sistema que se deja, y la barra de señal vuelve a cero.
- Empieza el salto.

Al votar que sí con una misión en curso, la tarjeta avisa de que se cancelará al zarpar.

## Salto

- Es un contrato `kind: 'jump'` **sin cuota**, que dura los `days` del destino. Todos salen a la vez, así que todos llegan a la vez.
- Como en cualquier misión, durante el salto no hay tablón, mercado ni astillero. Conviene prepararse antes de zarpar.
- Las tareas y los hábitos pagan como siempre. La tripulación gana su XP por día de misión y cobra su sueldo.
- Cada día de salto llega a la bitácora un fragmento de la historia (`travel[]`).
- El salto no se puede abandonar.
- **Llegada**: entrada grande en la bitácora con el relato del sistema (`intro`), y la señal empieza con una transmisión al momento, como la primera vez que se desbloquea la Antena.

## Vivir en otro sistema

- Mercado, astillero, tablón de misiones y tablón de tripulación funcionan con la ficha del sistema.
- Los textos que hoy dicen «de vuelta en el Sistema Madre» pasan a nombrar el sistema actual.
- **Historia del sistema**: los capítulos de `story[]` llegan al tablón de uno en uno, y cada uno cuando se termina el anterior. Son misiones sin plazo (ver abajo) con relato propio. De momento cada jugador avanza su historia por su cuenta.
- Cuando se acaba la historia se puede seguir en el sistema todo el tiempo que se quiera, con sus misiones normales.

## Invitaciones entre sistemas

- Se puede invitar a alguien que está en otro sistema. La invitación dice dónde está la alianza.
- **Aceptar una invitación desde otro sistema lanza tu propio salto** hasta el sistema de la alianza, con los días de ese destino. Tu misión en curso se cancela sin penalización, igual que al zarpar.
- Si la alianza está en pleno salto, saltas a su destino.
- Quien está saltando no puede aceptar invitaciones hasta llegar.
- Durante tu salto ya eres miembro: tienes chat y votas, pero no puedes proponer viajes hasta llegar.

## Misiones sin plazo

Valen para el Sistema Madre y para cualquier otro sistema. Te sacan del sistema como cualquier otra misión; lo único que cambia es que no tienen plazo.

- Llegan al tablón como las demás (`OPEN_P` en `config.js`; la idea es 1 de cada 6) y caducan en el tablón igual que las otras. **Por ahora `OPEN_P` es 0**: el código está, pero no llega ninguna.
- Cuota de entre 6 y 9 días al ritmo medio: algo más que una misión normal (de 2 a 7 días, según los Motores), pero sin llegar a semanas, porque mientras dura estás sin mercado, astillero, tripulación ni tablón. Terminan al reunir la cuota.
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
| En el sistema | Planeta en la esquina, todo quieto | Apagados: la nave espera |
| En misión (con plazo o sin él) | Sin planeta; las estrellas caen como trazos cortos | Encendidos |
| Salto | Túnel de luz violeta delante del morro del que brotan las estrellas | A tope, estela larga |

## Servidor

La alianza deja de ser solo «quién está con quién»: pasa a tener ubicación y votaciones.

- `alliances.system`: dónde está la alianza; `NULL` es el Sistema Madre.
- Tabla nueva `alliance_trips`: id, alianza, destino, quién la propone, `created_at`, `closes_at`, estado (`open`, `sailing`, `done`, `withdrawn`), `departed_at` y `arrives_at`.
- Tabla nueva `alliance_trip_votes`: viaje, jugador y voto (sí o no). El estado de `alliance_trips` admite también `cancelled`.
- **La votación se resuelve sin relojes**: cada petición a `/api/alliance` comprueba si todos han votado que sí, si más de la mitad ha votado que no o si ha pasado `closes_at`. Si hay mayoría de no, cancela; si toca zarpar, hace la salida (saca de la alianza a quien no votó, fija `departed_at` y `arrives_at` y escribe los hitos en el chat). No hace falta un cron.
- La foto de `GET /api/alliance` incluye la propuesta abierta y el salto en curso.

En el cliente:

- Al recibir una salida que todavía no ha aplicado, la aplica: cancela la misión, vacía el tablón y crea el contrato de salto con el `arrives_at` del servidor. Así funciona aunque la app estuviera cerrada cuando zarpó la alianza.
- Votar necesita conexión; el salto en sí corre sin conexión, como cualquier misión.

## Partidas guardadas

- Sin `system` → `'madre'`.
- Contratos sin `kind` → `'run'`.

## Fases

1. **Sistemas en local** (hecha): `systems.js` con la ficha del Sistema Madre, `state.ship.system`, mercado, astillero, tablón y candidatos por sistema, el `kind` de los contratos y `docked()`. Sin cambios visibles. Pendiente para la fase 3: `normShip` descarta los contratos con cuota 0, y el salto los necesita.
2. **Misiones sin plazo** (hecha, sin activar): el tipo `open`, su oferta en el tablón (`genOpenOffer`), aceptarlas (`contractFrom`), las 8 misiones sin plazo del Sistema Madre y la escena del salto en el dibujo de la nave. Para que lleguen al tablón basta con subir `OPEN_P`; entonces tocará anunciarlo en las novedades.
3. **Salto**: el contrato `jump`, los fragmentos diarios y la llegada. Se prueba con una alianza de uno.
4. **Votación en el servidor**: tablas, propuesta, votos, salida perezosa e hitos en el chat.
5. **Contenido**: el primer sistema con su historia, su catálogo y su mercado, como se hizo con las holocubiertas.

## Por decidir

- **Quien sale de la alianza en otro sistema** se queda allí. Puede crear una alianza de uno y proponer un viaje de vuelta. ¿Basta con eso?
- **Cobro al cancelar por zarpar.** Aquí se cobra la parte hecha; la alternativa es no cobrar nada.
- **Motores.** No acortan el salto, para que la alianza llegue junta. Se podría usar el nivel de la nave más lenta.
- **Misiones en grupo**: plan aparte.
