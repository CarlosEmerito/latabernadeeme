/**
 * Comprueba que todos los enlaces internos del sitio compilado apuntan a algo.
 *
 * Recorre los HTML de `dist/`, extrae `href` y `src` que empiecen por la base
 * del sitio y verifica que exista el fichero o el `index.html` correspondiente.
 * Si el enlace lleva fragmento (`…/#seccion` o `#seccion`), comprueba además
 * que la página de destino tenga un elemento con ese `id`: el fichero puede
 * existir y el ancla estar muerta igualmente, y el índice lateral de cada ficha
 * enlaza a los encabezados de su propia página.
 *
 * Uso: node tools/test/enlaces.mjs [directorio] [base]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");
const BASE = (process.argv[3] ?? "/latabernadeeme").replace(/\/$/, "");
const IGNORAR = [/^mailto:/, /^tel:/, /^javascript:/, /^https?:/, /^data:/];

const paginas = [];
const recorrer = (dir) => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (entrada.name.endsWith(".html")) paginas.push(ruta);
  }
};
recorrer(DIST);

const idsDeHtml = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

/** Ids de una página, leídos una sola vez. */
const idsPorPagina = new Map();
const idsDe = (fichero) => {
  if (!idsPorPagina.has(fichero)) idsPorPagina.set(fichero, idsDeHtml(fs.readFileSync(fichero, "utf8")));
  return idsPorPagina.get(fichero);
};

/**
 * Fichero de `dist/` al que apunta un destino interno, `false` si no existe y
 * `null` si no es asunto de esta comprobación (fuera de la base del sitio).
 */
const ficheroDe = (destino) => {
  const limpio = destino.split("#")[0].split("?")[0];
  if (!limpio) return null; // solo fragmento: se queda en la página actual
  const sinBase = limpio.startsWith(BASE) ? limpio.slice(BASE.length) : null;
  if (sinBase === null) return null; // enlace externo o fuera de la base
  let fichero = path.join(DIST, decodeURIComponent(sinBase));
  if (fs.existsSync(fichero) && fs.statSync(fichero).isDirectory()) fichero = path.join(fichero, "index.html");
  if (fs.existsSync(fichero)) return fichero;
  if (fs.existsSync(`${fichero}.html`)) return `${fichero}.html`;
  return false;
};

const rotos = new Map();
const anotar = (clave, pagina) => {
  if (!rotos.has(clave)) rotos.set(clave, new Set());
  rotos.get(clave).add(path.relative(DIST, pagina));
};

let enlaces = 0;
let anclas = 0;

for (const pagina of paginas) {
  const html = fs.readFileSync(pagina, "utf8");
  if (!idsPorPagina.has(pagina)) idsPorPagina.set(pagina, idsDeHtml(html));
  const propios = idsPorPagina.get(pagina);

  for (const [, destino] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (IGNORAR.some((re) => re.test(destino))) continue;

    // Ancla dentro de esta misma página.
    if (destino.startsWith("#")) {
      const fragmento = decodeURIComponent(destino.slice(1));
      if (!fragmento) continue;
      enlaces++;
      anclas++;
      if (!propios.has(fragmento)) anotar(destino, pagina);
      continue;
    }

    if (!destino.startsWith("/") && !destino.startsWith(BASE)) continue;
    enlaces++;
    const fichero = ficheroDe(destino);
    if (fichero === null) continue;
    if (fichero === false) {
      anotar(destino.split("#")[0], pagina);
      continue;
    }
    const fragmento = destino.split("#")[1];
    if (fragmento) {
      anclas++;
      if (!idsDe(fichero).has(decodeURIComponent(fragmento))) anotar(destino, pagina);
    }
  }
}

console.log(`Enlaces internos comprobados: ${enlaces} en ${paginas.length} páginas`);
console.log(`Anclas comprobadas: ${anclas}`);
if (rotos.size === 0) {
  console.log("Sin enlaces rotos.");
  process.exit(0);
}

console.log(`\nEnlaces rotos: ${rotos.size}`);
for (const [destino, desde] of [...rotos].slice(0, 40)) {
  console.log(`  ✗ ${destino}  (${desde.size} página${desde.size === 1 ? "" : "s"}; p. ej. ${[...desde][0]})`);
}
process.exit(1);
