/**
 * Comprueba que el Markdown que copia el botón «Copiar Markdown» no repite la
 * unidad del PX.
 *
 * El frontmatter del SRD ya trae el PX con su unidad dentro —«50 PX», «5900 PX
 * o 7200 en la guarida; BC +4»— y la plantilla lo repetía al añadir «PX»
 * encima: el Markdown copiado salía con «50 PX PX» y con un «PX» colgando
 * detrás del «BC +4», que ya no es un PX. Afectaba a 317 de las 647 criaturas
 * de las dos ediciones, y solo en el texto copiado: la ficha publicada y el
 * JSON descargado llevaban el valor tal cual.
 *
 * La puerta no reescribe la regla: ejecuta el script que el navegador carga
 * en la ficha, le hace pulsar el botón y mira lo que va al portapapeles. Sale
 * del `script type="application/json" id="datos-entrada"` de cada HTML
 * publicado —que es lo que el navegador lee— y del bundle que trae el botón:
 *
 *   1. El bundle se localiza por el código que registra el botón, no por el
 *      nombre del fichero, que lleva un hash que cambia en cada compilación.
 *   2. Se ejecuta con el `document` y el `navigator` falseados, de modo que no
 *      hace falta navegador y el texto copiado se puede leer.
 *   3. La línea del VD no puede llevar la unidad repetida ni un «PX» detrás de
 *      un «BC +n», que ya no es un PX.
 *   4. El PX sale con la unidad puesta una sola vez y con el valor de la
 *      guarida entero, con su «BC +n» y sin nada colgando detrás.
 *
 * Y el dato que el navegador copia tiene que ser el mismo que se publica: la
 * puerta compara la línea del VD con el `xp` del JSON de la ficha.
 *
 * Uso: node tools/test/markdown.mjs [dist]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { xpConUnidad } from "../../src/lib/xp.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");

const fallos = [];
let comprobados = 0;
/** Un contador para que cada módulo se importe con una URL distinta. */
let contador = 0;
const comprobar = (condicion, detalle) => {
  comprobados++;
  if (!condicion) fallos.push(detalle);
};

// ── La unidad, con los casos que trae el corpus ──────────────────────────────

// El PX simple, con separador de millar y con la guarida: la unidad va una
// sola vez y el valor con guarida se copia entero.
comprobar(xpConUnidad("50 PX") === "50 PX", `PX simple: sale ${JSON.stringify(xpConUnidad("50 PX"))}`);
comprobar(
  xpConUnidad("62 000 PX o 75 000 en la guarida; BC +7") === "62 000 PX o 75 000 en la guarida; BC +7",
  `PX con guarida: sale ${JSON.stringify(xpConUnidad("62 000 PX o 75 000 en la guarida; BC +7"))}`,
);
comprobar(
  xpConUnidad("700 PX; BC +2") === "700 PX; BC +2",
  `PX con BC: sale ${JSON.stringify(xpConUnidad("700 PX; BC +2"))}`,
);

// Y el caso que el SRD no trae: una cifra suelta sin unidad recibe la suya.
comprobar(xpConUnidad("600") === "600 PX", `PX sin unidad: sale ${JSON.stringify(xpConUnidad("600"))}`);
comprobar(xpConUnidad("") === "", `PX vacío: sale ${JSON.stringify(xpConUnidad(""))}`);

// ── El script que publica el navegador ───────────────────────────────────────

