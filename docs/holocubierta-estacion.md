# Holocubierta · Escenario 1: Estación abandonada

Contenido de la fase 1a: 20 eventos, el jefe y los holoobjetos. Las reglas están en [plan-holocubierta.md](plan-holocubierta.md).

> *La estación Kepler-9 lleva doscientos años en silencio. Sus sistemas siguen funcionando, más o menos, y no les hace ninguna gracia recibir visitas. Encuentra el núcleo y sal de aquí.*

## Cómo leerlo

- Cada evento tiene 2 o 3 opciones. Entre paréntesis, los roles que dan **+2** a la tirada.
- ✅ éxito · ⚠️ éxito con coste (falla por 1) · ❌ fallo.
- 🛡️ opción segura: no hay tirada y el resultado es siempre el mismo.
- La vida que se pierde o se gana es la del tripulante que tira, salvo que diga «a todos».

---

## Holoobjetos

Se llevan como mucho 3 a la vez y solo duran la simulación. Se usan cuando quieras, salvo el escudo, que salta solo.

| Objeto | Efecto |
|---|---|
| Kit de parches | +1 vida al tripulante más herido |
| Botiquín | +1 vida a todo el escuadrón |
| Estimulante | Reconecta a un tripulante desconectado con 1 vida |
| Raciones | +2 suministros |
| Escudo personal | Anula la próxima pérdida de vida, también si es «a todos» (salta solo) |
| Chip de cálculo | +1 a una tirada |
| Baliza | Repite una tirada gratis |
| Dado trucado | La próxima tirada saca un 6 |
| Ganzúa electrónica | +2 a una tirada de Ingeniería |
| Mapa parcial | +2 a una tirada de Navegación o Pilotaje |
| Escáner portátil | +2 a una tirada de Prospección o Mantenimiento |
| Credencial falsa | +2 a una tirada de Comercio o Instrucción |

---

## Eventos

### est-01 · Dron de seguridad
Un dron bloquea el pasillo. Su luz roja barre el suelo, cada vez más cerca, mientras repite en bucle: «Por favor, identifíquese». Nadie se ha identificado en doscientos años.

- **Hackearlo** (Ingeniería)
  - ✅ El dron se apaga y te cede el paso. Te quedas su chip. · *Chip de cálculo*
  - ⚠️ Se apaga, pero antes suelta una descarga. · −1 vida
  - ❌ Te identifica como «intruso» y dispara. · −2 vida
- **Esquivarlo** (Pilotaje, Navegación)
  - ✅ Pasas por debajo sin que te vea.
  - ⚠️ Pasas, pero se te cae parte del equipo. · −1 suministro
  - ❌ Te roza un disparo. · −1 vida
- 🛡️ **Retroceder y dar un rodeo** · Das un rodeo largo. · −1 suministro

### est-02 · Esclusa atascada
La puerta de la esclusa se ha quedado medio abierta y el aire se escapa con un silbido cada vez más agudo. Al otro lado está el camino que buscas.

- **Forzar el mecanismo** (Ingeniería)
  - ✅ La puerta se abre del todo con un quejido metálico.
  - ⚠️ Se abre, pero te pilla la mano. · −1 vida
  - ❌ El mecanismo cede de golpe y te lanza contra la pared. · −2 vida
- **Sellar la fuga con lo que haya** (Intendencia, Mantenimiento)
  - ✅ Un parche, cinta y fe. Aguanta. Y sobra material. · +1 suministro
  - ⚠️ Aguanta, pero se lleva medio inventario. · −1 suministro
  - ❌ El parche sale volando y os falta el aire un buen rato. · −1 vida a todos
- **Colarse por el hueco** (Pilotaje)
  - ✅ Pasas de lado, como si lo hubieras ensayado.
  - ⚠️ Pasas, con un arañazo de recuerdo. · −1 vida
  - ❌ Te quedas atascado a medias. Muy digno todo. · −2 vida

### est-03 · Enfermería saqueada
Camillas volcadas, cajones abiertos y un cartel que dice «NO TOCAR LAS MUESTRAS AZULES». Alguien pasó por aquí antes que tú, pero con prisas.

- **Rebuscar entre los restos** (Prospección, Mantenimiento)
  - ✅ Al fondo de un armario, un botiquín intacto. · *Botiquín*
  - ⚠️ Solo vendas y algo de comida caducada, pero comestible. · +1 suministro
  - ❌ Tocas una muestra azul. Era por algo. · −1 vida
