/**
 * Comprueba que el filtro de texto de los listados ignora tildes y mayúsculas.
 *
 * El filtro del cliente compara la consulta plegada contra `data-buscar`, así
 * que el atributo tiene que salir del HTML ya plegado: si se sirviera el nombre
 * tal cual, «dragon» no encontraría «Dragón». Aquí se verifica sobre `dist/`,
 * sin navegador:
 *
 *   1. `data-buscar` es el nombre visible plegado: sin tildes y en minúsculas.
 *   2. Es idempotente (no queda ningún combinable ni mayúscula).
 *   3. Las búsquedas sin tilde que la gente teclea encuentran filas de verdad.
 *
 * La función de plegado se repite a propósito en este fichero: si el test
 * importara la del sitio, comprobaría que el código hace lo que hace. Aquí es
 * la referencia contra la que se mide lo que se publica.
 *
 * Uso: node tools/test/filtro.mjs [dist]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");

/** Referencia: sin diacríticos y en minúsculas (NFD + rango combinable). */
const plegar = (texto) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const COMBINABLES = /[\u0300-\u036f]/;

// Listados con las palabras que se buscan sin tilde. El mínimo crece con los
// datos; se queda corto a propósito para no fallar al añadir fichas.
const SONDAS = [
  { pagina: "5.5/monstruos", termino: "dragon", minimo: 43 },
  { pagina: "5e/monstruos", termino: "dragon", minimo: 43 },
  { pagina: "5.5/objetos", termino: "pocion", minimo: 19 },
  { pagina: "5.5/conjuros", termino: "bendicion", minimo: 1 },
  { pagina: "5e/equipo", termino: "pocion", minimo: 1 },
];

const filasDe = (html) => [...html.matchAll(/data-buscar="([^"]*)"/g)].map((m) => m[1]);

const fallos = [];
const fallo = (donde, detalle) => fallos.push({ donde, detalle });

const paginas = [];
const recorrer = (dir) => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (entrada.name.endsWith(".html")) paginas.push(ruta);
  }
};
recorrer(DIST);

let filasTotales = 0;
let conDiacriticos = 0;
let listados = 0;

for (const pagina of paginas) {
  const html = fs.readFileSync(pagina, "utf8");
  if (!html.includes("data-buscar=")) continue;
  listados++;

  // Solo el cuerpo de la tabla: la cabecera también es un `<tr>` y no lleva
  // nombre que buscar.
  const abre = html.indexOf('<tbody id="cuerpo"');
  const cierra = html.indexOf("</tbody>", abre);
  if (abre === -1 || cierra === -1) {
    fallo(pagina, "listado sin tbody#cuerpo");
    continue;
  }
  const cuerpo = html.slice(abre, cierra);

  // Cada fila: `data-buscar` y el texto del enlace a la ficha. La fila lleva
  // `data-facetas`, `data-rangos` y `data-buscar` en la etiqueta `<tr>`.
  for (const trozo of cuerpo.split("<tr").slice(1)) {
    const fila = trozo.split("</tr>")[0];
    const atributo = /data-buscar="([^"]*)"/.exec(fila);
    if (!atributo) {
      fallo(pagina, "fila sin data-buscar");
      continue;
    }
    const ancla = /<td class="col-nombre">\s*<a [^>]*>([^<]*)<\/a>/.exec(fila);
    if (!ancla) {
      fallo(pagina, `fila sin enlace de nombre: «${atributo[1]}»`);
      continue;
    }
    filasTotales++;
    const buscable = atributo[1];
    const nombre = ancla[1];
    if (/[^\x00-\x7F]/.test(nombre)) conDiacriticos++;

    const esperado = plegar(nombre);
    if (buscable !== esperado) {
      fallo(pagina, `data-buscar sin plegar: «${nombre}» da «${buscable}», se esperaba «${esperado}»`);
    }
    if (COMBINABLES.test(buscable) || buscable !== plegar(buscable)) {
      fallo(pagina, `data-buscar con diacríticos o mayúsculas: «${buscable}»`);
    }
  }
}

for (const sonda of SONDAS) {
  const pagina = path.join(DIST, sonda.pagina, "index.html");
  if (!fs.existsSync(pagina)) {
    fallo(pagina, "falta el listado");
    continue;
  }
  const filas = filasDe(fs.readFileSync(pagina, "utf8"));
  if (filas.length === 0) {
    fallo(pagina, "sin filas que buscar");
    continue;
  }
  const encontradas = filas.filter((f) => f.includes(sonda.termino)).length;
  if (encontradas < sonda.minimo) {
    fallo(pagina, `«${sonda.termino}» encuentra ${encontradas} filas, se esperaban al menos ${sonda.minimo}`);
  }
}

console.log(`Listados comprobados: ${listados} · filas: ${filasTotales} (${conDiacriticos} con diacríticos en el nombre)`);
if (fallos.length === 0) {
  console.log("Sin fallos: el filtro pliega tildes y mayúsculas.");
  process.exit(0);
}

console.log(`\nFallos: ${fallos.length}`);
for (const { donde, detalle } of fallos.slice(0, 20)) {
  console.log(`  ✗ ${path.relative(DIST, donde)}: ${detalle}`);
}
process.exit(1);
