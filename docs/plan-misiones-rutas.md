# Misiones: rutas por etapas y habilidades de la tripulación

Sigue a [plan-misiones.md](plan-misiones.md), que ya está hecho: misiones sin plazo con distancia fija (fase A), amenaza y escudo (fase B) y rasgos (fase C). Este plan añade dos capas:

- **Fase D · Rutas por etapas** (idea 4): la misión se divide en tramos. Al acabar cada uno eliges por dónde seguir, y a veces hay un evento con una decisión.
- **Fase E · Habilidades de la tripulación** (idea 5): cada rol a bordo tiene una habilidad que se usa durante la misión y luego tarda en recargarse.

Se puede publicar cada fase por separado, y la D en dos partes (D1 sin eventos, D2 con eventos). La E no depende de la D, salvo en la habilidad de Navegación, que se apoya en los puntos de ruta.

## Reglas de fondo

Las mismas que en las fases A, B y C, más dos:

- **Ninguna decisión pide hacer más al día.** Las rutas cambian la distancia y la recompensa, pero la misión sigue sin plazo. Las habilidades se recargan con el tiempo, no con el esfuerzo.
- **Nada se bloquea esperando una decisión.** Mientras no elijas, lo que haces sigue sumando a la misión.

Las misiones que ya estén en marcha siguen como hasta ahora: sin `route`, no hay tramos, y sin habilidades guardadas, no hay enfriamientos.

## Fase D · Rutas por etapas

### Tramos

| Tamaño | Tramos | Decisiones | Tramo base |
|---|---|---|---|
| Corta (15) | 2 | 1 | 7,5 puntos |
| Media (30) | 3 | 2 | 10 puntos |
| Larga (60) | 4 | 3 | 15 puntos |

- El primer tramo siempre es directo. Al terminar cada tramo menos el último, llegas a un **punto de ruta** y eliges el siguiente entre **3 cartas** sorteadas.
- La distancia total (`quota`) es la suma de los tramos. Si eliges un tramo más largo o más corto, la misión cambia de tamaño.
- La bonificación de rapidez sigue contando desde la aceptación con los mismos días. Una maniobra arriesgada ayuda a conseguirla, y un yacimiento o una parada técnica la ponen más difícil: es parte de la decisión.
- Los capítulos de historia no tienen ruta. Son un solo tramo, como ahora.

### Tipos de tramo

| Tramo | Distancia | Efecto |
|---|---|---|
| Directo | ×1 | Ninguno |
| Maniobra arriesgada | ×0,7 | El próximo impacto será fuerte |
| Yacimiento | ×1,3 | Al completarlo, +2 materiales a la recompensa |
| Parada técnica | ×1,3 | Al completarla, repara un 10 % el módulo más dañado y recarga el escudo |
| Señal desconocida | ×1 | Al empezarlo, un evento (D2) |

- Las 3 cartas no se repiten. Directo sale siempre, para que nunca falte una opción neutra.
- La distancia de cada tramo se redondea a medio punto (mínimo 1).
- **Si no eliges**, lo hecho sigue sumando al tramo siguiente. Cuando lo eliges, sus efectos se aplican desde ese momento, y lo que ya hiciste cuenta. Si el tramo siguiente se termina sin haber elegido, cuenta como Directo.
- Los efectos de un tramo se dan una sola vez: si deshaces algo y la misión vuelve a un tramo anterior, no se pierden ni se repiten.

### Eventos (D2)

Un evento es un texto con 2 o 3 opciones. Algunas opciones solo están disponibles si hay a bordo alguien de cierto rol que esté trabajando (`working()`). Catálogo en `public/js/route-events.js`, con unos 12 eventos para empezar.

Efectos posibles, para que el catálogo sea fácil de ampliar:

