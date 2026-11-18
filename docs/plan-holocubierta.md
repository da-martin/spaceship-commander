# VR Training: Entrenamiento en Holocubierta

Un minijuego de rol dentro de Spaceship, aparte del juego principal. Es un simulador a bordo: lo que pasa dentro no tiene ninguna consecuencia en la nave, el monedero, el rango ni la tripulación. Se alimenta del esfuerzo del día y no devuelve nada.

- **Fase 1: Pasillo de decisiones.** Salas con una situación y 2 o 3 opciones que se resuelven con un dado y el rol del tripulante. 100 eventos en 5 escenarios y 3 personajes de serie.
- **Fase 2: Dados de escuadrón.** Combates por turnos con dados por rol. Los eventos de la fase 1 pasan a ser las salas de evento del mapa.

## Nombres

- Pestaña nueva en Spaceship: **Nave · Alianza · VR Training**.
- Título de la pantalla: **Entrenamiento en Holocubierta**.
- **Viene desactivado.** Se activa en Ajustes con el interruptor **VR Training** (`showVR`, por defecto `false`). Desactivado no hay pestaña ni se calcula nada; al volver a activarlo todo sigue donde estaba.
- El interruptor lleva una línea que explica qué es: «Minijuego de rol en un simulador. No afecta a tu nave ni a tus recompensas.»

## Cortafuegos

La regla de oro: **la Holocubierta lee, nunca escribe** fuera de lo suyo.

- Todo su estado va en `state.rpg`. Nada de lo que hace toca `wallet`, `ship`, `cmd`, `tasks`, `habits`, `projects` ni `focus`.
- Lo único que lee: los puntos de esfuerzo del día (`state.ship.activity`) para la energía, y la tripulación para los holoperfiles.
- Borrar la partida de VR Training (botón en su propia pantalla, con confirmación) solo vacía `state.rpg`.
- Viaja con la partida: archivos guardados y nube, como los ajustes.
- Nada de lo que se gana dentro sale fuera: ni ¢, ni méritos, ni materiales, ni mensajes a la alianza. Compartir logros con la alianza queda como idea para más adelante.

## Energía: cargas holo

Cada simulación cuesta **1 carga**.

| | Valor inicial |
|---|---|
| Puntos de esfuerzo por carga | 3 (≈ 3 tareas normales) |
| Cargas que se pueden ganar al día | 3 |
| Cargas guardadas como máximo | 3 |
| Primera simulación | Gratis (tutorial) |

- Las cargas del día se calculan con `state.ship.activity[hoy]`: `min(3, floor(puntos / 3))`. Como ese contador ya resta lo desmarcado, no hace falta escuchar marcas ni desmarcas.
- Se guarda cuántas se han abonado hoy (`credited`). Si el cálculo sube, la diferencia pasa al banco (hasta el máximo). Si baja porque se desmarcó algo, no se quita nada del banco, pero tampoco se vuelve a abonar al marcar de nuevo: el tope del día ya está contado.
- El tope diario es a propósito: la app sigue siendo de productividad con un juego al lado. No compensa inventarse tareas para jugar más.
- Todos los números van en una constante de configuración para ajustarlos tras probar.

## Plantel: holoperfiles

**3 personajes de serie**:

| Nombre | Rol | Papel en la simulación |
|---|---|---|
| Vega Ortiz | Pilotaje | Reflejos, esquivar, vehículos |
| Kofi Brandt | Ingeniería | Sistemas, hackear, reparar |
| Ada Marín | Mantenimiento | Curar, soporte vital |

- Son nivel 1 y siempre están disponibles, también para quien no juega a la nave.
- **Cada tripulante que se contrata en la nave deja un holoperfil** con su nombre, rol y nivel. Si alguien con el mismo nombre vuelve a subir de nivel, se guarda el más alto. Los holoperfiles no se pierden cuando el tripulante se va de la nave.
- Para enterarse de las contrataciones: un aviso nuevo `crewJoined(m)` en `core/events.js`, emitido al contratar. La Holocubierta lo escucha y apunta el perfil. La primera vez que se abre VR Training, también se copian los tripulantes que ya estén a bordo.

### Qué significa cada rol en la simulación

| Rol | Se usa para |
|---|---|
| Ingeniería | Hackear, reparar, desactivar |
| Mantenimiento | Curar, soporte vital, estabilizar |
| Navegación | Orientarse, elegir rutas, evitar trampas |
| Pilotaje | Esquivar, reflejos, manejar vehículos |
| Comercio | Negociar, regatear, convencer |
| Prospección | Escanear, detectar, encontrar botín |
| Intendencia | Gestionar suministros, improvisar |
| Instrucción | Liderar, calmar, inspirar al escuadrón |

