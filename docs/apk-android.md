# APK de Android (Capacitor)

Para quien quiera usar la app en un Android sin navegador. El APK es una
envoltura de Capacitor que abre la web desplegada en el WebView del sistema:

- `capacitor.config.json` → `server.url` apunta al Worker en producción.
  La API (`/api/*`) y la cookie de sesión funcionan igual que en la web porque
  todo ocurre en el mismo origen.
- Cada merge a `main` actualiza también la app: no hace falta regenerar el APK.
  Solo hay que regenerarlo si cambian la URL, el nombre o los iconos.

## Requisitos (una sola vez, macOS)

```bash
brew install openjdk@21 && brew install --cask android-commandlinetools
```

Acepta las licencias del Android SDK (te las enseña una a una):

```bash
sdkmanager --licenses
```

`android/local.properties` (no versionado) debe contener:

```
sdk.dir=/opt/homebrew/share/android-commandlinetools
```

## Generar el APK

```bash
npm run apk
```

Deja `spaceship-commander.apk` en la raíz del repo (ignorado por git). Es un
APK de debug: se instala pasándolo al teléfono (WhatsApp, Drive…) y activando
«Instalar apps de origen desconocido».

## Iconos

Los iconos de `android/app/src/main/res/mipmap-*` y las pantallas de carga
`drawable*/splash.png` salen de `public/icons/`. Si cambian los iconos de la
PWA, hay que regenerarlos.