| Efecto | Qué hace |
|---|---|
| `dist` | ± puntos al tramo actual |
| `mats` | ± materiales a la recompensa |
| `mc` | ± ¢ a la recompensa |
| `repair` / `damage` | ± estado al módulo más dañado o a uno general |
| `shield` | Recarga el escudo |
| `heavy` | El próximo impacto será fuerte (`true`) o normal (`false`) |
| `crewXp` | Experiencia para quien tenga el rol |
| `chance` | Probabilidad de cada resultado. El nivel del tripulante del rol la sube un 10 % por nivel |

Ejemplos:

- **Baliza de socorro.** Una cápsula de emergencia pide ayuda.
  - Desviarse: +3 de distancia, +1 material, +20 XP a la tripulación.
  - Seguir: nada.
- **Anomalía gravitatoria.**
  - *(Navegación)* Usarla de atajo: −4 de distancia.
  - Rodearla: +2 de distancia.
  - Atravesarla a ciegas: 50 %, −4 de distancia; 50 %, impacto fuerte inmediato.
- **Contrabandistas.** Ofrecen material dudoso.
  - *(Comercio)* Regatear: +2 materiales por 20 ¢ de la recompensa.
  - Rechazar: nada.
- **Avería en el reactor.**
  - *(Ingeniería)* Repararla sobre la marcha: nada.
  - Parar a repararla: +3 de distancia.

### Datos

El contrato guarda `route`:

```js
route: {
  legs: [{kind:'direct', len:10, done:true}, {kind:'mine', len:13, done:false}, …],
  at: 1,                  // tramo en curso
  pick: ['direct','short','station'] | null,   // cartas del punto de ruta pendiente
  event: {id, opts} | null                     // evento pendiente (D2)
}
```

`quota` sigue siendo el total, para no tocar la barra, el panel ni el cobro.

### Cambios en el código

| Dónde | Qué |
|---|---|
| `config.js` | `LEGS = {short:2, mid:3, long:4}` y `LEG_KINDS` (nombre, ×distancia, efecto, peso). |
| `core/route.js` (nuevo) | `newRoute(c)`, `legEnd(r, i)`, `checkLegs(c)` (marca tramos hechos, aplica sus efectos y prepara las cartas), `pickLeg(i)` y, en D2, `resolveEvent(opt)`. |
| `core/missions.js` | `contractFrom()` crea la ruta. `missionNight()` aplica el «próximo impacto fuerte» de la maniobra arriesgada. |
| `core/ship.js` | `addEffort()` llama a `checkLegs()` después de sumar. La parte de «misión completada» pasa a `finishIfDone()`, que también se usa al elegir un tramo más corto. |
| `store.js` | Normaliza `route`: tramos válidos y `quota` igual a su suma. |
| `ui/ship-view.js` | Tira de tramos en el panel de misión (hechos, actual y por venir) y la tarjeta del punto de ruta con las 3 cartas. |
| `ui/actions.js` | `chooseLeg()` y, en D2, `chooseEvent()`. |
| `public/js/route-events.js` (D2) | Catálogo de eventos, solo datos, como `missions.js`. |

## Fase E · Habilidades de la tripulación

### Cómo se usan

- Durante una misión sin plazo, cada **rol** con alguien a bordo trabajando tiene un botón con su habilidad. Si hay dos del mismo rol, cuenta el de más nivel.
- Usarla pone el rol en **enfriamiento**, en horas reales (como el escudo de Task Hero). El nivel lo acorta: Aprendiz 72 h, Veterano 60 h, Oficial 48 h y Élite 36 h.
- Las de «1 por misión» no tienen enfriamiento: se gastan hasta la misión siguiente.
- Usar una habilidad da 5 XP al tripulante.
- Quien no cobra (`owed`) o está sin contrato (`idle`) no puede usarla.

### Habilidades