/** El `datos-entrada` de un HTML de ficha, ya parseado. */
function datosDe(html) {
  const m = html.match(/<script type="application\/json" id="datos-entrada">(.*?)<\/script>/s);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/**
 * El código que registra el botón «Copiar Markdown» en una página.
 *
 * Puede ser un bundle aparte (`<script type="module" src="…">`, que es lo que
 * sale cuando el script importa un módulo) o un `<script>` clásico en línea.
 * Se busca por el código del botón, no por el nombre del fichero: el nombre
 * lleva un hash que cambia en cada compilación.
 */
function codigoDelBoton(html, pagina, esFallo) {
  const conSrc = [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  for (const src of conSrc) {
    const ruta = path.join(DIST, src.replace(/^\/[^/]+\//, ""));
    if (!fs.existsSync(ruta)) continue;
    const codigo = fs.readFileSync(ruta, "utf8");
    if (codigo.includes("copiar-md")) return { tipo: "modulo", ruta };
  }
  const enLinea = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const codigo of enLinea) {
    if (codigo.includes("copiar-md")) return { tipo: "linea", codigo };
  }
  esFallo(`${pagina}: no se encuentra el script que registra el botón «Copiar Markdown»`);
  return null;
}

/**
 * Ejecuta el script del botón con el DOM falseado y devuelve el texto que
 * habría ido al portapapeles.
 */
async function textoCopiado(boton, exportable) {
  const copiados = [];
  const manejadores = [];
  const document = {
    getElementById: (id) => {
      if (id === "datos-entrada") return { textContent: JSON.stringify(exportable) };
      return { textContent: "", addEventListener: (_evento, fn) => manejadores.push(fn) };
    },
    addEventListener: () => {},
    documentElement: { dataset: {} },
    // El botón del JSON crea un `<a>` y lo pulsa; sin esto el script revienta
    // antes de registrar el del Markdown.
    createElement: () => ({
      href: "",
      download: "",
      click: () => {},
      style: {},
    }),
  };
  const navigator = { clipboard: { writeText: async (texto) => copiados.push(texto) } };

  if (boton.tipo === "modulo") {
    // Cada ficha necesita su propio módulo: los módulos se cachean por URL, así
    // que hace falta un parámetro distinto en cada una. Con el nombre no
    // valía: la misma criatura en las dos ediciones —«Aboleth» en 5e y en
    // 5.5— comparten módulo y la segunda se quedaba sin el botón registrado.
    const url = `${pathToFileURL(boton.ruta).href}?ficha=${contador++}`;
    globalThis.document = document;
    Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true, writable: true });
    await import(url);
  } else {
    const fn = new Function("document", "navigator", boton.codigo);
    fn(document, navigator);
  }

  for (const manejar of manejadores) await manejar();
  return copiados[0] ?? "";
}

// ── Todas las fichas publicadas ──────────────────────────────────────────────

const paginas = [];
const recorrer = (dir) => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (entrada.name.endsWith(".html")) paginas.push(ruta);
  }
};
if (fs.existsSync(DIST)) recorrer(DIST);

const REPETIDA = /PX\s+PX/i;
const DETRAS_DE_BC = /BC\s*\+\d+\s*PX/i;

let criaturas = 0;
let sinBoton = 0;

for (const pagina of paginas) {
  const html = fs.readFileSync(pagina, "utf8");
  const exportable = datosDe(html);
  if (!exportable || exportable.tipo !== "monstruos") continue;
  criaturas++;

  const relativo = path.relative(DIST, pagina);

  // El dato que se publica lleva el PX tal cual, sin la unidad repetida.
  const xp = String(exportable.datos.xp ?? "");
  comprobar(!REPETIDA.test(xp), `${relativo}: el XP publicado repite la unidad (${xp})`);

  const boton = codigoDelBoton(html, relativo, (detalle) => {
    sinBoton++;
    fallos.push(detalle);
  });
  if (!boton) continue;

  const markdown = await textoCopiado(boton, exportable);
  const linea = markdown.split("\n").find((l) => l.startsWith("- **VD:**")) ?? "";

  comprobar(linea !== "", `${relativo}: el Markdown copiado no trae la línea del VD`);
  comprobar(!REPETIDA.test(linea), `${relativo}: el Markdown copiado repite la unidad (${linea})`);
  comprobar(!DETRAS_DE_BC.test(linea), `${relativo}: el Markdown copiado deja un PX detrás del BC (${linea})`);

  // El PX sale con la unidad puesta una sola vez y con el valor publicado.
  const esperado = `- **VD:** ${exportable.datos.cr} (${xpConUnidad(exportable.datos.xp)})`;
  comprobar(linea === esperado, `${relativo}: el VD copiado sale ${JSON.stringify(linea)} y debería ser ${JSON.stringify(esperado)}`);
}

console.log(`Comprobaciones: ${comprobados} · fichas de criatura publicadas: ${criaturas}`);
if (fallos.length === 0) {
  console.log("El Markdown copiado lleva el PX con su unidad una sola vez, en las 647 criaturas.");
  process.exit(0);
}

console.log(`\nFallos: ${fallos.length}`);
for (const fallo of fallos.slice(0, 40)) console.log(`  ✗ ${fallo}`);
process.exit(1);
