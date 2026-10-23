/**
 * Comprueba que ningún módulo de `src/lib/` se queda sin quien lo importe y que
 * ningún `export function` / `export const` suyo se queda sin uso.
 *
 * Un módulo que nadie importa no se compila, no se prueba y no se ve: es código
 * muerto que sigue en el repositorio pareciendo la fuente de la verdad. Pasó con
 * `src/lib/facetas.ts`, 228 líneas con su propio catálogo de facetas que nadie
 * llamaba mientras el listado de verdad (`src/pages/[ed]/[tipo]/index.astro`)
 * construía las suyas en línea; las dos copias ya habían divergido y quien
 * leyera el repo no sabía cuál mandaba.
 *
 * El segundo escalón es el símbolo, que es donde el módulo no basta. `imagenes.ts`
 * entraba por `imagenDe`, así que el módulo salía en verde mientras
 * `grabadosDestacados()` sobrevivía semanas a la retirada de los grabados: nadie
 * la llamaba y nadie lo miraba. Por eso se busca el nombre de cada `export
 * function` y cada `export const` como palabra completa en el resto de `src/` y
 * de `tools/`; si no aparece en ningún sitio, es un hallazgo. Un símbolo que
 * solo se usa dentro de su propio módulo tampoco necesita el `export`: o se
 * quita, o se justifica aquí con su motivo. El nombre se busca como palabra
 * suelta, así que un identificador de una letra (`e`) no vale como prueba: la
 * prosa lo contiene en cualquier frase.
 *
 * Mira los imports **directos** de `src/` y de `tools/`, que es donde está el
 * que decide: si un módulo solo lo importa otro módulo muerto, el huérfano de
 * verdad es el de arriba y este se queda con él hasta que se vaya.
 *
 * El mismo criterio vale fuera de `src/lib/`, y ahí no hay `export` que mirar
 * sino otra señal: `tools/ingest/` y `tools/verify/` son código de trabajo. Un
 * `.py` de allí que no importa nadie y que tampoco se lanza como script (no
 * declara `if __name__ == "__main__"`) es código muerto igual, y peor: en esas
 * carpetas parece la referencia de cómo se hace la ingesta. Pasó con
 * `tools/ingest/srd/reader.py`, 117 líneas con docstrings que lo presentaban
 * como el lector del flujo del PDF mientras nadie lo importaba y ni siquiera
 * podía abrir el JSONL actual (`Block(**d)` con una clave `block` que el
 * dataclass no declara): quien tocara la ingesta lo habría encontrado primero y
 * habría escrito su cambio en un módulo que no se ejecuta.
 *
 * Un script de esos se reconoce por su guarda `__main__`, no por una lista de
 * excepciones: si se lanza con `python tools/ingest/<x>.py`, la guarda lo dice.
 * Un `.mjs` de `tools/verify/` cuenta como consumido si lo importa alguien o si
 * `package.json` lo nombra en sus scripts (`verificar`, `enlaces`, …).
 *
 * Uso: node tools/test/huerfanos.mjs
 *      HUERFANOS_TOOLS=/ruta/a/ingest:/ruta/a/verify node tools/test/huerfanos.mjs
 *      (la variable sustituye las dos carpetas y sirve a la prueba del paso)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LIB = path.join(RAIZ, "src/lib");
const FUENTES = ["src", "tools"];
const EXTENSIONES = [".ts", ".tsx", ".astro", ".mjs", ".js"];
/** Para los módulos de `tools/` el universo lleva también el código de ingesta. */
const CODIGO = [...EXTENSIONES, ".py"];
const SIMBOLO = /^export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/gm;
/** Este mismo fichero no cuenta como consumidor: cita los símbolos al explicarse. */
const PROPIO = fileURLToPath(import.meta.url);

/** Todos los ficheros de código de un directorio, sin entrar en `node_modules`. */
function recorrer(dir, salida = [], extensiones = EXTENSIONES) {
  if (!fs.existsSync(dir)) return salida;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name === ".git" || entrada.name === "__pycache__") continue;
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta, salida, extensiones);
    else if (extensiones.includes(path.extname(entrada.name))) salida.push(ruta);
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