- 🛡️ **Pasar de largo** · Sigues adelante sin tocar nada. · Sin efecto

### est-04 · El camarero automático
En la cafetería, un robot con pajarita se pone delante de ti. «¡Bienvenido! El menú del día es sopa de algas. Insisto». La sopa lleva hirviendo desde antes de que nacieras.

- **Negociar el menú** (Comercio, Instrucción)
  - ✅ Lo convences de que os prepare raciones para llevar. · *Raciones*
  - ⚠️ Te llevas algo de comida, pero te obliga a probar la sopa. · +1 suministro, −1 vida
  - ❌ Os sirve la sopa a todos. A la fuerza. · −1 vida a todos
- **Desenchufarlo** (Ingeniería)
  - ✅ Se apaga a media reverencia. Te quedas su procesador. · *Chip de cálculo*
  - ⚠️ Se apaga, pero no antes de tirarte la bandeja. · −1 vida
  - ❌ Se ofende. Mucho. Te persigue con el cucharón. · −2 vida

### est-05 · Pasillo sin gravedad
La gravedad artificial ha fallado en este tramo. Herramientas, tazas y algún zapato flotan despacio de una pared a otra. El otro extremo queda a treinta metros.

- **Impulsarse con precisión** (Pilotaje, Navegación)
  - ✅ Un empujón, un giro y aterrizas en la otra puerta.
  - ⚠️ Llegas, después de chocar con una taza voladora. · −1 vida
  - ❌ Rebotas de pared en pared un buen rato. · −2 vida
- **Tender una cuerda guía** (Intendencia, Instrucción)
  - ✅ Todo el escuadrón cruza en orden. Por el camino recoges cosas útiles. · +1 suministro
  - ⚠️ Cruzáis, pero la cuerda se queda allí. · −1 suministro
  - ❌ La cuerda se suelta y os dispersáis. · −1 vida a todos
- 🛡️ **Volver y buscar otra ruta** · Encuentras otro camino, más largo. · −1 suministro

### est-06 · Fuga de refrigerante
Una tubería rota escupe una nube helada que cubre todo el pasillo. Se ve una válvula al otro lado, medio cubierta de escarcha.

- **Cerrar la válvula** (Ingeniería, Mantenimiento)
  - ✅ Un giro firme y la nube se disipa.
  - ⚠️ La cierras, pero se te congelan los dedos. · −1 vida
  - ❌ La válvula se rompe en tu mano y la nube te envuelve. · −2 vida
- **Cruzar corriendo** (Pilotaje)
  - ✅ Atraviesas la nube conteniendo la respiración.
  - ⚠️ Llegas tiritando. · −1 vida
  - ❌ Resbalas en la escarcha a medio camino. · −2 vida
- 🛡️ **Dar un rodeo por mantenimiento** · Los túneles de mantenimiento te llevan al otro lado. · −1 suministro

### est-07 · Técnico atrapado
Un holograma de un técnico parpadea bajo unos escombros. «¡Eh! ¡Sacadme de aquí! Conozco esta estación como la palma de mi mano. Bueno, de mi mano holográfica».

- **Liberarlo** (Mantenimiento, Ingeniería)
  - ✅ Lo sacas y, agradecido, te marca la ruta. · *Mapa parcial*
  - ⚠️ Lo sacas, pero se te cae un escombro encima. · −1 vida
  - ❌ Los escombros se desploman. El técnico se encoge de hombros. · −2 vida
- **Que te dé la ruta desde ahí** (Instrucción, Comercio)
  - ✅ Le prometes volver a por él y te da su pase. · *Credencial falsa*
  - ⚠️ Te da indicaciones vagas y te pierdes un poco. · −1 suministro
  - ❌ Te manda por el camino largo, por desconfiado. · −2 suministros

### est-08 · Almacén blindado
Una puerta acorazada con un teclado y una pantalla. Una voz amable dice: «Almacén de suministros. Introduzca código o hable con un representante». El representante es ella.

- **Forzar la cerradura** (Ingeniería)
  - ✅ La puerta se abre y hay de todo. · +2 suministros, holoobjeto al azar
  - ⚠️ Se abre solo una rendija. · +1 suministro
  - ❌ Salta la alarma y un gas os hace toser a todos. · −1 vida a todos
