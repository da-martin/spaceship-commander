# Viajes a otros sistemas

La alianza puede viajar junta a otro sistema siguiendo una historia. Viajar es **mudarse**: no hay vuelta obligatoria. En el nuevo sistema hay misiones propias y, según su historia, otros precios en el mercado, otro astillero y otro tablón de tripulación. Volver al Sistema Madre, o seguir hacia otro sistema, es otro viaje.

Las misiones en grupo quedan fuera de este plan: se planificarán aparte.

## Reglas de fondo

- Cada jugador está siempre en un sistema: `state.ship.system` (`'madre'` por defecto).
- **Toda la alianza está siempre en el mismo sistema**, o haciendo la misma travesía.
- Solo se viaja dentro de una alianza. Quien juega solo crea una alianza de uno: su votación se resuelve al momento.

## Sistemas

Cada sistema es una ficha en `public/js/systems.js`, como el catálogo de `missions.js`:

| Campo | Qué hace |
|---|---|
| `id`, `name`, `desc` | Identidad y texto de la tarjeta de destino |
| `days` | Días de travesía para llegar |
| `intro`, `travel[]` | Relato de llegada y un fragmento por día de travesía |
| `market` | Multiplicador de precio por material; un material puede no venderse allí |
| `yard` | Multiplicador del astillero; módulos que no se pueden mejorar allí |
| `missions` | Catálogo propio del tablón, con sus finales `win/partial/fail` |
| `story[]` | Capítulos de la historia del sistema (ver abajo) |
| `roles` | Opcional: roles de tripulación que salen en el tablón de tripulación |

El Sistema Madre también tiene ficha: es la que hoy está repartida entre `config.js`, `missions.js` y `core/shipyard.js`.

- `priceOf(k, día)` multiplica por `market[k]` del sistema en el que estás.
- `modCost(k)` multiplica por `yard.mult` y devuelve `null` en los módulos cerrados allí.
- `pickMission()` sortea solo del catálogo del sistema.

## Propuesta y votación

- **Cualquier miembro** propone un viaje desde la vista de alianza, eligiendo el destino. Quien propone vota sí.
- Solo hay una propuesta abierta a la vez, y no se puede proponer durante una travesía.
- La votación dura **3 días** (72 h desde que se propone).
- **Si todos dicen que sí, zarpan en ese momento**, sin esperar al plazo.
- Al cabo de 3 días, zarpan los que han dicho que sí. **Quien no ha confirmado se queda** en el sistema actual y sale de la alianza, con un aviso en el chat.
- Quien propone puede retirar la propuesta mientras esté abierta.
- Las votaciones y las salidas se anuncian en el chat como hitos (como los ascensos y las misiones).

## Al zarpar

- **La misión en curso se cancela sin penalización**: si es urgente, la reputación no se daña. Se cobra la parte hecha, como cuando expira.
- El tablón se vacía, porque sus misiones son del sistema que se deja, y la barra de señal vuelve a cero.
- Empieza la travesía.

Al votar que sí con una misión en curso, la tarjeta avisa de que se cancelará al zarpar.

## Travesía

- Es un contrato `kind: 'travel'` **sin cuota**, que dura los `days` del destino. Todos salen a la vez, así que todos llegan a la vez.
- Como en cualquier misión, durante la travesía no hay tablón, mercado ni astillero. Conviene prepararse antes de zarpar.
- Las tareas y los hábitos pagan como siempre. La tripulación gana su XP por día de misión y cobra su sueldo.
- Cada día de travesía llega a la bitácora un fragmento de la historia (`travel[]`).
- La travesía no se puede abandonar.
- **Llegada**: entrada grande en la bitácora con el relato del sistema (`intro`), y la señal empieza con una transmisión al momento, como la primera vez que se desbloquea la Antena.

## Vivir en otro sistema

- Mercado, astillero, tablón de misiones y tablón de tripulación funcionan con la ficha del sistema.
- Los textos que hoy dicen «de vuelta en el Sistema Madre» pasan a nombrar el sistema actual.
- **Historia del sistema**: los capítulos de `story[]` llegan al tablón de uno en uno, y cada uno cuando se termina el anterior. Son misiones sin plazo (ver abajo) con relato propio. De momento cada jugador avanza su historia por su cuenta.
- Cuando se acaba la historia se puede seguir en el sistema todo el tiempo que se quiera, con sus misiones normales.

