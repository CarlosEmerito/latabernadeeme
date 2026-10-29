/**
 * Comprueba que el botón «JSON» de una ficha descargue el fichero con el nombre
 * de la entrada y no con el nombre recortado a mano.
 *
 * El nombre del fichero se armaba con
 * `String(datos.datos.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")`, que no
 * pliega los acentos: los sustituye por guiones. «Águila» descargaba
 * `-guila.json` —con guion delante y sin la primera letra—, «Bastón de madera»
 * `bast-n-de-madera.json`, «Paquete de ladrón» `paquete-de-ladr-n.json` y
 * «Vara (3 m)» `vara-3-m-.json`. Son 759 de las 2 502 entradas de `data/` las
 * que salen con un nombre distinto del suyo, y 26 empiezan por guion.
 *
 * El sitio ya tiene la pieza que lo hace bien: `slugify()` (`src/lib/content.ts`)
 * pliega con `plegar()` y recorta los guiones de los extremos, y cada entrada
 * trae su `slug`, que es el nombre de su carpeta y de su URL. Lo que faltaba era
 * que el JSON publicado en `#datos-entrada` llevara ese slug, porque el script
 * del navegador solo tenía el nombre a mano.
 *
 * Lo que se comprueba, contra el sitio compilado:
 *
 *   1. Cada ficha publica en su `#datos-entrada` un `slug` que es el de su
 *      carpeta (el de su URL) y que sirve como nombre de fichero: minúsculas,
 *      dígitos y guiones sueltos entre ellos, sin guion al principio ni al final.
 *   2. El fuente de la ficha (`src/components/Detalle.astro`) arma `a.download`
 *      desde ese slug y no recortando el nombre: el recorte a mano es justo el
 *      que se lleva por delante las tildes.
 *
 * Y se autocomprueba con un payload sin slug, con un slug que no es el de la
 * carpeta, con uno que empieza por guion y con la línea vieja del fuente, que
 * tienen que poner las dos comprobaciones en rojo.
 *
 * Uso: node tools/test/descarga.mjs [dist]
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");
const FUENTE = path.join(RAIZ, "src/components/Detalle.astro");

/** Las ediciones y los tipos que publican ficha, tal como los nombra el sitio. */
const EDICIONES = ["5e", "5.5"];
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

/** Un slug servible como nombre de fichero: sin guiones de adorno ni acentos. */
const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** El JSON que la ficha publica para el botón de descarga, o `null` si no está. */
function payloadDe(html) {
  const m = /<script type="application\/json" id="datos-entrada"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (error) {
    return { __error: `el JSON no se puede leer: ${error.message}` };
  }
}

/**
 * Qué le falta al payload para que el fichero se llame como la entrada.
 *
 * Devuelve la lista de problemas; vacía es que está bien.
 */
function erroresDePayload(payload, slugCarpeta) {
  const fallos = [];
  if (!payload) return ["la ficha no publica #datos-entrada"];
  if (payload.__error) return [payload.__error];
  const slug = payload.slug;
  if (typeof slug !== "string" || !slug.trim()) {
    fallos.push("el payload no lleva slug: el botón solo tiene el nombre y lo recorta a mano");
    return fallos;
  }
  if (slug !== slugCarpeta) {
    fallos.push(`el slug del payload («${slug}») no es el de la entrada («${slugCarpeta}»)`);
  }
  if (!SLUG_VALIDO.test(slug)) {
    fallos.push(`«${slug}» no sirve como nombre de fichero (acentos, guion suelto o vacío)`);
  }
  return fallos;
}

/**
 * Qué le falta al fuente de la ficha para no recortar el nombre.
 *
 * Devuelve la lista de problemas; vacía es que está bien.
 */