/** Los nombres que un módulo declara con `export function` o `export const`. */
function exportados(texto) {
  return [...texto.matchAll(SIMBOLO)].map(([, nombre]) => nombre);
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

const simbolos = new Map();
for (const modulo of modulos) {
  const ruta = path.join(LIB, `${modulo}.ts`);
  for (const nombre of exportados(fs.readFileSync(ruta, "utf8"))) simbolos.set(nombre, { modulo, ruta });
}

const sinUso = [];
for (const [nombre, { modulo, ruta }] of simbolos) {
  const patron = new RegExp(`\\b${nombre.replace(/\$/g, "\\$")}\\b`);
  const usado = ficheros.some(
    (fichero) => fichero !== ruta && fichero !== PROPIO && patron.test(fs.readFileSync(fichero, "utf8")),
  );
  if (!usado) sinUso.push({ nombre, modulo });
}

/* ── Los módulos de tools/ ────────────────────────────────────────────────
 * Un `.py` de la ingesta o de `verificar` que nadie importa y que no se lanza
 * como script está muerto, igual que un módulo suelto de `src/lib/`. La guarda
 * `__main__` es la que distingue el que se ejecuta a mano del que espera a que
 * alguien lo llame: sin ella, un fichero que nadie importa no corre nunca.
 */
const TOOLS = (
  process.env.HUERFANOS_TOOLS
    ? process.env.HUERFANOS_TOOLS.split(path.delimiter)
    : ["tools/ingest", "tools/verify"].map((carpeta) => path.join(RAIZ, carpeta))
).filter((carpeta) => fs.existsSync(carpeta));

/** Los nombres de un `import a, b as c` ya sin paréntesis, alias ni comas. */
function nombresImportados(parte) {
  return parte
    .replace(/[()\\]/g, " ")
    .split(",")
    .map((nombre) => nombre.split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
}

/** ¿`texto` importa el módulo Python `nombre`? Cubre `import x`, `import a.x` y `from a import x`. */
function importaPython(texto, nombre) {
  // Un `from x import (a,\n b)` partido en líneas se lee de una vez.
  const plano = texto.replace(
    /(^[ \t]*from[ \t]+[\w.]+[ \t]+import[ \t]*)\(([\s\S]*?)\)/gm,
    (_, cabecera, dentro) => cabecera + dentro.replace(/\s*\n\s*/g, " "),
  );
  const base = (ruta) => path.posix.basename(ruta.replaceAll(".", "/"));
  for (const [, paquete, nombres] of plano.matchAll(/^[ \t]*from[ \t]+([\w.]+)[ \t]+import[ \t]+(.+)$/gm)) {
    if (base(paquete) === nombre) return true;
    if (nombresImportados(nombres).includes(nombre)) return true;
  }
  for (const [, nombres] of plano.matchAll(/^[ \t]*import[ \t]+(.+)$/gm)) {
    if (nombresImportados(nombres).some((ruta) => base(ruta) === nombre)) return true;
  }
  return false;
}

const PAQUETE = fs.existsSync(path.join(RAIZ, "package.json"))
  ? fs.readFileSync(path.join(RAIZ, "package.json"), "utf8")
  : "";

/** Todo lo que puede importar: `src/`, `tools/` y las carpetas que se miran. */
const universo = [...new Set([...ficheros, ...TOOLS.flatMap((carpeta) => recorrer(carpeta, [], CODIGO))])];
const textos = new Map(universo.map((fichero) => [fichero, fs.readFileSync(fichero, "utf8")]));

let comprobadosTools = 0;
let scriptsTools = 0;
const huerfanosTools = [];

for (const carpeta of TOOLS) {
  for (const fichero of recorrer(carpeta, [], CODIGO)) {
    const nombre = path.basename(fichero).replace(/\.[^.]+$/, "");
    if (nombre === "__init__") continue;
    const texto = textos.get(fichero) ?? fs.readFileSync(fichero, "utf8");
    comprobadosTools += 1;
    const esPython = fichero.endsWith(".py");
    if (esPython && /^if\s+__name__\s*==\s*["']__main__["']/m.test(texto)) {
      scriptsTools += 1;
      continue;
    }
    const relativa = path.relative(RAIZ, fichero);
    // El import se busca entre iguales: un `.py` lo importa otro `.py`, y un
    // `.mjs` lo importa código de JS (en un `.astro` o en un `.py` no hay
    // `import x from "…"` que valga).
    const consumido = universo.some((otro) => {
      if (otro === fichero) return false;
      const ajeno = textos.get(otro) ?? "";
      if (esPython) return otro.endsWith(".py") && importaPython(ajeno, nombre);
      return !otro.endsWith(".py") && especificadores(ajeno).some((ruta) => apuntaA(ruta, nombre));
    }) || (!esPython && PAQUETE.includes(relativa));
    if (!consumido) huerfanosTools.push({ relativa, lineas: texto.split("\n").length });
  }
}

console.log(`Módulos de src/lib comprobados: ${modulos.length} · sin importadores: ${huerfanos.length}`);
console.log(`Símbolos exportados comprobados: ${simbolos.size} · sin uso: ${sinUso.length}`);
console.log(
  `Módulos de tools comprobados: ${comprobadosTools} · se lanzan como script: ${scriptsTools}` +
    ` · sin importadores: ${huerfanosTools.length}`,
);

let fallos = false;

if (huerfanos.length > 0) {
  fallos = true;
  console.log("");
  for (const modulo of huerfanos) {
    const lineas = fs.readFileSync(path.join(LIB, `${modulo}.ts`), "utf8").split("\n").length;
    console.log(`  ✗ src/lib/${modulo}.ts (${lineas} líneas): ningún import lo referencia.`);
  }
  console.log(
    "  Bórralos, o impórtalos desde donde toca: un módulo muerto que repite otra" +
      " implementación confunde a quien lea el repo y se queda sin arreglos.",
  );
}

if (sinUso.length > 0) {
  fallos = true;
  console.log("");
  for (const { nombre, modulo } of sinUso) {
    console.log(`  ✗ src/lib/${modulo}.ts: «${nombre}» se exporta y no lo usa nadie fuera del módulo.`);
  }
  console.log(
    "  Bórralo si sobra, o quítale el export si solo se usa dentro: un símbolo que" +
      " nadie llama se queda sin pruebas y aparenta una funcionalidad que no existe.",
  );
}

if (huerfanosTools.length > 0) {
  fallos = true;
  console.log("");
  for (const { relativa, lineas } of huerfanosTools) {
    console.log(
      `  ✗ ${relativa} (${lineas} líneas): ningún import lo referencia y no declara` +
        " «if __name__ == \"__main__\"».",
    );
  }
  console.log(
    "  Bórralos, o dales su guarda `__main__` si de verdad se lanzan a mano: un módulo de" +
      " tools/ que nadie importa parece la referencia de la ingesta y no se ejecuta nunca.",
  );
}

if (fallos) process.exit(1);

console.log(
  "Sin huérfanos: cada módulo de src/lib lo importa alguien, cada símbolo exportado se usa" +
    " y cada módulo de tools/ lo importa alguien o se lanza como script.",
);
process.exit(0);
