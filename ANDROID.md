# Calculadora científica en Android

Hay dos caminos. Ambos usan exactamente el mismo código.

## Opción A — PWA (instalable desde Chrome, sin Android Studio)

1. Publica la carpeta en un hosting **HTTPS** (GitHub Pages, Netlify, Cloudflare Pages, tu servidor…).
   Los archivos deben quedar en la misma carpeta: `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`.
2. Abre la URL en Chrome para Android → menú ⋮ → **Instalar app** (o «Añadir a pantalla de inicio»).
3. Se abre a pantalla completa, con icono propio y **funciona sin conexión**.

Al publicar cambios, sube el número de `CACHE` en `sw.js` (`calc-cientifica-v2`…) para que los usuarios reciban la versión nueva.
No funciona con `file://`: el service worker exige http(s).

## Opción B — APK / AAB nativo con Capacitor

Requisitos: Node 18+, Android Studio (incluye SDK y JDK).

```bash
npm install
npm run android:add        # crea la carpeta android/ (solo la primera vez)
npm run android:assets     # genera iconos y splash a partir de resources/icon.png
npm run android:open       # abre el proyecto en Android Studio
```

Abre la carpeta `android/` como proyecto en Android Studio. Si Gradle no encuentra
Java, ve a **Settings → Build, Execution, Deployment → Build Tools → Gradle** y
selecciona el JDK incluido con Android Studio (normalmente llamado `jbr`).

Para generar un APK de prueba, elige **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Para Google Play,
usa **Generate Signed Bundle (AAB)** y firma la aplicación con tu clave.

Tras cualquier cambio en los archivos web: `npm run android:sync`.

### Antes de publicar
- Cambia `appId` en `capacitor.config.json` (hoy `com.example.calculadoracientifica`) por tu identificador definitivo, por ejemplo `com.tudominio.calculadora`. No se puede cambiar después de publicar en Play.
- Firma la app con tu propio keystore y guárdalo con copia de seguridad.
- Prueba en un dispositivo real (teléfono y, si puedes, tableta).