## Misiones sin plazo

Valen para el Sistema Madre y para cualquier otro sistema.

- Llegan al tablón como las demás (más o menos 1 de cada 6) y caducan en el tablón igual que las otras.
- Cuota grande (entre 7 y 14 días al ritmo medio) y **sin plazo**: terminan cuando se cumple la cuota.
- La paga es fija: no sube con los días en el tablón.
- Se hacen **en órbita**: con una de estas en curso sigues teniendo mercado, astillero y tripulación. Su coste es que ocupan el hueco de misión: mientras la tengas no puedes aceptar otra.
- Se pueden abandonar sin daño de reputación y sin cobrar nada.

Hoy «tener misión» significa «estar fuera del sistema» (`atHome()`). Pasa a depender del tipo de contrato:

| `kind` | Qué es | ¿Fuera del sistema? |
|---|---|---|
| `run` | Misión normal del tablón | Sí |
| `orbit` | Misión sin plazo o capítulo de historia | No |
| `travel` | Travesía | Sí |

## Servidor

La alianza deja de ser solo «quién está con quién»: pasa a tener ubicación y votaciones.

- `alliances.system`: dónde está la alianza; `NULL` es el Sistema Madre.
- Tabla nueva `alliance_trips`: id, alianza, destino, quién la propone, `created_at`, `closes_at`, estado (`open`, `sailing`, `done`, `withdrawn`), `departed_at` y `arrives_at`.
- Tabla nueva `alliance_trip_votes`: viaje y jugador.
- **La votación se resuelve sin relojes**: cada petición a `/api/alliance` comprueba si todos han votado o si ha pasado `closes_at`, y si toca hace la salida (saca de la alianza a quien no votó, fija `departed_at` y `arrives_at` y escribe los hitos en el chat). No hace falta un cron.
- La foto de `GET /api/alliance` incluye la propuesta abierta y la travesía en curso.

En el cliente:

- Al recibir una salida que todavía no ha aplicado, la aplica: cancela la misión, vacía el tablón y crea el contrato de travesía con el `arrives_at` del servidor. Así funciona aunque la app estuviera cerrada cuando zarpó la alianza.
- Votar necesita conexión; la travesía en sí corre sin conexión, como cualquier misión.

## Partidas guardadas

- Sin `system` → `'madre'`.
- Contratos sin `kind` → `'run'`.

## Fases

1. **Sistemas en local**: `systems.js` con la ficha del Sistema Madre, `state.ship.system`, mercado, astillero y tablón por sistema, y el `kind` de los contratos. Sin cambios visibles.
2. **Misiones sin plazo** en el Sistema Madre: el tipo `orbit`, su oferta en el tablón y abandonarlas.
3. **Travesía**: el contrato `travel`, los fragmentos diarios y la llegada. Se prueba con una alianza de uno.
4. **Votación en el servidor**: tablas, propuesta, votos, salida perezosa e hitos en el chat.
5. **Contenido**: el primer sistema con su historia, su catálogo y su mercado, como se hizo con las holocubiertas.

## Por decidir

- **Nombre.** En este plan, «viaje» para lo que se propone y se vota y «travesía» para la misión de ir. Alternativas: «expedición», «salto».
- **Votar que no.** Hoy solo se vota sí o se calla. ¿Hace falta un «no» explícito? Si vota que no la mayoría, ¿se cancela la propuesta en vez de quedarse todos y zarpar quien propuso?
- **Invitaciones entre sistemas.** Si te invitan desde otro sistema, ¿aceptar lanza tu propia travesía hasta ellos, o solo se puede invitar a quien está en el mismo sistema?
- **Quien sale de la alianza en otro sistema** se queda allí. Puede crear una alianza de uno y proponer un viaje de vuelta. ¿Basta con eso?
- **Cobro al cancelar por zarpar.** Aquí se cobra la parte hecha; la alternativa es no cobrar nada.
- **Motores.** No acortan la travesía, para que la alianza llegue junta. Se podría usar el nivel de la nave más lenta.
- **Misiones en grupo**: plan aparte.
