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

## Dar acceso a alguien

El acceso es por clave: una cadena aleatoria de 32 bytes, al estilo de los
tokens personales de GitHub. No hay registro público — **solo entra quien
reciba una clave tuya**.

```bash
node scripts/invite.mjs "Ana"            # producción
node scripts/invite.mjs --local "Ana"    # base local
```

Imprime la clave **una sola vez**: en la base de datos solo queda su SHA-256,
así que ni tú puedes recuperarla después. Mándasela en privado — quien la tenga
entra a esa partida.

La persona la pega una vez en el botón «Entrar» de la cabecera y el navegador
recuerda la sesión 90 días. Solo tiene que repetirlo si cambia de dispositivo o
borra los datos del navegador.

Para ver quién está dado de alta:

```bash
node scripts/invite.mjs --list
```

### Si alguien pierde su clave, o se filtra

Vuelve a ejecutar el mismo comando con el mismo nombre:

```bash
node scripts/invite.mjs "Ana"
```

Le genera una clave nueva, **anula la anterior**, cierra sus sesiones abiertas
y **no toca su partida**: la fila del usuario conserva su `id`, y `saves.user_id`
sigue apuntando a ella.

**La clave nueva no es la anterior ni se le parece.** Son 32 bytes nuevos al
azar, y la vieja es irrecuperable incluso para ti, porque de ella solo queda un
SHA-256. La persona tendrá que pegar la nueva en cada dispositivo donde juegue.

### El nombre es la identidad

De él depende a qué partida se engancha la clave, así que una errata sería cara:
crearía un usuario nuevo con la partida vacía. El comando lo vigila por ti.

Si escribes un nombre que solo se diferencia en mayúsculas de uno existente,
pregunta antes de hacer nada:

```
  Ya existe «Pedro», y tú escribiste «PEDRO».

    [r] rotarle la clave a «Pedro» (conserva su partida)   ← por defecto
    [c] crear un usuario nuevo «PEDRO», con la partida vacía
    [x] cancelar
```

Y si el nombre no se parece a ninguno, pide confirmación explícita antes de dar
de alta a nadie. En ambos casos la opción por defecto es la que **no** destruye
nada.

Para usarlo desde un script, `--yes` se queda siempre con esa opción segura —
nunca crea un usuario por sorpresa. Sin terminal y sin `--yes`, el comando se
niega a adivinar y sale con error.

### Por qué no hace falta hashear despacio

Las contraseñas se hashean con algoritmos lentos porque las elige una persona y
son adivinables. Estas claves las genera el ordenador con 256 bits de entropía:
no hay nada que adivinar, así que un SHA-256 basta. Eso además esquiva el límite
de 10 ms de CPU del plan gratis de Workers, que es lo que hacía incómodo un
login con contraseña.

La clave viaja siempre en el cuerpo de la petición, nunca en la URL, para que no
acabe en el historial del navegador ni en los registros del servidor.

## Cómo funciona la sincronización

El servidor **solo almacena**: la economía se sigue calculando en el cliente.

- `localStorage` sigue siendo la fuente inmediata, así que sin clave o sin
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