function erroresDeFuente(texto) {
  const fallos = [];
  const asignacion = /a\.download\s*=\s*([^;]+);/.exec(texto);
  if (!asignacion) {
    fallos.push("no encuentro la asignación de a.download en Detalle.astro");
    return fallos;
  }
  const valor = asignacion[1];
  if (!/\bslug\b/.test(valor)) {
    fallos.push("a.download no sale del slug de la entrada");
  }
  if (/\[\^a-z0-9\]/.test(valor)) {
    fallos.push("a.download recorta el nombre con [^a-z0-9], que cambia cada tilde por un guion");
  }
  if (/datos\.datos\.name|datos\.name/.test(valor)) {
    fallos.push("a.download se arma con el nombre de la ficha y no con su slug");
  }
  return fallos;
}

/** Recorre las fichas publicadas: `dist/<edición>/<tipo>/<slug>/index.html`. */
function fichas() {
  const lista = [];
  for (const ed of EDICIONES) {
    for (const tipo of TIPOS) {
      const carpeta = path.join(DIST, ed, tipo);
      if (!fs.existsSync(carpeta)) continue;
      for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
        if (!entrada.isDirectory()) continue;
        const pagina = path.join(carpeta, entrada.name, "index.html");
        if (fs.existsSync(pagina)) lista.push({ ed, tipo, slug: entrada.name, pagina });
      }
    }
  }
  return lista;
}

// ── La autocomprobación va primero: una puerta que no sabe ponerse roja no vale ──

assert.ok(
  erroresDePayload({ datos: { name: "Águila" } }, "aguila").length > 0,
  "la comprobación no ve un payload sin slug",
);
assert.ok(
  erroresDePayload({ slug: "otro" }, "aguila").length > 0,
  "la comprobación no ve un slug que no es el de la carpeta",
);
assert.ok(
  erroresDePayload({ slug: "-guila" }, "guila").length > 0,
  "la comprobación no ve un slug con guion delante",
);
assert.deepEqual(
  erroresDePayload({ slug: "arana-de-fase" }, "arana-de-fase"),
  [],
  "la comprobación rechaza un payload bueno",
);
assert.deepEqual(
  erroresDeFuente('a.download = `${datos.slug}.json`;'),
  [],
  "la comprobación rechaza un fuente bueno",
);
assert.ok(
  erroresDeFuente(
    'a.download = `${String(datos.datos.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;',
  ).length > 0,
  "la comprobación no ve la línea vieja que recorta el nombre",
);

// ── El sitio compilado ──────────────────────────────────────────────────────

const publicadas = fichas();
assert.ok(publicadas.length > 1000, `no encuentro fichas en ${DIST} (${publicadas.length})`);

const problemas = [];
let fichasDeVerdad = 0;
for (const ficha of publicadas) {
  const html = fs.readFileSync(ficha.pagina, "utf8");
  const payload = payloadDe(html);
  // `/<edición>/reglas/indice/` cuelga de la misma carpeta y no es una ficha: se
  // reconoce porque no publica el botón de descarga. Una ficha que lo publica y
  // se quede sin payload sí es un fallo.
  if (!payload && !/id="bajar-json"/.test(html)) continue;
  fichasDeVerdad += 1;
  for (const fallo of erroresDePayload(payload, ficha.slug)) {
    problemas.push(`${ficha.ed}/${ficha.tipo}/${ficha.slug}/: ${fallo}`);
  }
}

// ── El fuente: el nombre sale del slug, no del recorte del nombre ────────────

const fuente = fs.readFileSync(FUENTE, "utf8");
const problemasDelFuente = erroresDeFuente(fuente);
for (const fallo of problemasDelFuente) problemas.push(`src/components/Detalle.astro: ${fallo}`);

if (problemas.length) {
  console.error("✗ El botón «JSON» no descarga el fichero con el nombre de la entrada:");
  for (const p of problemas.slice(0, 12)) console.error(`  · ${p}`);
  if (problemas.length > 12) console.error(`  · … y ${problemas.length - 12} más`);
  process.exit(1);
}

console.log(
  `✓ Descarga JSON: las ${fichasDeVerdad} fichas publican el slug de su entrada y el fichero se llama como ella`,
);
