# Despliegue y acceso

La app pasó de ser un `index.html` suelto en GitHub Pages a un Worker de
Cloudflare que sirve `public/` y expone `/api/*` para cuentas y partidas.

## Puesta en marcha

### 1. Base de datos

```bash
npx wrangler login
npx wrangler d1 create spaceship-commander
```

Copia el `database_id` que devuelve y pégalo en `wrangler.jsonc`. Luego aplica
el esquema:

```bash
npm run db:local    # para desarrollo
npm run db:remote   # para producción
```

### 2. Desarrollo y despliegue

```bash
npm run dev      # http://localhost:8787
npm run deploy
```

No hace falta configurar nada más: **no hay secretos ni servicios externos**.

Tras el primer despliegue, desactiva GitHub Pages (Settings → Pages) para que
no quede sirviéndose una versión vieja en paralelo.

## Cuentas

Cualquiera puede crearse una cuenta desde **Menú → Entrar → Crear cuenta**, con
un nombre (3–24 caracteres) y una contraseña (mínimo 8). No hace falta pasar
por ti. El nombre es a la vez el usuario y el nombre visible, y no distingue
mayúsculas: «Ana» y «ana» son la misma cuenta.

El navegador recuerda la sesión 90 días. Desde su cuenta, cada persona puede
cambiar la contraseña, y al hacerlo se cierran sus otros dispositivos.

Para ver quién tiene cuenta:

```bash
npm run reset-password -- --list
```

### Las cuentas de antes, con clave de acceso

Quien recibió una clave `sc_…` de `invite.mjs` la escribe **como contraseña**,
junto a su nombre. La app le pide entonces que elija una contraseña de verdad,
y a partir de ahí la clave deja de valer. No tienes que hacer nada. En
`--list` aparecen como «aún entra con su clave de antes» hasta que lo hagan.

### Si alguien olvida su contraseña

No hay correo con el que mandar un enlace, así que la recuperación pasa por ti:

```bash
npm run reset-password -- "Ana"          # producción
npm run reset-password:local -- "Ana"    # base local
```

Le pone una contraseña temporal, que se imprime **una sola vez**, cierra sus
sesiones y **no toca su partida**. Mándasela en privado: entra con ella y la
cambia en Menú → su nombre → Cambiar contraseña.

### Cómo se guardan las contraseñas

Con **PBKDF2-SHA256 de Web Crypto, 30.000 iteraciones y una sal aleatoria por
usuario** (`src/password.js`). Es nativo en Workers, así que no hay
dependencias.

OWASP recomienda 600.000 iteraciones, pero el plan gratis de Workers da 10 ms de
CPU por petición. Medido: ~0,11 µs por iteración, así que 30.000 son ~3,3 ms.
Ninguna petición hace más de dos hashes: cambiar la contraseña verifica la
actual y guarda la nueva. Las iteraciones van dentro del hash
(`pbkdf2$30000$sal$hash`), así que se pueden subir con el plan de pago sin
romper nada: cada contraseña se rehashea la próxima vez que su dueño entra.

Contra quien prueba contraseñas desde fuera, el límite está en el número de
intentos, que se cuenta en D1 **antes** de hashear para que nadie pueda gastar
nuestra CPU:

| Qué           | Límite                                  |
| ------------- | --------------------------------------- |
| Login fallido | 10 por usuario y 30 por IP cada 15 min  |
| Registro      | 10 por IP cada hora                     |

Tanto si el usuario no existe como si la contraseña está mal, la respuesta es
la misma.

**Lo que no cubre:** no hay *pepper* (un secreto del Worker mezclado con cada
contraseña). Por eso, si alguien se llevara una copia de la base D1, podría
probar contraseñas por su cuenta, y las débiles caerían rápido con 30.000
iteraciones. Añadirlo cuesta un `wrangler secret put` y obliga a no perder
nunca ese secreto.

Las contraseñas viajan siempre en el cuerpo de la petición, nunca en la URL,
para que no acaben en el historial del navegador ni en los registros del
servidor.

## Cómo funciona la sincronización

El servidor **solo almacena**: la economía se sigue calculando en el cliente.

- `localStorage` sigue siendo la fuente inmediata, así que sin cuenta o sin
  conexión la app se comporta igual que siempre.
- `save()` escribe en local y programa un envío agrupado (1,5 s) a
  `PUT /api/state`. Ninguna de las ~43 llamadas a `save()` tuvo que cambiar.
- Cada escritura sube `saves.rev`. Si dos dispositivos escriben desde el mismo
  `rev`, el segundo recibe un `409` con la copia del servidor y la app pregunta
  cuál conservar, reutilizando `summary()` y `applySave()`.
- `spaceship-commander:cloud` guarda `{user, rev}` en cada dispositivo. Sirve
  para distinguir «este dispositivo ya estaba al día» de «es la primera vez que
  entro aquí», y así solo preguntar cuando el conflicto es real.

## Límites conocidos

1. **El progreso es falsificable.** Cualquiera puede editar `localStorage` o
   importar una partida a mano. Además hay huecos en el cliente: `tapFree` paga
   2 ¢ por toque sin tope diario y `focusProgress` vuelve a pagar en cada
   repetición. Antes de hacer un ranking entre amigos hay que mover la economía
   al servidor.
2. **Cada dispositivo simula el tiempo por su cuenta.** `dailyTick()` aplica
   decay y nómina localmente; dos dispositivos pueden aplicar el mismo día dos
   veces. Al hidratar desde la nube el tick se ejecuta *después*, lo que reduce
   el problema pero no lo elimina.
3. **El reloj es el del dispositivo.** `todayStr()` usa hora local sin zona
   horaria, y de ahí salen precios de mercado, caducidad de misiones y rachas.
4. **Tailwind sigue por CDN**, que avisa en consola que no es para producción.
5. **El registro es abierto y sin captcha.** El límite por IP frena a un bot
   sencillo, pero no a uno que cambie de IP. Si aparecen cuentas basura, el
   siguiente paso es Turnstile (el captcha gratuito de Cloudflare) en
   `/api/auth/signup`.
