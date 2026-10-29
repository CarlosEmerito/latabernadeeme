/**
 * Comprueba que el botín de `/mesa/` sale del catálogo que la página anuncia.
 *
 * El panel «Botín» se llena con el JSON que la plantilla publica en
 * `<script type="application/json" id="datos-botin">`, y ese JSON se armaba solo
 * con `cargar("5e", "objetos")` —el catálogo de 2014— mientras la misma página
 * dice que la sección Mesa usa el 5.2.1: el constructor de encuentros arranca en
 * el 5.2.1, la nota del presupuesto nombra el SRD 5.2.1 y el pie de la página
 * remite las reglas de 5.1 a su propio índice.
 *
 * El resultado es que 24 objetos del 5.2.1 no podían salir nunca, seis de ellos
 * legendarios («Capa de invisibilidad», «Baraja misteriosa», las tres bolas de
 * cristal y «Vara de la resurrección»), y que la rareza «Común» tenía un solo
 * objeto en el pool: el generador devolvía siempre el mismo y parecía roto.
 *
 * Lo que se compara es el pool publicado contra `data/ed52/objetos`, objeto a
 * objeto y rareza a rareza. Una rareza con un único objeto no basta: no es que
 * falte un dato, es que el generador deja de ser un generador.
 *
 * Uso: node tools/test/botin.mjs [dist]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");
const PAGINA = path.join(DIST, "mesa/index.html");
const CATALOGO = path.join(RAIZ, "data/ed52/objetos");

/** Las rarezas que ofrece el selector del panel, con la etiqueta que se lee. */
const RAREZAS = ["común", "poco común", "raro", "muy raro", "legendario"];

/** Los objetos del catálogo, agrupados por rareza. */
function objetosPorRareza(dir) {
  const grupos = {};
  for (const fichero of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const crudo = fs.readFileSync(path.join(dir, fichero), "utf8");
    const fin = crudo.indexOf("\n---\n", 4);
    const fm = crudo.startsWith("---") && fin > 0 ? crudo.slice(4, fin) : "";
    const dato = (clave) => {
      const m = new RegExp(`^${clave}:\\s*(.+)$`, "m").exec(fm);
      return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : "";
    };
    const nombre = dato("name");
    const rareza = dato("rarity").toLowerCase();
    if (!nombre || !rareza) continue;
    (grupos[rareza] ??= []).push(nombre);
  }
  return grupos;
}

/** El pool que publica la página: el JSON del panel de botín. */
function poolPublicado(html) {
  const m = /<script type="application\/json" id="datos-botin">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    const datos = JSON.parse(m[1]);
    return datos && typeof datos === "object" ? datos : null;
  } catch {
    return null;
  }
}

/**
 * Los descuadres entre el catálogo y el pool publicado.
 *
 * `catalogo` es la referencia (los objetos del 5.2.1 por rareza) y `pool` lo que
 * la página reparte. El pool puede traer más —si algún día el panel ofrece las
 * dos ediciones—, pero no menos: cada objeto del catálogo tiene que estar.
 */
export function revisar(pool, catalogo, rarezas = RAREZAS) {
  const problemas = [];
  if (!pool) return ["la página no publica el JSON del botín (#datos-botin)"];

  for (const rareza of rarezas) {
    const enPool = pool[rareza];
    if (!Array.isArray(enPool)) {
      problemas.push(`el pool no trae la rareza «${rareza}», que sí está en el selector`);
      continue;
    }
    const distintos = new Set(enPool);
    if (distintos.size < 2) {
      problemas.push(`la rareza «${rareza}» tiene ${distintos.size} objeto(s) distinto(s): el generador siempre devuelve el mismo`);
    }
    for (const objeto of catalogo[rareza] ?? []) {
      if (!distintos.has(objeto)) problemas.push(`falta «${objeto}» en la rareza «${rareza}»`);
    }
  }
  return problemas;
}

const fallos = [];
let comprobados = 0;

/**
 * Las rarezas que el desplegable del panel ofrece de verdad, leídas del HTML
 * publicado.
 *
 * `RAREZAS`, arriba, es una constante del test: comprueba el pool contra una
 * lista escrita a mano, así que la lista y el selector pueden separarse sin que
 * nada lo diga. Lo que el lector puede pedir está en el HTML, y es de ahí de
 * donde se lee.
 */
export function rarezasDelSelector(html) {
  const m = /<select id="bot-rareza"[^>]*>([\s\S]*?)<\/select>/.exec(String(html ?? ""));
  if (!m) return null;
  return [...m[1].matchAll(/<option value="([^"]*)"/g)].map((o) => o[1]);
}

/**
 * El catálogo entero tiene que ser alcanzable desde el panel.
 *
 * Dos cosas distintas, y las dos se ven en la mesa: cada rareza del catálogo
 * con su opción en el selector —si no, sus objetos no se pueden pedir— y cada
 * objeto apareciendo en el pool de una rareza que el selector ofrece.
 */
