/**
 * Comprueba que el filtro de texto de los listados ignora tildes y mayúsculas
 * y que encuentra la fila también por el nombre inglés de la entrada.
 *
 * El filtro del cliente compara la consulta plegada contra `data-buscar`, así
 * que el atributo tiene que salir del HTML ya plegado: si se sirviera el nombre
 * tal cual, «dragon» no encontraría «Dragón». Aquí se verifica sobre `dist/`,
 * sin navegador:
 *
 *   1. `data-buscar` es el nombre visible plegado: sin tildes y en minúsculas.
 *   2. Es idempotente (no queda ningún combinable ni mayúscula).
 *   3. Las búsquedas sin tilde que la gente teclea encuentran filas de verdad.
 *   4. Detrás del nombre español puede ir el inglés —`ola atronadora
 *      thunderwave`—, y toda fila cuyo `/datos/<edición>.json` publica alias
 *      tiene que poder encontrarse por él: quien conoce la entrada como
 *      «Thunderwave» se encontraba el listado en cero al lado de una ficha que
 *      sí la llama así.
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
  // Los nombres ingleses: la ficha publica «En inglés: …» y el buscador del
  // sitio los encuentra, así que el filtro del listado no puede quedarse atrás.
  { pagina: "5.5/conjuros", termino: "thunderwave", minimo: 1 },
  { pagina: "5e/conjuros", termino: "thunderwave", minimo: 1 },
  { pagina: "5.5/monstruos", termino: "phase spider", minimo: 1 },
];

const filasDe = (html) => [...html.matchAll(/data-buscar="([^"]*)"/g)].map((m) => m[1]);

/**
 * El alias en inglés de una entrada, leído del JSON que publica el sitio.
 *
 * El dato bueno es el de `dist/datos/<ed>.json`, que es el mismo que alimenta
 * la tarjeta de la ficha y el `En inglés: …` de la página: si el alias no está
 * ahí, la entrada no lo tiene y no hay nada que exigir. Se indexa por tipo y
 * nombre porque el mismo nombre puede existir en dos tipos («Escudo» conjuro y
 * escudo de equipo).
 */
const aliases = new Map();
for (const ed of ["5e", "5.5"]) {
  const ruta = path.join(DIST, "datos", `${ed}.json`);
  if (!fs.existsSync(ruta)) continue;
  const datos = JSON.parse(fs.readFileSync(ruta, "utf8"));
  for (const entrada of datos.entradas ?? []) {
    if (!entrada?.a) continue;
    aliases.set(`${entrada.t}:${plegar(String(entrada.n))}`, plegar(String(entrada.a)));
  }
}

/** El alias plegado de esa entrada, o `undefined` si no tiene. */
const aliasDe = (tipo, nombre) => aliases.get(`${tipo}:${plegar(nombre)}`);

let filasConAlias = 0;

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
    const ancla = /<td class="col-nombre">\s*<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/.exec(fila);
    if (!ancla) {
      fallo(pagina, `fila sin enlace de nombre: «${atributo[1]}»`);
      continue;
    }
    filasTotales++;
    const buscable = atributo[1];
    const nombre = ancla[2];
    if (/[^\x00-\x7F]/.test(nombre)) conDiacriticos++;

    const esperado = plegar(nombre);
    // El nombre plegado va delante; detrás puede ir el alias en inglés, que es
    // lo que deja encontrar la fila por el nombre que el lector conoce.
    if (buscable !== esperado && !buscable.startsWith(`${esperado} `)) {
      fallo(pagina, `data-buscar sin plegar: «${nombre}» da «${buscable}», se esperaba «${esperado}»`);
    }
    if (COMBINABLES.test(buscable) || buscable !== plegar(buscable)) {
      fallo(pagina, `data-buscar con diacríticos o mayúsculas: «${buscable}»`);
    }

    // La ficha publica «En inglés: …» y el JSON de datos lleva el alias, así
    // que la fila tiene que poder encontrarse también por ese nombre: hoy el
    // atributo solo lleva el español y una búsqueda como «thunderwave» deja el
    // listado de conjuros en cero.
    const tipo = /\/[^/]+\/([^/]+)\/[^/]+\/?$/.exec(ancla[1])?.[1];
    const alias = tipo ? aliasDe(tipo, nombre) : undefined;
    if (alias) {
      filasConAlias++;
      if (!buscable.includes(alias)) {
        fallo(
          pagina,
          `«${nombre}» no se puede filtrar por su nombre inglés «${alias}»: data-buscar es «${buscable}»`,
        );
      }
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

console.log(`Listados comprobados: ${listados} · filas: ${filasTotales} (${conDiacriticos} con diacríticos en el nombre) · ${filasConAlias} con nombre inglés`);
if (aliases.size === 0) {
  fallo(DIST, "no se ha leído ningún alias de dist/datos: la comprobación del nombre inglés no vigila nada");
}
if (fallos.length === 0) {
  console.log("Sin fallos: el filtro pliega tildes y mayúsculas.");
  process.exit(0);
}

console.log(`\nFallos: ${fallos.length}`);
for (const { donde, detalle } of fallos.slice(0, 20)) {
  console.log(`  ✗ ${path.relative(DIST, donde)}: ${detalle}`);
}
process.exit(1);
