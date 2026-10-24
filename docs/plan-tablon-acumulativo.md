# Tablón de misiones acumulativo

Las misiones dejan de renovarse en bloque cada día. Llegan de una en una con la señal, se quedan en el tablón hasta que caducan y el comandante decide cuándo coger cada una.

## Tablón

- Cada misión tiene caducidad propia: entre 3 y 6 días desde que llega (contando el día de llegada). La tarjeta muestra «caduca hoy», «caduca mañana» o «caduca en N días».
- Capacidad: 3 huecos + 1 por nivel efectivo de **Puente**.
- Si el Puente se daña y la capacidad baja, no se borra nada: solo deja de entrar señal hasta que vuelva a haber hueco.
- Cada misión se puede **descartar** gratis (dos toques: ✕ y confirmar).

## Señal

- Una barra de señal se llena en tiempo real. Cada vez que llega al 100 % entra una misión.
- Velocidad: 1 misión al día + 0,5 por nivel efectivo de **Antena**.
- Si el tablón está lleno, la barra se queda al 100 % y la misión entra en cuanto se libera un hueco.
- La tarjeta indica «Próxima transmisión en ~N h».
- Si la app lleva días sin abrirse, se simulan día a día las llegadas y caducidades (como mucho los últimos 7 días).

## Barrido de señal

Sustituye a la renovación del tablón.

- Hace llegar una misión al momento: la barra se llena, entra la misión y la barra vuelve a cero.
- Cuesta lo que le falta a la barra: 15 ¢ × fracción pendiente, redondeado hacia arriba (mínimo 1 ¢).
- Necesita un hueco libre y solo funciona en el Sistema Madre.
- Sin límite diario: tras un barrido la barra queda a cero y el siguiente cuesta el precio completo.

## Paga que sube

- Cada día que una misión sigue en el tablón, su paga en ¢ sube un 5 %. Los materiales no cambian.
- La subida se fija al aceptar la misión.

## Misiones urgentes

- Más o menos 1 de cada 5 misiones es urgente: caduca en 1–2 días y paga un 50 % más.
- **Fallar** una urgente (que expire sin completar la cuota, o abandonarla): sin cobro y **reputación dañada 3 días**.
- Dejarla caducar en el tablón sin aceptarla no se penaliza.
- Con la reputación dañada la señal va a la mitad de velocidad y no llegan urgentes, tampoco con el barrido.
- La hoja de servicios cuenta las urgentes fallidas.

## Durante una misión

- El tablón sigue recibiendo misiones y caducando.
- La vista de misión muestra una línea de solo lectura con el estado del tablón.
- Al volver al Sistema Madre aparece un aviso: «Tablón: 3 transmisiones nuevas · 1 caducada».

## Módulos

| Módulo | Antes | Ahora |
|---|---|---|
| Puente | +1 misión en el tablón | +1 hueco en el tablón |
| Antena | Renovaciones gratis al día | +0,5 misiones al día (la señal llega antes) |
| Bodega | Bonus fijado al generar la misión | Bonus aplicado al cobrar |
| Motores | Duración máxima | Sin cambios |

## Tripulación

Sin cambios: la Navegación sigue sumando ¢ al cobrar y los candidatos se renuevan cada domingo.

## Partidas guardadas

- Las misiones que ya estaban en el tablón pasan a caducar en 3 días (hoy incluido).
- A esas misiones y a la misión en curso se les descuenta el bonus de Bodega que ya traían, porque ahora se aplica al cobrar.
- La renovación desaparece. La primera vez llega una transmisión al momento.
