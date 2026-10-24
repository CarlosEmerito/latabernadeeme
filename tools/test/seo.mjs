/**
 * Metadatos sociales de todas las páginas compiladas.
 *
 * Cada página tiene que publicar una sola canónica absoluta con la base del
 * despliegue y una barra final, `og:url` idéntica a ella, `og:type` con
 * `article` en las fichas y `website` en la portada y los listados, y una
 * `og:image` absoluta que sea el PNG del sigilo de esa ficha, la tarjeta propia de la portada o el genérico
 * y exista de verdad en `dist/`. Sin esto cada ficha se indexaba en dos
 * direcciones (`/…/` y `/…/index.html`) y al pegar un enlace en WhatsApp,
 * Telegram o X no salía ninguna imagen.
 *
 * Uso: node tools/test/seo.mjs [directorio] [base]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");
const BASE = (process.argv[3] ?? "/latabernadeeme").replace(/\/$/, "");
// El dominio sale de astro.config.mjs: si cambia allí y no aquí, este paso falla
// y obliga a mirarlo, que es justo lo que se quiere de una canónica.
const config = fs.readFileSync(path.join(RAIZ, "astro.config.mjs"), "utf8");
const SITIO = (/site:\s*"([^"]+)"/.exec(config) ?? [])[1];
if (!SITIO) {
  console.error("No encuentro `site:` en astro.config.mjs.");
  process.exit(1);
}

const paginas = [];
const recorrer = (dir) => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (entrada.name.endsWith(".html")) paginas.push(ruta);
  }
};
recorrer(DIST);

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
const FICHA = new RegExp(`^/(5e|5\\.5)/(${TIPOS.join("|")})/(?!indice/)[^/]+/$`);
const GENERICA = `${BASE}/img/og/reglas/generico.png`;
// La portada no habla de una entrada concreta: lleva su propia tarjeta, dibujada
// aparte y guardada en `public/img/og/portada.png`.
const PORTADA = `${BASE}/img/og/portada.png`;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Valores de `content` de las `<meta>` con ese atributo y ese nombre. */
const metas = (html, atributo, clave) =>
  [...html.matchAll(new RegExp(`<meta[^>]*${atributo}="${clave}"[^>]*>`, "g"))].map(
    (m) => /content="([^"]*)"/.exec(m[0])?.[1] ?? "",
  );

const fallos = [];
const anotar = (pagina, motivo) => fallos.push(`${pagina}: ${motivo}`);

let fichas = 0;
let listados = 0;

for (const fichero of paginas) {
  const html = fs.readFileSync(fichero, "utf8");
  const rel = path.relative(DIST, fichero).split(path.sep).join("/");
  const ruta = `/${rel.replace(/index\.html$/, "").replace(/\.html$/, "/")}`;
  const nombre = rel;

  const canonicales = [...html.matchAll(/<link[^>]*rel="canonical"[^>]*>/g)].map(
    (m) => /href="([^"]*)"/.exec(m[0])?.[1] ?? "",
  );
  if (canonicales.length !== 1) {
    anotar(nombre, `${canonicales.length} enlaces rel=canonical`);
    continue;
  }
  const canonica = canonicales[0];
  const esperada = `${SITIO}${BASE}${ruta}`;
  if (canonica !== esperada) anotar(nombre, `canónica «${canonica}» en vez de «${esperada}»`);
  if (canonica.replace(/^https?:\/\//, "").includes("//")) anotar(nombre, `canónica con doble barra: ${canonica}`);
  if (!canonica.endsWith(ruta === "/" ? `${BASE}/` : ruta)) anotar(nombre, `canónica sin la ruta de la página: ${canonica}`);

  const ogUrl = metas(html, "property", "og:url");
  if (ogUrl.length !== 1) anotar(nombre, `${ogUrl.length} og:url`);
  else if (ogUrl[0] !== canonica) anotar(nombre, `og:url «${ogUrl[0]}» no coincide con la canónica`);

  const esFicha = FICHA.test(ruta);
  if (esFicha) fichas++;
  else listados++;
  const ogType = metas(html, "property", "og:type");
  const tipoEsperado = esFicha ? "article" : "website";
  if (ogType.length !== 1) anotar(nombre, `${ogType.length} og:type`);
  else if (ogType[0] !== tipoEsperado) anotar(nombre, `og:type «${ogType[0]}» en vez de «${tipoEsperado}»`);

  const card = metas(html, "name", "twitter:card");
  if (card.length !== 1) anotar(nombre, `${card.length} twitter:card`);
  else if (!["summary", "summary_large_image"].includes(card[0])) anotar(nombre, `twitter:card «${card[0]}»`);

  const imagenes = metas(html, "property", "og:image");
  if (imagenes.length !== 1) {
    anotar(nombre, `${imagenes.length} og:image`);
    continue;
  }
  const imagen = imagenes[0];
  if (!imagen.startsWith(`${SITIO}${BASE}/`)) {
    anotar(nombre, `og:image no es absoluta bajo el sitio: «${imagen}»`);
    continue;
  }
  // El sigilo de la ficha es la fuente de la tarjeta: si la página lo pinta,
  // og:image tiene que ser ese mismo dibujo rasterizado.
  const sigilo = /<img[^>]*class="sigilo-entrada"[^>]*src="([^"]*)"/.exec(html)?.[1];
  if (esFicha && sigilo) {
    const tarjeta = sigilo.replace("/img/sigilos/", "/img/og/").replace(/\.svg$/, ".png");
    if (imagen !== `${SITIO}${tarjeta}`) anotar(nombre, `og:image «${imagen}» no es la tarjeta de «${sigilo}»`);
  } else if (!esFicha) {
    const esperada = ruta === "/" ? `${SITIO}${PORTADA}` : `${SITIO}${GENERICA}`;
    if (imagen !== esperada) anotar(nombre, `og:image «${imagen}» no es la esperada «${esperada}»`);
  }

  const ficheroImagen = path.join(DIST, decodeURIComponent(imagen.slice((SITIO + BASE).length)));
  if (!fs.existsSync(ficheroImagen)) {
    anotar(nombre, `og:image sin fichero en dist: ${imagen}`);
    continue;
  }
  const cabecera = fs.readFileSync(ficheroImagen).subarray(0, 8);
  if (!cabecera.equals(PNG)) anotar(nombre, `og:image no es un PNG: ${imagen}`);
  else if (fs.statSync(ficheroImagen).size < 1024) anotar(nombre, `og:image diminuta: ${imagen}`);
}

