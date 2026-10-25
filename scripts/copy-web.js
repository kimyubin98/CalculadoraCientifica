/* Copia los archivos web a www/ (la carpeta que empaqueta Capacitor). */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const files = ['index.html', 'styles.css', 'script.js', 'manifest.webmanifest', 'sw.js', 'IMG_20220802_185951.jpg'];

fs.mkdirSync(out, { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}
fs.cpSync(path.join(root, 'icons'), path.join(out, 'icons'), { recursive: true });

console.log(`Archivos web preparados en ${out}.`);