export function revisarAlcance(pool, catalogo, opciones) {
  const problemas = [];
  if (!opciones) return ["la página no publica el selector de rareza (#bot-rareza)"];

  for (const rareza of Object.keys(catalogo)) {
    if (!opciones.includes(rareza)) {
      problemas.push(
        `el selector no ofrece la rareza «${rareza}», que sí está en el catálogo (${catalogo[rareza].length} objeto(s) que no pueden salir)`,
      );
    }
  }
  for (const [rareza, objetos] of Object.entries(catalogo)) {
    for (const objeto of objetos) {
      if (!opciones.some((opcion) => (pool?.[opcion] ?? []).includes(objeto))) {
        problemas.push(
          `«${objeto}» (rareza «${rareza}») no puede salir nunca: ninguna opción del selector lleva a su rareza`,
        );
      }
    }
  }
  return problemas;
}

// El ejemplo: el pool con todo el catálogo del 5.2.1 no da ningún problema.
const catalogoReal = fs.existsSync(CATALOGO) ? objetosPorRareza(CATALOGO) : {};
const catalogo = Object.fromEntries(RAREZAS.map((r) => [r, catalogoReal[r] ?? []]));

comprobados++;
if (revisar(Object.fromEntries(RAREZAS.map((r) => [r, [...catalogo[r]]])), catalogo).length > 0) {
  fallos.push("un pool con todo el catálogo del 5.2.1 ya sale con problemas");
}

// Y cada perturbación del pool tiene que notarse: sin esto la puerta podría
// estar en verde por no mirar nada.
for (const rareza of RAREZAS) {
  if (catalogo[rareza].length < 2) continue;
  comprobados++;
  const pool = Object.fromEntries(RAREZAS.map((r) => [r, [...catalogo[r]]]));
  const quitado = pool[rareza].pop();
  if (revisar(pool, catalogo).every((p) => !p.includes(quitado))) {
    fallos.push(`quitar «${quitado}» del pool no pone la puerta en rojo`);
  }

  comprobados++;
  const soloUno = Object.fromEntries(RAREZAS.map((r) => [r, [...catalogo[r]]]));
  soloUno[rareza] = [soloUno[rareza][0]];
  if (revisar(soloUno, catalogo).length === 0) {
    fallos.push(`dejar «${rareza}» con un solo objeto no pone la puerta en rojo`);
  }
}

// Y contra la página de verdad: el pool que se publica hoy.
comprobados++;
if (!fs.existsSync(PAGINA)) {
  fallos.push(`no está la página publicada ${PAGINA} (¿falta npm run build?)`);
} else {
  const problemas = revisar(poolPublicado(fs.readFileSync(PAGINA, "utf8")), catalogo);
  for (const problema of problemas) fallos.push(`el botín de /mesa/: ${problema}`);
}

/* El alcance: la página de verdad, con las opciones que ofrece su selector.
   `revisar` mira el pool contra cinco rarezas escritas en el test; esto mira lo
   que el lector puede pedir, que es lo que decide si un objeto se reparte o se
   queda en el JSON para siempre. */
if (!fs.existsSync(PAGINA)) {
  comprobados++;
  fallos.push(`no hay página publicada donde leer el selector de rareza (${PAGINA})`);
} else {
  const html = fs.readFileSync(PAGINA, "utf8");
  const opciones = rarezasDelSelector(html);
  comprobados++;
  for (const problema of revisarAlcance(poolPublicado(html), catalogoReal, opciones)) {
    fallos.push(`el botín de /mesa/: ${problema}`);
  }

  /* La autocomprobación: con las opciones del catálogo entero no hay problema,
     y quitar una deja en rojo nombrando lo que se queda fuera. Sin esto la
     puerta podría estar en verde por no mirar ninguna opción. */
  const todas = Object.keys(catalogoReal);
  comprobados++;
  const completo = Object.fromEntries(
    todas.map((r) => [r, [...catalogoReal[r]]]),
  );
  if (revisarAlcance(completo, catalogoReal, todas).length > 0) {
    fallos.push("un selector con todas las rarezas del catálogo ya sale con problemas");
  }

  for (const rareza of todas) {
    comprobados++;
    const sinUna = todas.filter((r) => r !== rareza);
    const problemas = revisarAlcance(completo, catalogoReal, sinUna);
    const testigo = (catalogoReal[rareza] ?? [])[0];
    if (!problemas.some((p) => p.includes(`«${rareza}»`))) {
      fallos.push(`quitar la rareza «${rareza}» del selector no pone la puerta en rojo`);
    } else if (testigo && !problemas.some((p) => p.includes(`«${testigo}»`))) {
      fallos.push(`quitar la rareza «${rareza}» no nombra «${testigo}», que deja de poder salir`);
    }
  }
}

console.log(`Botín de la Mesa: ${comprobados} casos comprobados; un objeto del catálogo que no puede salir se ve.`);
if (fallos.length > 0) {
  console.log("✗ El botín de /mesa/ no reparte el catálogo que la página anuncia:");
  for (const fallo of fallos) console.log(`   - ${fallo}`);
  process.exit(1);
}
console.log("El botín de /mesa/ reparte los objetos del 5.2.1 de cada rareza del selector, y ninguna rareza se queda con uno solo.");