// La descripción de un listado es el resumen que enseñan Google y las redes:
// tiene que concordar con lo que cuenta. «193 equipo» y «1 dotes» salían así
// porque la plantilla pegaba el plural del tipo detrás del recuento sin mirar
// el número ni qué palabra era. La frase del tipo se fija aquí —con el
// partitivo del equipo, que lo que hay dentro son piezas, y el singular de
// uno— y el recuento se lee de `data/`, no de la página que se está mirando.
const FRASES = {
  conjuros: ["conjuro", "conjuros"],
  monstruos: ["monstruo", "monstruos"],
  objetos: ["objeto mágico", "objetos mágicos"],
  equipo: ["pieza de equipo", "piezas de equipo"],
  clases: ["clase", "clases"],
  especies: ["especie", "especies"],
  trasfondos: ["trasfondo", "trasfondos"],
  dotes: ["dote", "dotes"],
  reglas: ["regla", "reglas"],
};
// El sitio respeta el término de cada documento —el 5.1 dice «razas» y el 5.2
// «especies»—, así que la frase del recuento también: «9 razas del SRD 5.1».
const POR_EDICION = { "5e": { especies: ["raza", "razas"] } };
const EDICIONES = {
  "5e": { dir: "ed51", srd: "SRD 5.1" },
  "5.5": { dir: "ed52", srd: "SRD 5.2.1" },
};
let descripciones = 0;
for (const [ed, { dir, srd }] of Object.entries(EDICIONES)) {
  for (const tipo of TIPOS) {
    const fichero = path.join(DIST, ed, tipo, "index.html");
    if (!fs.existsSync(fichero)) {
      anotar(`${ed}/${tipo}/`, "no existe el listado");
      continue;
    }
    const directorio = path.join(RAIZ, "data", dir, tipo);
    const n = fs.existsSync(directorio)
      ? fs.readdirSync(directorio).filter((f) => f.endsWith(".md")).length
      : 0;
    const [uno, varios] = POR_EDICION[ed]?.[tipo] ?? FRASES[tipo] ?? [tipo, tipo];
    const esperada = `${n} ${n === 1 ? uno : varios} del ${srd}.`;
    const descripcion = metas(fs.readFileSync(fichero, "utf8"), "name", "description")[0] ?? "";
    descripciones++;
    if (descripcion !== esperada) {
      anotar(`${ed}/${tipo}/`, `descripción «${descripcion}» en vez de «${esperada}»`);
    }
  }
}

console.log(`Metadatos sociales comprobados: ${paginas.length} páginas (${fichas} fichas, ${listados} portadas y listados)`);
console.log(`Descripciones de listado comprobadas: ${descripciones} (recuento de \`data/\` y concordancia del número)`);
if (fallos.length === 0) {
  console.log(`Canónica, og:url, og:type y og:image correctos en todas, con la tarjeta en dist/ (${SITIO}${BASE}).`);
  process.exit(0);
}
console.log(`\nFallos de metadatos: ${fallos.length}`);
for (const fallo of fallos.slice(0, 30)) console.log(`  ✗ ${fallo}`);
process.exit(1);