## Una simulación

1. Se elige **escenario** (los bloqueados salen con candado).
2. Se elige **escuadrón**: 3 holoperfiles.
3. Se juegan **10 salas**: 8 eventos al azar del escenario (sin repetir), 1 sala de descanso fija (la 5) y 1 jefe (la 10).
4. Al final, resumen y desbloqueos.

Se puede salir en cualquier momento: la simulación se guarda y se retoma donde estaba. **Abandonarla** la termina sin devolver la carga.

### Recursos de la partida

Duran solo esa simulación.

- **Vida**: 3 por tripulante. A 0 queda **desconectado** y ya no puede hacer tiradas. Con los 3 desconectados, la simulación falla.
- **Suministros**: se empieza con 2. Gastar 1 permite **repetir una tirada** que haya salido mal. Las opciones seguras que cuestan suministros no se pueden elegir sin ellos.
- **Holoobjetos**: hasta 3 a la vez. Caen en algunos eventos. Son 12; la lista está en [holocubierta-estacion.md](holocubierta-estacion.md).

### La tirada

- Al elegir una opción con tirada, se elige qué tripulante la hace. Viene marcado el que más bono tiene.
- **d6 + bono** contra la dificultad de la sala.
- Bono: **+2** si el rol del tripulante es uno de los de la opción, **+0/+1/+2** según el nivel del holoperfil (1/2/3).
- Resultado:
  - **Éxito**: igual o mayor que la dificultad.
  - **Éxito con coste**: falla por 1. Se consigue, pero con el coste que diga el evento.
  - **Fallo**: lo demás.
- Dificultad por sala: salas 1–3 → 5 · salas 4–6 → 6 · salas 7–9 → 7 · jefe → 7. (Ajustada con el test de equilibrio; la primera propuesta, 4/5/6/6, salía demasiado fácil.)
- Antes de tirar se ve la probabilidad de éxito de cada tripulante, y se pueden gastar holoobjetos de tirada.
- Algunas opciones son **seguras**: no hay tirada y tienen un coste fijo (p. ej. «Retroceder: −1 suministro»).

### Sala de descanso

Elegir una: curar 1 de vida a todos, ganar 2 suministros o un holoobjeto al azar.

### Jefe

Tres pasos, cada uno con su texto y sus roles. **Hay que superar los 3.** Un éxito con coste supera el paso pero cuesta 1 de vida; un fallo cuesta 1 de vida a quien tiró y **se repite el paso**. Si el escuadrón entero cae, la simulación falla.

Así la vida con la que se llega al jefe es el margen para equivocarse, y lo que pasa en las salas cuenta. (La primera propuesta, «superar 2 de 3», hacía que las salas no importaran: todas las derrotas eran en el jefe y no dependían de cómo se llegaba.)

## Escenarios y eventos

100 eventos: **5 escenarios × 20 eventos**, más 5 jefes aparte.

Cada escenario se juega de una forma distinta y da protagonismo a roles distintos:

| # | Escenario | Tema | Cómo se juega | Roles que más brillan |
|---|---|---|---|---|
| 1 | Estación abandonada | Sistemas averiados, drones, salas a oscuras | Tecnología: arreglar, hackear, desactivar | Ingeniería, Mantenimiento |
| 2 | Mundo selvático | Fauna, clima, ruinas antiguas | Exploración: orientarse, descubrir, no perderse | Navegación, Prospección |
| 3 | Puerto franco | Ciudad mercado en un asteroide: contrabandistas, subastas, sobornos, apuestas, una facción que te quiere engañar | Social: se resuelve hablando más que esquivando | Comercio, Instrucción, Intendencia |
| 4 | Cinturón de asteroides | Persecución entre rocas, minería, piratas, averías en marcha | Acción y vehículos: reflejos y decisiones rápidas | Pilotaje, Navegación, Prospección |
| 5 | Luna helada | Ventiscas, cuevas bajo el hielo, una base científica sepultada | Supervivencia: frío, rescates y, sobre todo, suministros | Intendencia, Mantenimiento |

- Se desbloquean en ese orden: vencer al jefe de uno abre el siguiente. La Luna helada es la última y la más dura.
- Para que la Luna helada no se parezca a la selva: en la selva se explora y se descubre; en la luna el peligro es quedarse sin nada. Más eventos que gastan o piden suministros, y más opciones seguras con coste alto.
- Al jugar 8 de 20 eventos por simulación, cada partida es distinta.

