# Dificultad de tareas y hábitos

Cada tarea y cada hábito lleva una dificultad que vale **puntos de esfuerzo**. El punto de esfuerzo pasa a ser la unidad de todo lo que se gana o se pierde al completar (o fallar) algo, y también la unidad de las misiones.

| Dificultad | Puntos de esfuerzo |
|---|---|
| Fácil | 0,5 |
| Normal | 1 |
| Difícil | 2 |

- La base es el hábito de hoy: **1 punto = lo que da hoy un hábito normal sin prioridad**.
- Las tareas, que hoy dan el doble que los hábitos, pasan a dar lo mismo.
- Todo lo que ya existe pasa a **Normal**. Las partidas guardadas no se migran: un elemento sin dificultad se lee como `normal`.

## Datos

- Campo nuevo `diff: 'easy' | 'normal' | 'hard'` en tareas y hábitos. `normState()` pone `'normal'` si falta o no es válido.
- Constante nueva `EFFORT = {easy:0.5, normal:1, hard:2}`, separada de `DIFFS` (que es la dificultad de las misiones y tiene otros campos). Los nombres y colores de las etiquetas se reutilizan para que se lea igual.
- Cada recompensa guarda los puntos que dio (`g.ef`). Al desmarcar se resta lo guardado, así que cambiar la dificultad de algo ya completado no afecta a lo que ya se ganó: solo cuenta para lo próximo. Las recompensas antiguas sin `g.ef` cuentan como 1.

## Recompensas al completar

Por punto de esfuerzo, redondeando a la unidad más cercana:

| | Antes | Ahora (× puntos) |
|---|---|---|
| Tarea | 10 ¢ (15 ¢ con ★) · 10 méritos | 5 ¢ · 5 méritos |
| Hábito diario/semanal | 5 ¢ (8 ¢ con ★) · 5 méritos | 5 ¢ · 5 méritos |
| Hábito libre, cada toque | 2 ¢ | 2 ¢ |
| Hábito libre, primer toque del día | 5 méritos y +1 a la misión | 5 méritos y sus puntos a la misión |
| Material del área | +1 | +1 (no depende de la dificultad) |
| Reparación del módulo | 2 % | 2 % |

Ejemplos: tarea fácil 2,5 → 3 ¢; hábito difícil 10 ¢ y 10 méritos; un toque de un hábito libre fácil da 1 ¢.

- **★ Prioridad**: deja de dar ¢ extra. Solo sirve para ordenar y filtrar.
- **Hábitos libres**: también tienen dificultad. Se mantiene la regla actual: solo el primer toque del día cuenta para misión, méritos, material y reparación. Cada toque paga 2 ¢ × puntos.
- **Material del área**: siempre +1, sea cual sea la dificultad. La Prospección sigue igual.
- **Protocolo Forster (modo Focus)**: «Completado» da lo mismo que completar el elemento desde su lista. El «Progreso» se queda en una recompensa pequeña (ver abajo).

## Progreso en el modo Focus

Marcar Progreso tiene que dar solo un poquito:

| | Antes | Ahora |
|---|---|---|
| Puntos de esfuerzo | — (no contaba para la misión) | **0,1** |
| Méritos | 2 | **1** |
| ¢ | 1 + Pilotaje | **solo Pilotaje** (0 sin piloto a bordo) |

- Siempre 0,1, sea cual sea la dificultad de la línea, también en las acciones rápidas.
- Los 0,1 suman al progreso de la misión activa (si se hacen dentro de su plazo) y a `ship.activity` del día, así que también cuentan en el ritmo de 14 días.
- No da material, no repara y no desgasta.
- Desaparece `PROGRESS_MC`. Pilotaje (+1/2/3 ¢ por Progreso) pasa a ser lo único que da ¢ al marcar Progreso. Su descripción no cambia.
- `XP_PROGRESS` baja de 2 a 1.
- Si no hay piloto, el aviso del Progreso no menciona ¢. El contador de ¢ de la sesión y de la ronda solo suma el bono de Pilotaje.

## Acciones rápidas del modo Focus

Las acciones rápidas (las que se escriben directamente en la lista del Focus) pasan a ser **el equivalente a una tarea Fácil**:

- **Completarla** da lo mismo que una tarea fácil: 0,5 puntos de esfuerzo a la misión y al ritmo diario, 2,5 → 3 ¢ (+ Intendencia) y 2,5 → 3 méritos. Hoy no dan nada: solo sale «Acción hecha».
- No tienen área, así que no dan material. La reparación va, como en cualquier tarea sin área, al módulo general más dañado (× 0,5).
- No tienen fecha, así que nunca desgastan.
- La recompensa se guarda en la línea (`l.grant`), igual que en las tareas, para poder restarla si hiciera falta.
- **Progreso**: igual que cualquier otra línea, 0,1 puntos y 1 mérito.
- **Al salir del Focus**, las que se eligen conservar se convierten en una tarea normal sin fecha con dificultad **Fácil**. Desde ahí se editan como cualquier tarea: dificultad, fecha, áreas, proyecto, etc.
- Mientras siguen siendo acciones rápidas no tienen selector de dificultad: siempre son Fáciles. Editarlas en el Focus sigue siendo solo cambiar el nombre.
- La línea del Focus no lleva etiqueta «Fácil»: ya se distingue por su icono de acción rápida. Cuando pasa a tarea sí la lleva, como cualquier tarea fácil.