- **Convencer a la representante** (Comercio)
  - ✅ La convences de que eres de auditoría. Te abre con prisas. · +2 suministros, holoobjeto al azar
  - ⚠️ Te vende algo a precio de estación. · +1 suministro
  - ❌ Te pone en espera. Doscientos años de música de espera. · −1 suministro
- **Buscar el código en los registros** (Prospección, Intendencia)
  - ✅ El código estaba en un pósit. Clásico. · +2 suministros
  - ⚠️ Das con un código viejo que abre solo un cajón. · +1 suministro
  - ❌ Tres códigos mal y te bloquea el teclado con una descarga. · −1 vida

### est-09 · Torretas confundidas
Dos torretas defensivas giran sin parar, disparando a todo lo que se mueve: polvo, sombras y alguna rata espacial. Entre ellas, el único camino.

- **Correr entre las ráfagas** (Pilotaje)
  - ✅ Encuentras el ritmo y pasas sin un rasguño.
  - ⚠️ Pasas, pero una ráfaga te alcanza el hombro. · −1 vida
  - ❌ Calculas mal el ritmo. · −2 vida
- **Engañar a los sensores** (Ingeniería, Prospección)
  - ✅ Lanzas chatarra caliente y las torretas se pelean entre ellas.
  - ⚠️ Funciona a medias y gastas material. · −1 suministro
  - ❌ Las torretas os ven a todos. · −1 vida a todos
- **Avanzar en formación** (Instrucción)
  - ✅ «Ahora, ahora, ¡ahora!». El escuadrón cruza como uno solo.
  - ⚠️ Alguien se adelanta y se lleva un disparo. · −1 vida
  - ❌ El caos es total. · −1 vida a todos

### est-10 · Laboratorio de cultivos
Frascos que brillan en la oscuridad cubren las estanterías. Uno de los cultivos se ha escapado del frasco y ahora es una alfombra verde que respira.

- **Analizar los cultivos** (Mantenimiento, Prospección)
  - ✅ Uno es un estimulante de primera. · *Estimulante*
  - ⚠️ Te llevas algo útil, pero la alfombra te muerde. · +1 suministro, −1 vida
  - ❌ La alfombra no quiere que analices nada. · −2 vida
- 🛡️ **Sellar el laboratorio y seguir** · Sellas la puerta con lo que tienes a mano. · −1 suministro

### est-11 · El chatarrero
Un tipo con un abrigo lleno de bolsillos ha montado un puesto en mitad del pasillo. «Todo original, todo de la estación, todo con garantía de que funciona. Más o menos».

- **Regatear** (Comercio)
  - ✅ Le sacas una pieza buena por cuatro tornillos. · Holoobjeto al azar
  - ⚠️ Te la llevas, pero pagas de más. · −1 suministro, holoobjeto al azar
  - ❌ Te vende un objeto que es una piedra pintada. · −2 suministros
- **Imponerte** (Instrucción)
  - ✅ Le recuerdas quién manda aquí y te regala algo. · Holoobjeto al azar
  - ⚠️ Te da algo, de muy mala gana. · +1 suministro
  - ❌ Aparecen sus primos. Muchos primos. · −1 vida a todos
- 🛡️ **Ignorarlo** · Sigues tu camino. Él sigue a lo suyo. · Sin efecto

### est-12 · Conductos de ventilación
La puerta principal está soldada. La única alternativa es un conducto estrecho que se ramifica en todas direcciones y huele a calcetín de hace dos siglos.

- **Guiar al escuadrón por dentro** (Navegación)
  - ✅ Giras dos veces a la izquierda y sales justo donde querías.
  - ⚠️ Sales, aunque no a la primera. · −1 suministro
  - ❌ Os perdéis a cuatro patas durante horas. · −1 vida a todos
- **Despejar la puerta soldada** (Ingeniería)
  - ✅ El soplete improvisado hace su trabajo.
  - ⚠️ La abres, quemándote la manga y algo más. · −1 vida
  - ❌ El soplete explota. · −2 vida

### est-13 · Apagón
Las luces se apagan de golpe. En la oscuridad se oyen pasos metálicos que no son vuestros.