| Rol | Habilidad | Efecto | Recarga |
|---|---|---|---|
| Ingeniería | Reparación de emergencia | +15 % de estado al módulo más dañado | Enfriamiento |
| Mantenimiento | Refuerzo del escudo | El escudo vuelve a estar listo ya | 1 por misión |
| Pilotaje | Maniobra evasiva | El próximo impacto fuerte pasa a normal | Enfriamiento |
| Navegación | Rumbo alternativo | En un punto de ruta, saca 2 cartas nuevas (con la fase D); sin ella, −10 % de la distancia que queda | 1 por misión |
| Intendencia | Doble turno | Lo próximo que completes cuenta ×2 para la misión | Enfriamiento |
| Instrucción | Moral alta | Anula un rasgo adverso durante 24 h | Enfriamiento |
| Prospección | Sondeo | +1 material a la recompensa | 1 por misión |
| Comercio | Buen contrato | +10 % de ¢ en la recompensa | 1 por misión |

- **Doble turno** se guarda en el contrato (`boost`) y lo gasta `addEffort()`. Si deshaces eso que lo gastó, el ×2 vuelve (`g.boost`).
- **Moral alta** guarda `{trait, until}`, y `traitMult()` y `missionNight()` se saltan ese rasgo hasta esa hora. Si hay dos rasgos adversos, eliges cuál anular.

### Datos

En el contrato: `cd: {role: readyAt}` para los enfriamientos, `used: [role]` para los de «1 por misión», `boost` y `suppress`. Todo se normaliza en `store.js` contra `ROLES` y `TRAITS`.

### Cambios en el código

| Dónde | Qué |
|---|---|
| `config.js` | `ABILITIES` (rol → nombre, descripción, `once` o enfriamiento) y `ABILITY_CD = [72,60,48,36]`. |
| `core/abilities.js` (nuevo) | `abilitiesFor(c)` (lo que hay a bordo y su estado), `useAbility(role)` y los efectos. |
| `core/ship.js` | `addEffort()` gasta `boost`; `onUndo()` lo devuelve. |
| `core/missions.js` | `traitMult()` y `missionNight()` respetan `suppress`. |
| `ui/ship-view.js` | Bloque «Tripulación» en el panel de misión: un botón por habilidad, con su recarga. |
| `ui/actions.js` | `useAbility()` con confirmación de un toque (como «Abandonar»). |

## Orden propuesto

1. **D1** (hecha): rutas y cartas, sin eventos.
2. **E**: habilidades. Rumbo alternativo usa los puntos de ruta si existen.
3. **D2**: eventos. Es lo que más texto pide, y se puede ir ampliando el catálogo poco a poco.

Cada parte con sus pruebas, su novedad en la bitácora y su PR.

## Pruebas

D1:
- El número de tramos por tamaño; `quota` es la suma de los tramos.
- Cada tipo de tramo cambia la distancia y aplica su efecto una sola vez, aunque se deshaga y se rehaga.
- Sin elegir, lo hecho sigue contando y el tramo cuenta como Directo.
- Cruzar dos puntos de ruta con un solo avance grande.
- Las misiones sin `route` y los capítulos de historia siguen como antes.

E:
- Solo aparecen las habilidades de roles a bordo y trabajando; cuenta el de más nivel.
- Enfriamiento según el nivel; las de «1 por misión» se gastan.
- Doble turno con deshacer; Moral alta anula el rasgo y caduca.
- Maniobra evasiva y Refuerzo del escudo con la fase B.

D2:
- Las opciones con rol solo están disponibles con ese rol a bordo.
- Cada efecto del catálogo; probabilidades con semilla fija.
- Todos los eventos del catálogo tienen opciones válidas.

## Decisiones tomadas

- **Abandonar no cobra nada**, como hasta ahora, aunque haya tramos completados. Así no compensa abandonar justo al acabar un tramo.
- **Sin energía**: las habilidades solo se recargan con el tiempo. Una barra que se carga con hábitos volvería a premiar hacer más al día.
- **Sin módulo Escudos** por ahora: Mantenimiento ya permite recargar el escudo.