## Desgaste y reparación

Ambos se multiplican por los puntos del elemento:

- Hábito diario/semanal fallado: 5 % × puntos (difícil 10 %, fácil 2,5 → 3 %).
- Tarea atrasada, por cada día: 2 % × puntos (difícil 4 %, fácil 1 %).
- Reparación al completar: (2 % + Mantenimiento) × puntos.
- Ingeniería sigue reduciendo el desgaste en porcentaje, como ahora.

## Misiones

- La cuota se mide en **puntos de esfuerzo**, no en número de tareas y hábitos. Completar algo suma sus puntos al progreso; desmarcarlo los resta.
- El progreso puede tener decimales: «4,5/8» o «4,6/8» con los Progresos del Focus. Se guarda redondeado a una décima para evitar errores de coma flotante (0,1 + 0,2 ≠ 0,3), y se muestra con coma. La cuota sigue siendo un número entero (mínimo 2).
- El ritmo diario de 14 días (`avgDaily`) suma puntos en vez de contar elementos:
  - `ship.activity[día]` acumula puntos con decimales (redondeados a una décima), incluidos los Progresos del Focus.
  - El historial usa los `g.ef` guardados de cada día. Si no hay, usa la dificultad actual del elemento, o 1 en lo antiguo.
  - El mínimo de 1,5 al día se queda.
- La paga sigue siendo cuota × 12 ¢ × multiplicador de la dificultad de la misión: ahora es por punto de esfuerzo en vez de por elemento.
- Las misiones activas y las del tablón no cambian: hoy todo es normal, así que un elemento = un punto.
- El cobro parcial al expirar sigue siendo progreso / cuota.

## Tripulación

- **Intendencia**: sigue dando +% ¢ en tareas, sobre la paga nueva (5 ¢ × puntos).
- **Instrucción**: pasa de +1/2/3 ¢ por hábito a +1/2/3 ¢ **por punto de esfuerzo** en hábitos diarios y semanales. La descripción del rol cambia a «… por punto de esfuerzo en hábitos».
- Los tripulantes ya contratados conservan su rol y su nivel.

## Interfaz

- **Formulario de crear/editar** tarea y hábito: un selector de tres botones Fácil · Normal · Difícil con los puntos debajo (0,5 · 1 · 2). Normal viene marcado por defecto. Está también en los hábitos libres.
- **Listas** (Hoy, Tareas, Hábitos, Protocolo Forster): una etiqueta discreta solo para Fácil y Difícil; Normal no lleva nada.
- Lo que se crea sin formulario nace Normal (los hábitos de ejemplo de la bienvenida), salvo las acciones rápidas del Focus que se guardan como tareas, que nacen Fáciles.
- Textos que cambian:
  - Tablón: «Completa N hábitos o tareas en X días» → «Reúne N puntos de esfuerzo en X días».
  - Misión en curso: «Cada hábito o tarea completada suma 1» → «Cada hábito o tarea suma sus puntos de esfuerzo (fácil 0,5 · normal 1 · difícil 2)».
  - Ayuda del tablón (`index.html`, línea ~420): «suma progreso» → «suma sus puntos de esfuerzo».
  - Hoja de servicios: «Méritos: tarea +10 · hábito +5 · …» → «Méritos: +5 por punto de esfuerzo · progreso +1 · …».
  - El chip de la cabecera y el estado de la nave muestran el progreso con decimales: «4,6/8».

## Sin cambios

- Servidor y base de datos: la partida se guarda como un bloque, así que no hace falta migración.
- Rangos, precios del astillero, sueldos, mercado y barrido de señal.
- El cálculo de méritos para partidas muy antiguas (`retroXP`) sigue contando 10/5: solo se usa una vez, en partidas que no tenían méritos.

## Impacto en la economía

- Quien hace sobre todo **tareas** gana la mitad de ¢ y méritos por tarea normal, y nada extra por la prioridad. Para recuperarlo, las tareas grandes se marcan como Difíciles.
- Quien hace sobre todo **hábitos** solo pierde el extra de la prioridad (8 → 5 ¢).
- Las misiones pagan lo mismo por punto, pero sus cuotas se adaptan solas al ritmo en puntos de los últimos 14 días.
