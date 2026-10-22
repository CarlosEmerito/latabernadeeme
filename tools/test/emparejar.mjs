/**
 * Comprueba que el comparador empareja el mismo objeto en las dos ediciones.
 *
 * `/comparar/` empareja las entradas del SRD 5.1 y del 5.2.1 para pintar una
 * tabla de dos columnas. El emparejamiento es por **identidad del objeto** —el
 * nombre que le da el SRD y el desambiguador que lo distingue de sus
 * homónimos— y no por identificador de fichero, porque el identificador lo
 * decide el orden de aparición en el PDF: en el equipo del 5.2.1 cambiaron el
 * orden de las filas de la tabla y los dos ficheros de la «Vara» se
 * renumeraron. El slug `vara` era la varita de 1 kg en el 5.1 y la pértiga de
 * 3 m en el 5.2.1, así que `/comparar/equipo/vara/` comparaba la varita de
 * 2014 con la pértiga de 2024 y su única fila afirmaba que la pértiga era
 * nueva en 2024, cuando en el 5.1 también estaba (pág. 71).
 *
 * Lo que se vigila aquí son las dos mitades del contrato:
 *
 *   1. **Ninguna pareja cruza objetos.** Para cada par, el nombre propio de las
 *      dos entradas tiene que coincidir. Es la regla que el identificador
 *      incumplía y la que hacía que la página afirmara cosas falsas.
 *   2. **Toda entrada que existe en las dos ediciones está emparejada.** Si una
 *      entrada se queda sin pareja por un nombre que el SRD cambió, su
 *      comparación no se publica y nadie se entera: el par se cuenta y se
 *      dice el nombre.
 *
 * Las entradas salen de `data/`, así que la puerta vigila el corpus entero y
 * no solo lo que hay publicado en `dist/`. Y el caso sintético —dos objetos
 * con el mismo nombre en las dos ediciones— se monta aquí, porque un ejemplo
 * que solo mira el corpus real no demuestra que la puerta detecte el cruce:
 * si el corpus no lo tiene, la puerta pasa siempre.
 *
 * Uso: node tools/test/emparejar.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";
import { desambiguar, emparejar, mismoObjeto } from "../../src/lib/emparejar.ts";
import { plegar } from "../../src/lib/texto.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATOS = path.join(RAIZ, "data");

const TIPOS = [
  "conjuros",
  "monstruos",
  "objetos",
  "equipo",
  "clases",
  "especies",
  "trasfondos",
  "dotes",
  "reglas",
];
const EDICIONES = ["ed51", "ed52"];

const fallos = [];
let comprobados = 0;

/** Una entrada de `data/`, con lo que el emparejamiento necesita de ella. */
function leerEntrada(ruta, edicion, tipo) {
  const crudo = fs.readFileSync(ruta, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(crudo);
  const data = m ? (parseYaml(m[1]) ?? {}) : {};
  return {
    slug: path.basename(ruta, ".md"),
    data: { name: path.basename(ruta, ".md"), ...data },
    body: m ? crudo.slice(m[0].length) : crudo,
    html: "",
    edicion,
    tipo,
  };
}

/** Todas las entradas de una carpeta de `data/`. */
function cargar(edicion, tipo) {
  const carpeta = path.join(DATOS, edicion, tipo);
  if (!fs.existsSync(carpeta)) return [];
  return fs
    .readdirSync(carpeta)
    .filter((f) => f.endsWith(".md"))
    .map((f) => leerEntrada(path.join(carpeta, f), edicion, tipo));
}

// 1. El caso sintético: dos objetos distintos que el SRD titula igual en las
//    dos ediciones. El identificador los cruzaría; la identidad no.
{
  comprobados++;
  const entrada = (slug, nombre, edicion) => ({
    slug,
    data: { name: nombre, category: "Equipo de aventurero" },
    body: "",
    html: "",
    edicion,
    tipo: "equipo",
  });
  const a = [entrada("vara", "Vara", "ed51"), entrada("vara-3-m", "Vara (3 m)", "ed51")];
  const b = [entrada("vara-3-m", "Vara (3 m)", "ed52"), entrada("vara", "Vara", "ed52")];
  const pares = emparejar(a, b);
  try {
    assert.equal(pares.length, 2);
    const del5e = new Map(pares.map((p) => [p.a.slug, p.b.slug]));
    assert.equal(del5e.get("vara"), "vara", "la «Vara» del 5.1 tiene que casar con la «Vara» del 5.2.1");
    assert.equal(
      del5e.get("vara-3-m"),
      "vara-3-m",
      "la «Vara (3 m)» del 5.1 tiene que casar con la «Vara (3 m)» del 5.2.1",
    );
  } catch (e) {
    fallos.push(`el desambiguador no separa las dos Varas: ${String(e.message).split("\n")[0]}`);
  }
}

// 2. El caso del corpus: el nombre propio tiene que ser el mismo en las dos
//    ediciones de una pareja, y toda entrada compartida tiene que estar
//    emparejada.
let paresTotales = 0;
let entradasComunes = 0;
const cruces = [];
const sinPareja = [];

for (const tipo of TIPOS) {
  const a = cargar("ed51", tipo);
  const b = cargar("ed52", tipo);
  if (a.length === 0 || b.length === 0) continue;

  const pares = emparejar(a, b);
  paresTotales += pares.length;

  const porSlugB = new Map(b.map((x) => [x.slug, x]));
  const slugsComunes = a.filter((x) => porSlugB.has(x.slug)).map((x) => x.slug);
  entradasComunes += slugsComunes.length;

  const emparejados = new Map(pares.map((p) => [p.a.slug, p.b]));

  for (const par of pares) {
    comprobados++;
    if (!mismoObjeto(par.a, par.b)) {
      cruces.push(
        `${tipo}/${par.a.slug} [${par.a.data.name}] se empareja con ` +
          `${tipo}/${par.b.slug} [${par.b.data.name}]`,
      );
    }
  }

  for (const slug of slugsComunes) {
    comprobados++;
    if (!emparejados.has(slug)) {
      const entrada = a.find((x) => x.slug === slug);
      sinPareja.push(`${tipo}/${slug} [${entrada?.data.name}]`);
    }
  }
}

// 3. El nombre propio de una entrada no puede depender del identificador del
//    fichero: la puerta vigila que el «Vara (3 m)» del 5.2.1 se llame así en
//    el fichero que lo nombra, y no en el que le tocó por el orden del PDF.
{
  comprobados++;
  const vara52 = cargar("ed52", "equipo").find((x) => x.data.name === "Vara (3 m)");
  if (!vara52) {
    fallos.push("no encuentro la «Vara (3 m)» en data/ed52/equipo/");
  } else if (vara52.slug !== "vara-3-m") {
    fallos.push(
      `la «Vara (3 m)» del 5.2.1 está en ${vara52.slug}.md y su nombre pide vara-3-m.md: ` +
        "el identificador lo decide el orden del PDF y deja de identificar el objeto",
    );
  }
}

console.log(`Entradas emparejadas: ${paresTotales} · slugs comunes: ${entradasComunes}`);
console.log(`Cruces: ${cruces.length} · sin pareja: ${sinPareja.length}`);

if (cruces.length > 0) {
  console.log("\n✗ Hay pares que cruzan objetos distintos:");
  for (const c of cruces.slice(0, 20)) console.log(`  - ${c}`);
  if (cruces.length > 20) console.log(`  … y ${cruces.length - 20} más`);
  console.log(
    "\n  La página de comparación publicaría el objeto de una edición junto al de otra, " +
      "y afirmaría que uno es nuevo cuando no lo es.",
  );
}

if (sinPareja.length > 0) {
  console.log("\n✗ Hay entradas que existen en las dos ediciones y no se comparan:");
  for (const s of sinPareja.slice(0, 20)) console.log(`  - ${s}`);
  if (sinPareja.length > 20) console.log(`  … y ${sinPareja.length - 20} más`);
  console.log("\n  Su página de comparación no existe y su cambio no se puede ver.");
}

if (fallos.length > 0) {
  console.log("\n✗ Casos que fallan:");
  for (const f of fallos) console.log(`  - ${f}`);
  process.exit(1);
}

if (cruces.length > 0 || sinPareja.length > 0) process.exit(1);

console.log(
  "Ninguna pareja cruza objetos distintos y toda entrada que existe en las dos ediciones se compara.",
);
process.exit(0);