### Formato

En `public/js/rpg/data.js`:

```js
{
  id: 'est-01', esc: 'estacion',
  title: 'Dron de seguridad',
  text: 'Un dron bloquea el pasillo. Su luz roja barre el suelo, cada vez más cerca.',
  opts: [
    { label: 'Hackearlo', roles: ['engineer'],
      ok:   { text: 'El dron se apaga y te abre paso.', item: 'chip' },
      part: { text: 'Se apaga, pero suelta una descarga.', hp: -1 },
      ko:   { text: 'Te detecta y dispara.', hp: -2 } },
    { label: 'Esquivarlo', roles: ['pilot', 'navigator'],
      ok:   { text: 'Pasas por debajo sin que te vea.' },
      part: { text: 'Pasas, pero pierdes material.', sup: -1 },
      ko:   { text: 'Te roza un disparo.', hp: -1 } },
    { label: 'Retroceder', safe: true,
      res:  { text: 'Das un rodeo largo.', sup: -1 } }
  ]
}
```

- Efectos posibles: `hp` (al que tiró), `hpAll` (a todo el escuadrón), `sup`, `item` (uno concreto o `'random'`). Nada más en la fase 1.
- Los eventos de cada escenario se escriben primero en un documento para revisarlos (el de la fase 1a: [holocubierta-estacion.md](holocubierta-estacion.md)) y después se pasan a `data.js`.
- 2 o 3 opciones por evento; como mucho una segura.

### Guía para escribirlos

- Texto de la situación: 280 caracteres como mucho. Textos de resultado: 160.
- Tono: ciencia ficción **seria en la mayoría de eventos**; el humor queda para unos pocos por escenario (en la Estación, más o menos 1 de cada 4). En segunda persona y en el mismo español que el resto de la app.
- Jefes: el de la Estación (CUSTOD-IA) es humorístico como prueba. Según cómo funcione, se decide si los demás jefes también lo son o van en serio.
- **Cada rol aparece en al menos 20 de los 100 eventos**, para que ningún tripulante sobre. Los de serie (Pilotaje, Ingeniería, Mantenimiento) no pueden ser los únicos que sirven en ningún escenario.
- Al revés también: **con solo los 3 de serie se tiene que poder ganar cualquier escenario**, aunque cueste más. Importa sobre todo en el Puerto franco, que es de roles que ellos no tienen. Por eso todo evento tiene al menos una opción con un rol de serie o una opción segura.
- Equilibrio: en cada escenario, la suma de lo que se puede perder en un fallo tiene que dejar ganar la simulación con algo de suerte y buenas decisiones. Se comprueba con un test que simula partidas.

## Registro de simulación

En la pantalla de entrada:

- Simulaciones jugadas, completadas y mejor sala alcanzada.
- Eventos descubiertos por escenario (p. ej. «Estación: 14/20»).
- Jefes vencidos.
- **Medallas** solo de la Holocubierta (p. ej. «Completar la Estación sin perder a nadie», «Ganar con un escuadrón sin personajes de serie»). Son de adorno y no salen de aquí.

## Pantallas

Pensadas para el móvil y para jugar con una mano.

1. **Entrada (VR Training)**: título «Entrenamiento en Holocubierta», cargas (●●○), escenarios, botón **Iniciar simulación** (o **Continuar** si hay una a medias) y registro.
2. **Escuadrón**: lista de holoperfiles con nombre, rol y nivel. Se eligen 3.
3. **Sala**: arriba, sala n/10, vida de cada tripulante, suministros y holoobjetos. En medio, la tarjeta del evento. Abajo, las opciones como botones, con los roles que dan bono. Al elegir: quién tira → dado animado (corto) → texto del resultado y sus efectos → **Continuar**.
4. **Fin**: completada o fallida, salas superadas, eventos nuevos, medallas y desbloqueos.

Sin cargas, el botón dice cuántos puntos de esfuerzo faltan para la próxima: «Te faltan 1,5 puntos de esfuerzo para la próxima carga».

## Código

- `public/js/rpg/`: lógica pura, sin DOM, como `core/`.
  - `config.js`: números de energía, dificultades, vida y suministros.
  - `data.js`: escenarios, eventos, jefes, holoobjetos y personajes de serie.
  - `energy.js`: cálculo de cargas a partir de `state.ship.activity`.
  - `run.js`: crear la simulación, resolver tiradas (con el azar inyectable para los tests), aplicar efectos, objetos, descanso y jefe.
  - `state.js`: `normRpg()` para la partida y las partidas guardadas.
