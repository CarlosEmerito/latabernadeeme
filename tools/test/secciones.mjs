/**
 * Comprueba que la comparación de dos ediciones enseña todos sus apartados.
 *
 * El comparador de `/comparar/` alinea los bloques de las dos ediciones del SRD
 * y los pinta en una tabla de dos columnas. Cuando los dos apartados tienen
 * nombres distintos —«Senda Primordial (nivel 3)» en el 5.1 y «Subclase de
 * bárbaro (nivel 3)» en el 5.2.1— la fila se pintaba con un solo `<span
 * role="cell">`, el del 5.1, y el nombre de 2024 desaparecía de la página.
 * Medido sobre `dist/`, eran 118 apartados en 23 páginas, casi todos rasgos de
 * clase, que es donde más se renombró el SRD en 2024.
 *
 * La puerta mira el HTML publicado, que es lo que ve el lector: cada
 * encabezado del markdown de las dos ediciones tiene que aparecer en su página
 * de comparación. Si algún día la alineación vuelve a perder un apartado, la
 * página lo dice por su nombre.
 *
 * Uso: node tools/test/secciones.mjs [dist]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");
const DATOS = path.join(RAIZ, "data");
/** Las dos ediciones y la carpeta donde vive cada una. */
const EDICIONES = [
  { dir: "ed51", nombre: "SRD 5.1" },
  { dir: "ed52", nombre: "SRD 5.2.1" },
];

/** Sin tildes, sin mayúsculas y sin espacios de sobra: «Golpe Brutal» = «golpe brutal». */
const plegar = (texto) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Los títulos de un markdown de `data/`: las líneas que empiezan por almohadillas. */
const titulosDelMarkdown = (markdown) =>
  markdown
    .split("\n")
    .filter((linea) => /^#{1,6}\s/.test(linea.trim()))
    .map((linea) => linea.trim().replace(/^#{1,6}\s*/, "").trim());

/** Los títulos que publica la página de comparación, uno por banda de sección. */
const titulosPublicados = (html) => {
  const titulos = [];
  // Cada banda de sección va desde su `<div class="comparar__seccion` hasta la
  // fila o la banda siguiente. El corte tiene que ser exacto: `seccion-celda`
  // y `seccion-titulo` también empiezan por `comparar__seccion`.
  for (const trozo of html.split(/<div class="comparar__seccion(?![-\w])/).slice(1)) {
    const banda = trozo.split(/<div class="comparar__(?:fila|cab)(?![-\w])/)[0];
    for (const m of banda.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)) {
      titulos.push(m[2].replace(/<[^>]+>/g, "").trim());
    }
  }
  return titulos;
};

const comprobar = (edicion, tipo, slug) => {
  const pagina = path.join(DIST, "comparar", tipo, slug, "index.html");
  if (!fs.existsSync(pagina)) return null;
  const markdown = path.join(DATOS, edicion.dir, tipo, `${slug}.md`);
  if (!fs.existsSync(markdown)) return null;

  const html = fs.readFileSync(pagina, "utf8");
  const publicados = new Set(titulosPublicados(html).map(plegar));
  const faltan = [];
  for (const titulo of titulosDelMarkdown(fs.readFileSync(markdown, "utf8"))) {
    if (!publicados.has(plegar(titulo))) faltan.push(titulo);
  }
  return faltan.length > 0 ? { tipo, slug, edicion: edicion.nombre, faltan } : null;
};

const problemas = [];
let paginas = 0;
let apartados = 0;

for (const edicion of EDICIONES) {
  const carpeta = path.join(DATOS, edicion.dir);
  if (!fs.existsSync(carpeta)) continue;
  for (const tipo of fs.readdirSync(carpeta)) {
    const dirTipo = path.join(carpeta, tipo);
    if (!fs.statSync(dirTipo).isDirectory()) continue;
    for (const fichero of fs.readdirSync(dirTipo)) {
      if (!fichero.endsWith(".md")) continue;
      const slug = fichero.replace(/\.md$/, "");
      const resultado = comprobar(edicion, tipo, slug);
      if (!resultado) continue;
      if (resultado.faltan.length === 0) continue;
      problemas.push(resultado);
    }
  }
}

// Las páginas de comparación son las que existen en `dist/` para las dos
// ediciones; se cuentan aparte para decir cuántas se han mirado.
const distComparar = path.join(DIST, "comparar");
if (fs.existsSync(distComparar)) {
  for (const tipo of fs.readdirSync(distComparar)) {
    const dirTipo = path.join(distComparar, tipo);
    if (!fs.statSync(dirTipo).isDirectory()) continue;
    for (const slug of fs.readdirSync(dirTipo)) {
      if (fs.existsSync(path.join(dirTipo, slug, "index.html"))) paginas++;
    }
  }
}
for (const edicion of EDICIONES) {
  const carpeta = path.join(DATOS, edicion.dir);
  if (!fs.existsSync(carpeta)) continue;
  for (const tipo of fs.readdirSync(carpeta)) {
    const dirTipo = path.join(carpeta, tipo);
    if (!fs.statSync(dirTipo).isDirectory()) continue;
    for (const fichero of fs.readdirSync(dirTipo)) {
      if (!fichero.endsWith(".md")) continue;
      apartados += titulosDelMarkdown(fs.readFileSync(path.join(dirTipo, fichero), "utf8")).length;
    }
  }
}

console.log(`Páginas de comparación comprobadas: ${paginas} · apartados del markdown: ${apartados}`);
console.log(`Páginas con apartados que no se publican: ${problemas.length}`);

if (problemas.length > 0) {
  console.log("");
  for (const p of problemas) {
    console.log(`  ✗ /comparar/${p.tipo}/${p.slug}/: ${p.faltan.length} apartado(s) del ${p.edicion} no salen en la página:`);
    for (const titulo of p.faltan) console.log(`      · ${titulo}`);
  }
  console.log("");
  console.log("  Un apartado que no se publica no se puede comparar: la página enseña una sola de las dos redacciones.");
  process.exit(1);
}

console.log("Todos los apartados de las dos ediciones salen en su página de comparación.");
process.exit(0);
