/**
 * Comprueba que todos los enlaces internos del sitio compilado apuntan a algo.
 *
 * Recorre los HTML de `dist/`, extrae `href` y `src` que empiecen por la base
 * del sitio y verifica que exista el fichero o el `index.html` correspondiente.
 * No sustituye a una prueba en navegador: detecta el caso más común, que es un
 * enlace escrito a mano que se queda viejo cuando cambian los datos.
 *
 * Uso: node tools/test/enlaces.mjs [directorio] [base]
 */
import fs from "node:fs";
import path from "node:path";

const DIST = process.argv[2] ?? "dist";
const BASE = (process.argv[3] ?? "/latabernadeeme").replace(/\/$/, "");
const IGNORAR = [/^#/, /^mailto:/, /^tel:/, /^javascript:/, /^https?:/];

const paginas = [];
const recorrer = (dir) => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (entrada.name.endsWith(".html")) paginas.push(ruta);
  }
};
recorrer(DIST);

const existe = (destino) => {
  const limpio = destino.split("#")[0].split("?")[0];
  if (!limpio) return true;
  const sinBase = limpio.startsWith(BASE) ? limpio.slice(BASE.length) : null;
  if (sinBase === null) return true; // enlace externo o fuera de la base
  let fichero = path.join(DIST, decodeURIComponent(sinBase));
  if (fs.existsSync(fichero) && fs.statSync(fichero).isDirectory()) fichero = path.join(fichero, "index.html");
  if (fs.existsSync(fichero)) return true;
  return fs.existsSync(`${fichero}.html`);
};

const rotos = new Map();
let enlaces = 0;

for (const pagina of paginas) {
  const html = fs.readFileSync(pagina, "utf8");
  const encontrados = html.matchAll(/(?:href|src)="([^"]+)"/g);
  for (const [, destino] of encontrados) {
    if (IGNORAR.some((re) => re.test(destino))) continue;
    if (!destino.startsWith("/") && !destino.startsWith(BASE)) continue;
    enlaces++;
    if (!existe(destino)) {
      const clave = destino.split("#")[0];
      if (!rotos.has(clave)) rotos.set(clave, new Set());
      rotos.get(clave).add(path.relative(DIST, pagina));
    }
  }
}

console.log(`Enlaces internos comprobados: ${enlaces} en ${paginas.length} páginas`);
if (rotos.size === 0) {
  console.log("Sin enlaces rotos.");
  process.exit(0);
}

console.log(`\nEnlaces rotos: ${rotos.size}`);
for (const [destino, desde] of [...rotos].slice(0, 40)) {
  console.log(`  ✗ ${destino}  (${desde.size} página${desde.size === 1 ? "" : "s"}; p. ej. ${[...desde][0]})`);
}
process.exit(1);