- Ningún archivo de `rpg/` importa `store.js` ni `core/`: reciben `state.rpg` y lo que leen como argumentos. `test/architecture.test.js` lo comprueba.
- `public/js/ui/vr-view.js`: las pantallas.
- `store.js`: `st.rpg = normRpg(s?.rpg)` en `normState()` y en `freshState()`.
- `ui/mode.js` e `index.html`: la pestaña `data-stab="vr"`.
- `ui/settings.js`: el interruptor `showVR` en `normSettings()`.

### `state.rpg`

```js
{
  energy: { bank: 1, day: '2026-11-18', credited: 0, freeUsed: false },
  roster: [ { id, name, role, lv, src: 'serie' | 'crew' } ],
  unlocked: ['estacion'],
  run: null | { esc, squad: [{ id, hp }], sup, items: [], rooms: [...ids], i, pending },
  seen: { 'est-01': true, ... },
  stats: { runs: 0, wins: 0, best: 0, bosses: {} },
  medals: []
}
```

## Tests

- **Cortafuegos**: se juega una simulación completa con azar fijo y todo el estado salvo `state.rpg` queda idéntico (`deepEqual` con una copia de antes).
- **Arquitectura**: `rpg/` no toca el DOM ni importa de `ui/`. `core/` no importa nada de `rpg/`. `rpg/` no usa `addW`, `subW`, `addXP` ni escribe en `state.wallet`, `state.ship` ni `state.cmd`.
- **Energía**: cargas con 0, 2,9, 3, 6, 9 y 12 puntos; tope diario; tope del banco; desmarcar y volver a marcar no da cargas extra; cambio de día.
- **Tiradas**: bono por rol y nivel; éxito, éxito con coste y fallo en los límites; tripulante desconectado no puede tirar.
- **Eventos**: todos tienen el formato correcto; cada rol aparece en al menos 20; ids únicos; 20 por escenario; cada evento tiene una opción de rol de serie o una segura.
- **Equilibrio**: 1.000 simulaciones con un jugador automático razonable (`test/rpg-policy.js`). La Estación, que es el primer escenario, tiene que ganarse entre el 60 % y el 80 % de las veces (ahora, ~70 %); una persona gana algo menos. Los escenarios siguientes irán bajando. Con el escuadrón de serie, al menos el 25 % en todos.
- **Partidas guardadas**: `normRpg()` con `undefined`, con basura y con una simulación a medias.

## Fases

### Fase 1a: lo mínimo jugable

**Hecha.** Programada en `public/js/rpg/`, `public/js/ui/vr-view.js` y `test/rpg.test.js`.

- Motor, energía, 3 personajes de serie, pantallas y tests.
- Solo el escenario **Estación abandonada**: 20 eventos y su jefe.
- Interruptor en Ajustes (desactivado por defecto).
- Objetivo: que tu amigo lo pruebe y ajustar números.

### Fase 1b: más escenarios y holoperfiles

- **Mundo selvático** y **Puerto franco** (40 eventos y 2 jefes).
- Holoperfiles de la tripulación (`crewJoined`): el Puerto franco los pide, porque es donde más se nota tener Comercio o Instrucción.
- Registro de simulación y medallas.

### Fase 1c: completar

- **Cinturón de asteroides** y **Luna helada** (40 eventos y 2 jefes).

### Fase 2: Dados de escuadrón

Solo esbozo; se planifica aparte.

- Cada holoperfil aporta 2 dados cuyas caras dependen de su rol.
- Combates por turnos: se tiran los dados del escuadrón y se asignan a acciones. Los enemigos anuncian lo que harán el turno siguiente.
- Mapa ramificado: combate, evento (los de la fase 1), descanso y taller.
- Entre partidas: caras de dado mejoradas y reliquias de holocubierta.

## Decidido

- Personajes de serie: Vega Ortiz, Kofi Brandt y Ada Marín.
- VR Training viene desactivado por defecto.
- Hasta 3 simulaciones al día (3 cargas diarias, 3 guardadas como máximo).
- Escenarios (5, 100 eventos): Estación abandonada, Mundo selvático, Puerto franco, Cinturón de asteroides y Luna helada. Nave fantasma se descarta por parecerse demasiado a la Estación.

## Por decidir

- Ajustar los puntos de esfuerzo por carga (3) después de probarlo.
- Si más adelante habrá un ajuste general **Nivel de juego** (solo productividad / nave / nave + VR Training). Si existe, VR Training se oculta junto con Spaceship.
