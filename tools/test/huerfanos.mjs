/**
 * Comprueba que ningún módulo de `src/lib/` se queda sin quien lo importe.
 *
 * Un módulo que nadie importa no se compila, no se prueba y no se ve: es código
 * muerto que sigue en el repositorio pareciendo la fuente de la verdad. Pasó con
 * `src/lib/facetas.ts`, 228 líneas con su propio catálogo de facetas que nadie
 * llamaba mientras el listado de verdad (`src/pages/[ed]/[tipo]/index.astro`)
 * construía las suyas en línea; las dos copias ya habían divergido y quien
 * leyera el repo no sabía cuál mandaba.
 *
 * Mira los imports **directos** de `src/` y de `tools/`, que es donde está el
 * que decide: si un módulo solo lo importa otro módulo muerto, el huérfano de
 * verdad es el de arriba y este se queda con él hasta que se vaya.
 *
 * Uso: node tools/test/huerfanos.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LIB = path.join(RAIZ, "src/lib");
const FUENTES = ["src", "tools"];
const EXTENSIONES = [".ts", ".tsx", ".astro", ".mjs", ".js"];

/** Todos los ficheros de código de un directorio, sin entrar en `node_modules`. */
function recorrer(dir, salida = []) {
  if (!fs.existsSync(dir)) return salida;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name === ".git") continue;
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta, salida);
    else if (EXTENSIONES.includes(path.extname(entrada.name))) salida.push(ruta);
  }
  return salida;
}

/** Las rutas que importa un fichero: `from "…"`, `import "…"` e `import("…")`. */
function especificadores(texto) {
  const rutas = [];
  for (const [, ruta] of texto.matchAll(/\bfrom\s*["']([^"']+)["']/g)) rutas.push(ruta);
  for (const [, ruta] of texto.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) rutas.push(ruta);
  for (const [, ruta] of texto.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) rutas.push(ruta);
  return rutas;
}

/** ¿La ruta importada resuelve a ese módulo de `src/lib`? */
function apuntaA(ruta, modulo) {
  const nombre = path.basename(ruta).replace(/\.(ts|tsx|mjs|js)$/, "");
  return nombre === modulo;
}

const modulos = fs
  .readdirSync(LIB)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
  .map((f) => f.replace(/\.ts$/, ""));

const ficheros = FUENTES.flatMap((fuente) => recorrer(path.join(RAIZ, fuente)));

const importadores = new Map(modulos.map((m) => [m, []]));

for (const fichero of ficheros) {
  const texto = fs.readFileSync(fichero, "utf8");
  const relative = path.relative(RAIZ, fichero);
  for (const ruta of especificadores(texto)) {
    for (const modulo of modulos) {
      if (apuntaA(ruta, modulo) && path.basename(fichero).replace(/\.(ts|tsx|mjs|js)$/, "") !== modulo) {
        importadores.get(modulo).push(relative);
      }
    }
  }
}

const huerfanos = modulos.filter((m) => importadores.get(m).length === 0);

console.log(`Módulos de src/lib comprobados: ${modulos.length} · sin importadores: ${huerfanos.length}`);
if (huerfanos.length === 0) {
  console.log("Sin huérfanos: cada módulo de src/lib lo importa alguien de src/ o tools/.");
  process.exit(0);
}

console.log("");
for (const modulo of huerfanos) {
  const lineas = fs.readFileSync(path.join(LIB, `${modulo}.ts`), "utf8").split("\n").length;
  console.log(`  ✗ src/lib/${modulo}.ts (${lineas} líneas): ningún import lo referencia.`);
}
console.log(
  "\nBórralos, o impórtalos desde donde toca: un módulo muerto que repite otra" +
    " implementación confunde a quien lea el repo y se queda sin arreglos.",
);
process.exit(1);
