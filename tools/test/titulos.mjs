/**
 * Un `<title>` por página y ninguno compartido entre secciones distintas.
 *
 * `Base.astro` componía el título como nombre + « · » + edición, sin decir de
 * qué sección era la entrada: `/5e/clases/mago/` y `/5e/monstruos/mago/` —una
 * clase y una criatura— salían las dos como «Mago · D&D 5e», iguales en la
 * pestaña, en el historial y en un resultado de búsqueda, y en `/comparar/`
 * además compartían `description`. El título lleva ya la sección (`Mago ·
 * Clase · D&D 5e`) y este paso es el que impide que vuelva.
 *
 * Recorre `dist/`, agrupa por `<title>` y falla cuando dos páginas de
 * secciones distintas —ficha de un tipo, comparación de un tipo, o página sin
 * sección— comparten título. Los repetidos dentro de la misma sección se
 * listan aparte y no suspenden el paso: son fichas homónimas de `data/` que la
 * categoría separa («Bastón» arma y «Bastón» canalizador arcano, «Competencia»
 * de características y del glosario), y lo que les toca es la ficha, no el
 * título; `tools/test/duplicados.py` es quien vigila que sigan siendo legales.
 *
 * Uso: node tools/test/titulos.mjs [directorio]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");

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
const ALTERNANCIA = TIPOS.join("|");
// `/5.5/reglas/indice/` es el índice de reglas, no una ficha de regla.
const FICHA = new RegExp(`^/(5e|5\\.5)/(${ALTERNANCIA})/(?!indice/)([^/]+)/$`);
const COMPARAR = new RegExp(`^/comparar/(${ALTERNANCIA})/([^/]+)/$`);

/**
 * Sección de la página: una clave que solo comparten las páginas de la misma
 * sección y de la misma clase, y la etiqueta con la que se nombra en el error.
 */
function seccionDe(ruta) {
  const ficha = FICHA.exec(ruta);
  if (ficha) {
    return { clave: `${ficha[2]}:ficha`, etiqueta: ficha[2], entrada: `${ficha[1]}/${ficha[2]}/${ficha[3]}` };
  }
  const comparar = COMPARAR.exec(ruta);
  if (comparar) {
    return {
      clave: `${comparar[1]}:comparar`,
      etiqueta: `${comparar[1]} (comparación)`,
      entrada: `comparar/${comparar[1]}/${comparar[2]}`,
    };
  }
  return { clave: "sin-seccion", etiqueta: "sin sección", entrada: ruta };
}

/** El título tal como se lee, no como lo escribe el HTML. */
const legible = (titulo) =>
  titulo
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");

const paginas = [];
const recorrer = (dir) => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (entrada.name.endsWith(".html")) paginas.push(ruta);
  }
};
recorrer(DIST);

const porTitulo = new Map();
const sinTitulo = [];

for (const fichero of paginas) {
  const html = fs.readFileSync(fichero, "utf8");
  const rel = path.relative(DIST, fichero).split(path.sep).join("/");
  const ruta = `/${rel.replace(/index\.html$/, "").replace(/\.html$/, "/")}`;
  const encontrado = /<title>([\s\S]*?)<\/title>/.exec(html);
  if (!encontrado) {
    sinTitulo.push(rel);
    continue;
  }
  const titulo = encontrado[1].trim();
  if (!porTitulo.has(titulo)) porTitulo.set(titulo, []);
  porTitulo.get(titulo).push({ rel, ruta });
}

const cruces = [];
const repetidos = [];
for (const [titulo, lista] of porTitulo) {
  if (lista.length < 2) continue;
  const secciones = new Set(lista.map((p) => seccionDe(p.ruta).clave));
  if (secciones.size > 1) cruces.push([titulo, lista]);
  else repetidos.push([titulo, lista]);
}

console.log(`Títulos comprobados: ${paginas.length} páginas, ${porTitulo.size} títulos distintos`);

let fallos = 0;
if (sinTitulo.length > 0) {
  fallos++;
  console.log(`\n✗ ${sinTitulo.length} páginas sin <title>`);
  for (const rel of sinTitulo.slice(0, 20)) console.log(`  - ${rel}`);
}

if (cruces.length > 0) {
  fallos++;
  console.log(`\n✗ ${cruces.length} títulos compartidos por páginas de secciones distintas`);
  for (const [titulo, lista] of cruces.slice(0, 30)) {
    console.log(`  «${legible(titulo)}»`);
    for (const p of lista) console.log(`    - ${p.rel} (${seccionDe(p.ruta).etiqueta})`);
  }
  if (cruces.length > 30) console.log(`  … y ${cruces.length - 30} títulos más`);
}

if (fallos > 0) process.exit(1);

if (repetidos.length > 0) {
  console.log(
    `\nAviso: ${repetidos.length} títulos repetidos dentro de la misma sección —fichas homónimas que separa la categoría—:`,
  );
  for (const [titulo, lista] of repetidos.slice(0, 10)) {
    console.log(`  «${legible(titulo)}»: ${lista.map((p) => p.rel).join(", ")}`);
  }
  if (repetidos.length > 10) console.log(`  … y ${repetidos.length - 10} más`);
}

console.log(
  `Título único por sección: ninguna de las ${paginas.length} páginas comparte título con una de otra sección.`,
);