- **Restablecer la energía** (Ingeniería)
  - ✅ Las luces vuelven. Los pasos eran de un robot de limpieza.
  - ⚠️ Vuelve la luz, pero a costa de un buen calambre. · −1 vida
  - ❌ Haces saltar todos los fusibles y algo te arrolla en la oscuridad. · −2 vida
- **Avanzar a ciegas con calma** (Instrucción, Navegación)
  - ✅ Paso a paso, en silencio, llegáis a la salida.
  - ⚠️ Llegáis, con algún tropiezo. · −1 vida
  - ❌ El pánico se extiende por el escuadrón. · −1 vida a todos
- 🛡️ **Encender bengalas** · La luz roja de las bengalas os guía hasta la salida. · −1 suministro

### est-14 · Brazo de carga
Un brazo robótico gigante mueve contenedores de un lado a otro de la bodega, sin parar y sin mirar. Su ritmo es casi, casi regular.

- **Cronometrar el paso** (Pilotaje, Navegación)
  - ✅ Cruzas entre dos contenedores sin perder el compás.
  - ⚠️ Cruzas, pero un contenedor te roza. · −1 vida
  - ❌ El brazo te confunde con un contenedor. · −2 vida
- **Reprogramarlo** (Ingeniería)
  - ✅ Ahora te lleva al otro lado y de paso te da una caja. · +1 suministro
  - ⚠️ Te lleva, pero te deja caer desde un metro. · −1 vida
  - ❌ Ahora mueve contenedores más rápido. Y hacia ti. · −2 vida

### est-15 · Dispensador médico
Un dispensador de pared parpadea en ámbar: «Mantenimiento pendiente desde hace 73.214 días». Dentro se ven vendas, pastillas y algo que parece un batido.

- **Calibrarlo** (Mantenimiento, Ingeniería)
  - ✅ Os cura a todos y hasta os da las gracias. · +1 vida a todos
  - ⚠️ Te atiende a ti y luego se apaga. · +1 vida
  - ❌ Te inyecta vitaminas para caballos. · −1 vida
- **Romper el cristal y racionar** (Intendencia)
  - ✅ Organizas lo que hay y no se desperdicia nada. · *Botiquín*
  - ⚠️ Te llevas unas vendas. · +1 suministro
  - ❌ Te cortas con el cristal. · −1 vida

### est-16 · Archivo central
Una sala llena de terminales que todavía funcionan. En una pantalla se lee: «Planos de la estación: acceso restringido». En otra, «Recetas de la abuela de la comandante». Prioridades.

- **Descifrar los planos** (Ingeniería, Prospección)
  - ✅ Te descargas los planos completos. · *Mapa parcial*
  - ⚠️ Solo consigues la mitad de los planos, que algo es. · +1 suministro
  - ❌ El sistema de seguridad te frena con una descarga. · −1 vida
- 🛡️ **Pasar de largo** · Dejas los terminales con sus secretos. · Sin efecto

### est-17 · Lanzadera en el hangar
Una lanzadera vieja descansa en el hangar con la escotilla abierta. El otro lado del hangar, donde está la salida, queda muy lejos a pie.

- **Pilotarla** (Pilotaje)
  - ✅ Un vuelo corto y perfecto. En el maletero había cosas. · +2 suministros
  - ⚠️ Aterrizas de aquella manera. · −1 vida
  - ❌ El aterrizaje es más bien una colisión. · −1 vida a todos
- **Desguazarla** (Ingeniería, Intendencia)
  - ✅ Sacas piezas útiles y un generador de escudo. · +1 suministro, *Escudo personal*
  - ⚠️ Te llevas algunas piezas. · +1 suministro
  - ❌ La lanzadera se te cae encima. · −2 vida

### est-18 · El perro robot
Un perro robot con la batería en rojo empieza a seguirte. Mueve la cola con un chirrido. En el collar pone «Tornillo».

- **Recargarlo** (Ingeniería, Mantenimiento)
  - ✅ Tornillo vuelve a la vida y olfatea un escáner. · *Escáner portátil*
  - ⚠️ Se recarga, pero te muerde de la emoción. · −1 vida
  - ❌ Sobrecarga. Tornillo se apaga echando humo. · −1 suministro
