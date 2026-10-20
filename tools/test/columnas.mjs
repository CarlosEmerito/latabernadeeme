/**
 * Comprueba que ningún listado publica una columna sin datos.
 *
 * Una columna cuyos valores son todos el guion de relleno es un hueco con
 * cabecera: el lector la cuenta como columna, ordena por ella y no encuentra
 * nada. Pasa cuando el dato no existe en esa edición (el SRD 5.1 no declara la
 * característica principal de sus clases, ni la categoría de sus dotes, ni la
 * dote de sus trasfondos), así que el listado debe prescindir de la columna en
 * esa edición y conservarla en la que sí la tiene.
 *
 * Sobre `dist/`, sin navegador:
 *
 *   1. Ningún listado (los que llevan `<tbody id="cuerpo">`) trae una columna
 *      entera de guiones o de celdas vacías.
 *   2. Cada fila tiene tantas celdas como cabeceras: si el filtro de columnas
 *      dejara de aplicarse igual en las dos, los valores se desplazarían.
 *   3. `/5e/clases/` ya no ofrece «Característica» y sigue con sus 12 filas y
 *      su columna «Dado».
 *   4. `/5.5/clases/` conserva «Característica» con las 12 celdas rellenas y
 *      alineadas con su fila (Bárbaro → Fuerza).
 *
 * Uso: node tools/test/columnas.mjs [dist]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");

const VACIO = "—";

/** Texto visible de un fragmento de HTML: sin etiquetas y con espacios simples. */
const texto = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Cabeceras y filas de la tabla de un listado. */
const tablaDe = (html) => {
  const abreTabla = html.indexOf('<table class="tabla"');
  if (abreTabla === -1) return null;
  const abreThead = html.indexOf("<thead", abreTabla);
  const cierraThead = html.indexOf("</thead>", abreThead);
  const abreCuerpo = html.indexOf('<tbody id="cuerpo"', cierraThead);
  const cierraCuerpo = html.indexOf("</tbody>", abreCuerpo);
  if (abreThead === -1 || cierraThead === -1 || abreCuerpo === -1 || cierraCuerpo === -1) return null;

  const cabeceras = [...html.slice(abreThead, cierraThead).matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    texto(m[1]),
  );
  const filas = [];
  for (const trozo of html.slice(abreCuerpo, cierraCuerpo).split("<tr").slice(1)) {
    const fila = trozo.split("</tr>")[0];
    const celdas = [...fila.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => texto(m[1]));
    if (celdas.length > 0) filas.push(celdas);
  }
  return { cabeceras, filas };
};

const paginas = [];
const recorrer = (dir) => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (entrada.name.endsWith(".html")) paginas.push(ruta);
  }
};
recorrer(DIST);

const fallos = [];
const fallo = (donde, detalle) => fallos.push({ donde, detalle });

let listados = 0;
let columnasVistas = 0;
let columnasVacias = 0;

for (const pagina of paginas) {
  const html = fs.readFileSync(pagina, "utf8");
  if (!html.includes('<tbody id="cuerpo"')) continue;
  const tabla = tablaDe(html);
  const nombre = path.relative(DIST, pagina);
  if (!tabla) {
    fallo(nombre, "listado sin tabla legible");
    continue;
  }
  listados++;
  const { cabeceras, filas } = tabla;
  if (filas.length === 0) continue;

  for (const [i, cabecera] of cabeceras.entries()) {
    columnasVistas++;
    const valores = filas.map((f) => f[i] ?? "");
    // Celdas de menos sueltan `undefined` en la comparación: se cuentan como
    // vacías, pero además se avisa del desajuste en el bucle de abajo.
    const vacia = valores.every((v) => v === "" || v === VACIO);
    if (vacia) {
      columnasVacias++;
      fallo(nombre, `la columna «${cabecera}» no tiene ni un valor en ${filas.length} filas`);
    }
  }

  for (const [i, fila] of filas.entries()) {
    if (fila.length !== cabeceras.length) {
      fallo(nombre, `la fila ${i + 1} tiene ${fila.length} celdas y hay ${cabeceras.length} cabeceras`);
    }
  }
}

/** Listado concreto de `dist/`, o `null` si no está. */
const listado = (ruta) => {
  const pagina = path.join(DIST, ruta, "index.html");
  if (!fs.existsSync(pagina)) {
    fallo(ruta, "falta el listado");
    return null;
  }
  const tabla = tablaDe(fs.readFileSync(pagina, "utf8"));
  if (!tabla) {
    fallo(ruta, "listado sin tabla legible");
    return null;
  }
  return tabla;
};

// 5.1: el dato no está en el SRD, así que la columna no se publica.
const clases51 = listado("5e/clases");
if (clases51) {
  const { cabeceras, filas } = clases51;
  if (cabeceras.includes("Característica")) fallo("5e/clases", "sigue publicando la columna «Característica»");
  if (cabeceras.join("|") !== "Nombre|Dado") fallo("5e/clases", `cabeceras inesperadas: ${cabeceras.join(" · ")}`);
  if (filas.length !== 12) fallo("5e/clases", `${filas.length} filas, se esperaban 12`);
  for (const [i, fila] of filas.entries()) {
    if (!/^d\d+$/.test(fila[1] ?? "")) {
      fallo("5e/clases", `la fila ${i + 1} no trae su dado de golpe en la segunda celda: «${fila[1]}»`);
    }
  }
}

// 5.2.1: el dato está en el SRD y la columna se conserva con su valor alineado.
const clases52 = listado("5.5/clases");
if (clases52) {
  const { cabeceras, filas } = clases52;
  const col = cabeceras.indexOf("Característica");
  if (col === -1) fallo("5.5/clases", "ha perdido la columna «Característica»");
  else {
    if (filas.length !== 12) fallo("5.5/clases", `${filas.length} filas, se esperaban 12`);
    const vacias = filas.filter((f) => !f[col] || f[col] === VACIO);
    if (vacias.length > 0) fallo("5.5/clases", `${vacias.length} de ${filas.length} celdas de «Característica» sin valor`);
    const barbaro = filas.find((f) => f[0] === "Bárbaro");
    if (!barbaro) fallo("5.5/clases", "no está la fila del Bárbaro");
    else if (barbaro[col] !== "Fuerza") {
      fallo("5.5/clases", `la Característica del Bárbaro no cuadra con su fila: «${barbaro[col]}»`);
    }
  }
}

console.log(`Listados comprobados: ${listados} · columnas: ${columnasVistas} · columnas sin datos: ${columnasVacias}`);
if (fallos.length === 0) {
  console.log("Sin fallos: ningún listado publica una columna vacía.");
  process.exit(0);
}

console.log(`\nFallos: ${fallos.length}`);
for (const { donde, detalle } of fallos.slice(0, 20)) {
  console.log(`  ✗ ${donde}: ${detalle}`);
}
process.exit(1);
