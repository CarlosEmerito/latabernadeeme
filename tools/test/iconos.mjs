/**
 * Comprueba que toda ficha publica el icono de su banda.
 *
 * `Detalle.astro` elige el dibujo por el nombre del tipo (`tipo-<slug>`) o de la
 * escuela (`escuela-<slug>`), y `Icono.astro` no pinta nada cuando el fichero no
 * existe: la banda se queda con el texto y sin dibujo, sin error de compilación
 * ni aviso. Así se colaron 88 fichas sin icono —32 de los tipos Autómata y
 * Enjambre, que no tenían SVG, y 56 de la escuela Ilusionismo, cuyo fichero se
 * llamaba `escuela-ilusion.svg`—, invisibles para `npm run build` y para el
 * resto de comprobaciones.
 *
 * Se mide sobre el HTML construido y no sobre el mapa de nombres: toda página
 * con `ficha__banda` tiene que llevar dentro `icono--banda`. Lo que se publica,
 * no lo que el código cree que hace. El mínimo de fichas revisadas evita el
 * verde vacío si un cambio de rutas deja `dist/` sin fichas.
 *
 * Uso: node tools/test/iconos.mjs [dist]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");

// Hoy hay 2490 fichas. El suelo se queda corto a propósito: solo salta si
// `dist/` se ha quedado sin fichas que mirar.
const MINIMO_FICHAS = 2400;

const fallos = [];
const fallo = (donde, detalle) => fallos.push({ donde, detalle });

const paginas = [];
const recorrer = (dir) => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (entrada.name === "index.html") paginas.push(ruta);
  }
};

if (!fs.existsSync(DIST)) {
  console.log(`✗ No existe ${DIST}: compila el sitio antes de comprobar los iconos.`);
  process.exit(1);
}
recorrer(DIST);

let fichas = 0;

for (const pagina of paginas) {
  const html = fs.readFileSync(pagina, "utf8");
  if (!html.includes("ficha__banda")) continue;
  fichas++;
  if (!html.includes("icono--banda")) {
    fallo(pagina, "ficha sin icono en la banda");
  }
}

if (fichas < MINIMO_FICHAS) {
  fallo(DIST, `solo se han encontrado ${fichas} fichas, menos que el mínimo de ${MINIMO_FICHAS}`);
}

console.log(`Fichas comprobadas: ${fichas} · sin icono: ${fallos.length}`);
if (fallos.length === 0) {
  console.log("Sin fallos: cada ficha lleva el icono de su tipo o escuela.");
  process.exit(0);
}

console.log(`\nFallos: ${fallos.length}`);
for (const { donde, detalle } of fallos.slice(0, 20)) {
  console.log(`  ✗ ${path.relative(DIST, donde)}: ${detalle}`);
}
process.exit(1);