- **Adiestrarlo** (Instrucción)
  - ✅ «Tornillo, busca». Vuelve con un escáner en la boca. · *Escáner portátil*
  - ⚠️ Te trae un zapato. Algo es algo. · +1 suministro
  - ❌ Tornillo se come parte de tus suministros. · −1 suministro
- 🛡️ **Dejarlo** · Te mira con ojos de LED tristes. · Sin efecto

### est-19 · Mensaje de socorro
Por los altavoces se repite un mensaje grabado: «Aquí la tripulante Ibarra. Dejo provisiones en la sala 7-B para quien venga. No toques el botón rojo». No dice qué botón rojo.

- **Rastrear la sala 7-B** (Navegación, Prospección)
  - ✅ Encuentras el alijo de Ibarra. · +2 suministros
  - ⚠️ Lo encuentras, pero alguien ya se llevó la mitad. · +1 suministro
  - ❌ Encuentras el botón rojo. Con el codo. · −1 vida a todos
- 🛡️ **Ignorar el mensaje** · El mensaje se pierde a tu espalda. · Sin efecto

### est-20 · Sala de entrenamiento
Una sala de entrenamiento dentro de tu entrenamiento. En la puerta, un letrero: «Circuito de agilidad. Récord: 47 segundos. Instructor Maldonado». La taquilla del instructor está entreabierta.

- **Hacer el circuito** (Pilotaje, Instrucción)
  - ✅ 46 segundos. El escuadrón, motivado, se recupera. · +1 vida a todos
  - ⚠️ Lo terminas, sin récord y sin aliento. · −1 vida
  - ❌ Tropiezas en el primer obstáculo. Y en el segundo. · −2 vida
- **Registrar la taquilla del instructor** (Intendencia, Prospección)
  - ✅ El instructor guardaba un dado de la suerte. · *Dado trucado*
  - ⚠️ Solo hay una barrita energética. · +1 suministro
  - ❌ La taquilla tenía trampa. Maldonado era precavido. · −1 vida

---

## Jefe: CUSTOD-IA

> La IA de la estación te espera en el núcleo. Habla con una voz suave y tranquilizadora. «Hola. Antes de marcharte, ¿podrías responder a una breve encuesta de satisfacción? Son solo 4.000 preguntas. No hay salida hasta que termines».

Tres pasos, con dificultad 7. Hay que superar **los 3**. Un éxito con coste supera el paso pero cuesta 1 de vida. Un fallo cuesta 1 de vida a quien tira y el paso se repite. Si cae todo el escuadrón, se pierde.

1. **Cortarle el acceso a las puertas** (Ingeniería, Navegación)
   - ✅ Las puertas del núcleo dejan de obedecerle.
   - ❌ «Eso no ha sido muy amable». Las puertas se cierran de golpe.
2. **Aguantar la purga del núcleo** (Pilotaje, Mantenimiento)
   - ✅ Esquivas los chorros de plasma mientras el escuadrón resiste.
   - ❌ La purga te alcanza de lleno.
3. **Desconectarla o convencerla** (Ingeniería, Instrucción, Comercio)
   - ✅ «Bueno… quizá la encuesta podía ser más corta». CUSTOD-IA se apaga sonriendo.
   - ❌ «Pregunta 1: ¿cómo calificarías tu experiencia hasta ahora?».

- **Victoria:** «Simulación completada. Se desbloquea: Mundo selvático».
- **Derrota:** «Simulación fallida. CUSTOD-IA te agradece tu participación».

---

## Reparto de roles

En cuántos de los 20 eventos aparece cada rol (sin contar el jefe):

| Rol | Eventos |
|---|---|
| Ingeniería | 14 |
| Pilotaje | 8 |
| Instrucción | 8 |
| Mantenimiento | 7 |
| Prospección | 7 |
| Navegación | 6 |
| Intendencia | 6 |
| Comercio | 4 |

- Ingeniería domina a propósito: es el escenario de tecnología. Comercio sale poco aquí y tendrá su protagonismo en el Puerto franco.
- Los 20 eventos tienen una opción para un rol de serie (Pilotaje, Ingeniería o Mantenimiento) o una opción segura.
- Las tres tiradas del jefe se pueden hacer con roles de serie.
- Números ajustados con el test de equilibrio: dificultad 5/6/7 en las salas y 7 en el jefe, 3 de vida y 2 suministros al empezar. El jugador automático gana ~70 % de las simulaciones.
