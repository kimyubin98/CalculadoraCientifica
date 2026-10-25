# Calculadora científica

Calculadora científica ligera, adaptable a móviles y de escritorio. Funciona como sitio web, aplicación web progresiva (PWA) instalable y aplicación Android mediante Capacitor. No necesita servicios externos para realizar cálculos y puede utilizarse sin conexión después de cargarla.

## Funciones

- Operaciones aritméticas con precedencia y uso de paréntesis.
- Funciones trigonométricas e inversas, con modos de grados (`DEG`) y radianes (`RAD`).
- Potencias, raíces cuadradas y enésimas, factorial, porcentaje, inverso y valor absoluto.
- Logaritmos decimal y natural, constantes π y e, y notación científica.
- Vista previa de resultados, tema claro/oscuro y entrada mediante teclado físico.
- Interfaz adaptable, instalación como PWA y funcionamiento sin conexión mediante service worker.
- Aplicación Android empaquetada con Capacitor.

## Requisitos

- Node.js 18 o posterior y npm para ejecutar pruebas y preparar la aplicación Android.
- Android Studio, Android SDK y JDK para compilar la versión Android.
- Un servidor HTTPS para publicar la PWA; el service worker no funciona al abrir el archivo directamente con `file://`.

## Uso local

Puedes abrir `index.html` directamente para probar la calculadora en el navegador. Para probar la instalación PWA y el funcionamiento sin conexión, sírvela desde un servidor local HTTP/HTTPS.

Para instalar las dependencias y ejecutar las pruebas:

```bash
npm install
npm test
```

## Teclado

| Tecla | Acción |
| --- | --- |
| `0`–`9` | Introducir números |
| `+`, `-`, `*`, `/`, `^` | Operaciones |
| `(`, `)` | Paréntesis |
| `.` o `,` | Separador decimal |
| `Enter` o `=` | Calcular |
| `Backspace` | Borrar el último carácter |
| `Escape` o `Delete` | Limpiar |
| `!`, `%` | Factorial y porcentaje |
| `p`, `e`, `E` | π, constante e y notación científica (`E` mayúscula) |
| `s`, `c`, `t`, `l`, `n`, `q`, `a` | Seno, coseno, tangente, log, ln, raíz cuadrada y valor absoluto |
| `d` | Alternar entre DEG y RAD |
| `r` | Raíz enésima |

## Publicar como PWA

1. Sube el contenido de este proyecto a un repositorio de GitHub.
2. En el repositorio, abre **Settings → Pages** y configura la publicación desde la rama principal y la carpeta raíz (`/`).
3. Espera a que GitHub Pages publique el sitio y abre la URL HTTPS generada.
4. En Chrome para Android, abre el menú y selecciona **Instalar app** o **Añadir a pantalla de inicio**.

La aplicación también puede publicarse en otro hosting HTTPS, conservando juntos `index.html`, `styles.css`, `script.js`, `manifest.webmanifest`, `sw.js` y la carpeta `icons/`.

Al cambiar los archivos de la aplicación, incrementa la constante `CACHE` en `sw.js` para que el service worker instale una caché nueva.

## Preparar Android

Este proyecto ya incluye la configuración de Capacitor. Para sincronizar los archivos web con Android y abrir el proyecto:

```bash
npm install
npm run android:sync
npm run android:open
```

En Android Studio puedes generar un APK de prueba con **Build → Build Bundle(s) / APK(s) → Build APK(s)**. Para publicar en Google Play, genera y firma un Android App Bundle (`AAB`).

Antes de distribuir la aplicación, cambia `appId` en `capacitor.config.json` por el identificador definitivo de tu aplicación y firma la compilación con tu propio keystore. Consulta [ANDROID.md](./ANDROID.md) para ver los pasos y requisitos detallados.

Otros comandos disponibles:

```bash
npm run web           # Copia los recursos web a www/
npm run android:add   # Añade la plataforma Android (solo si aún no existe)
npm run android:assets # Genera recursos gráficos para Android
```

## Estructura principal

```text
index.html              Interfaz de la calculadora
script.js               Lógica de cálculo e interacción
styles.css              Estilos adaptables y temas
manifest.webmanifest    Configuración de la PWA
sw.js                   Caché para uso sin conexión
icons/                  Iconos de la aplicación
scripts/copy-web.js     Preparación de recursos para Capacitor
tests.js                Pruebas de la lógica de cálculo
android/                Proyecto nativo Android de Capacitor
```

## Licencia

Distribuido bajo la licencia MIT. Consulta el archivo [LICENSE](./LICENSE).
