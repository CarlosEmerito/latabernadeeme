/**
 * Comprueba que las tipografías que se acreditan son exactamente las que el
 * sitio carga, y que no queda ninguna dependencia de fuente sin usar.
 *
 * README.md y `/licencias/` nombraban «EB Garamond e Inter» mientras
 * `src/styles/global.css` importaba Newsreader, Instrument Sans y Geist Mono:
 * dos familias acreditadas que la página no usaba, tres en uso sin acreditar y
 * 5,7 MB de dependencias (`@fontsource/eb-garamond` y
 * `@fontsource-variable/inter`) que se instalaban en cada clon y en cada CI sin
 * que nada las importara. Ninguna puerta lo veía: el build compila igual y el
 * nombre de la familia no sale en el HTML, así que la atribución se revisaba a
 * ojo. Y una página de licencias que se equivoca en la atribución es justo la
 * que no puede equivocarse.
 *
 * La comparación va en los dos sentidos —que no falte ninguna y que no sobre
 * ninguna— y la lista de familias no se escribe aquí: sale del `metadata.json`
 * de cada paquete que el CSS importa, así que cambiar de tipografía obliga a
 * tocar la atribución de los dos documentos.
 *
 * Uso: node tools/test/fuentes.mjs [dist]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");

const fallos = [];
const fallo = (donde, detalle) => fallos.push({ donde, detalle });

/** «@fontsource-variable/newsreader/400.css» → «@fontsource-variable/newsreader». */
const paquete = (ruta) => ruta.split("/").slice(0, 2).join("/");

const leer = (ruta) => fs.readFileSync(ruta, "utf8");

/** Los paquetes de fuente que el CSS importa de verdad. */
const css = leer(path.join(RAIZ, "src/styles/global.css"));
const importados = new Set(
  [...css.matchAll(/@import\s+["']([^"']*@fontsource[^"']*)["']/g)].map((m) => paquete(m[1])),
);

if (importados.size === 0) {
  fallo("src/styles/global.css", "no importa ninguna tipografía");
}

/** Familia y licencia de cada paquete, según su propio manifiesto. */
const familias = new Map();
for (const nombre of importados) {
  const manifiesto = path.join(RAIZ, "node_modules", nombre, "metadata.json");
  if (!fs.existsSync(manifiesto)) {
    fallo(nombre, "está importado en el CSS y no está instalado en node_modules");
    continue;
  }
  const meta = JSON.parse(leer(manifiesto));
  if (!meta.family) {
    fallo(nombre, "su metadata.json no declara la familia");
    continue;
  }
  familias.set(meta.family, { paquete: nombre, licencia: meta.license?.type ?? "" });
}

/** Ninguna dependencia de fuente puede quedarse sin importar: son megas en cada clon. */
const manifiesto = JSON.parse(leer(path.join(RAIZ, "package.json")));
const declaradas = Object.keys({ ...manifiesto.dependencies, ...manifiesto.devDependencies });
for (const dependencia of declaradas.filter((d) => d.startsWith("@fontsource"))) {
  if (!importados.has(dependencia)) {
    fallo(dependencia, "está en package.json y no lo importa ningún CSS");
  }
}

/** El CSS compilado tiene que llevar las familias: es la prueba de que viajan al navegador. */
const dirAstro = path.join(DIST, "_astro");
let compilado = "";
if (fs.existsSync(dirAstro)) {
  for (const fichero of fs.readdirSync(dirAstro).filter((f) => f.endsWith(".css"))) {
    compilado += leer(path.join(dirAstro, fichero));
  }
}
if (compilado === "") {
  fallo(DIST, "no hay CSS compilado: compila el sitio antes de comprobar las fuentes");
}
for (const familia of familias.keys()) {
  if (compilado !== "" && !compilado.includes(familia)) {
    fallo("dist/_astro", `la familia ${familia} está importada y no aparece en el CSS compilado`);
  }
}

/**
 * Las familias acreditadas en un texto: los nombres en negrita de su bloque.
 * Se normaliza el sufijo «Variable», que es el que pone @fontsource y no un
 * nombre con el que se acredite una tipografía.
 */
const acreditadas = (texto, bloque) =>
  new Set([...bloque.matchAll(/\*\*([^*]+)\*\*|<strong>([^<]+)<\/strong>/g)].map((m) => (m[1] ?? m[2]).replace(/\s+Variable$/, "").trim()));

const comparar = (donde, bloque) => {
  const creditos = acreditadas(donde, bloque);
  for (const familia of familias.keys()) {
    if (!creditos.has(familia)) fallo(donde, `no acredita ${familia}, que el sitio carga`);
  }
  for (const familia of creditos) {
    if (!familias.has(familia)) fallo(donde, `acredita ${familia}, que el sitio no carga`);
  }
  if (!/SIL/i.test(bloque) || !/1\.1/.test(bloque)) {
    fallo(donde, "no nombra la licencia SIL Open Font License 1.1");
  }
  return creditos.size;
};

/** README: el bloque de viñeta del apartado Web que habla de las fuentes. */
const lineasReadme = leer(path.join(RAIZ, "README.md")).split(String.fromCharCode(10));
const inicioReadme = lineasReadme.findIndex((l) => l.startsWith("- ") && /autoalojad/i.test(l));
let bloqueReadme = "";
if (inicioReadme === -1) {
  fallo("README.md", "no hay ninguna viñeta que acredite las tipografías autoalojadas");
} else {
  // La viñeta sigue mientras las líneas vayan sangradas.
  const partes = [lineasReadme[inicioReadme]];
  for (let i = inicioReadme + 1; i < lineasReadme.length && lineasReadme[i].startsWith("  "); i++) {
    partes.push(lineasReadme[i]);
  }
  bloqueReadme = partes.join(" ");
}

/** /licencias: el párrafo que empieza por «Tipografías:». */
const paginaLicencias = path.join(DIST, "licencias/index.html");
let bloqueLicencias = "";
if (!fs.existsSync(paginaLicencias)) {
  fallo("dist/licencias/index.html", "no existe la página de licencias compilada");
} else {
  const html = leer(paginaLicencias);
  const desde = html.indexOf("Tipografías:");
  if (desde === -1) {
    fallo("dist/licencias/index.html", "no hay ningún párrafo «Tipografías:»");
  } else {
    const hasta = html.indexOf("</p>", desde);
    bloqueLicencias = html.slice(desde, hasta === -1 ? undefined : hasta);
  }
}

const enReadme = bloqueReadme === "" ? 0 : comparar("README.md", bloqueReadme);
const enLicencias = bloqueLicencias === "" ? 0 : comparar("dist/licencias/index.html", bloqueLicencias);

console.log(
  `Tipografías cargadas: ${familias.size} (${[...familias.keys()].join(", ")}) · ` +
    `acreditadas en README: ${enReadme} · en /licencias: ${enLicencias}`,
);
if (fallos.length === 0) {
  console.log("Sin fallos: la atribución nombra las tipografías que el sitio carga y ninguna más.");
  process.exit(0);
}

console.log(`\nFallos: ${fallos.length}`);
for (const { donde, detalle } of fallos) {
  console.log(`  ✗ ${donde}: ${detalle}`);
}
process.exit(1);
