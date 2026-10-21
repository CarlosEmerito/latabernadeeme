/**
 * Comprueba que cada ficha publica el alias inglés que le toca.
 *
 * El diccionario de `src/lib/alias.ts` va de inglés a español y se invierte por
 * el nombre visible, que no es único: «Mago» es el monstruo `Mage` del SRD y la
 * clase `Wizard`. Invertido a un `Map` de un solo valor, la última entrada gana
 * y las dos fichas publicaban «En inglés: Wizard» —una de ellas mintiendo— y
 * `/datos/5.5.json` servía el mismo término a las dos. El arreglo resuelve por
 * `tipo/slug` las fichas cuyo nombre es ambiguo y deja el nombre para el resto,
 * así que aquí se vigilan las dos mitades:
 *
 *   1. Ninguna ficha publica un alias que el diccionario no dé para su nombre:
 *      un término inventado o mal escrito en la tabla por ficha se ve aquí.
 *   2. Toda ficha cuyo nombre tiene un único término inglés lo publica: si la
 *      inversión se vacía o se rompe, esto lo delata. («Druida» es clase y
 *      monstruo con el mismo término —`Druid`— y ahí el alias idéntico es
 *      correcto, por eso la regla 3 no lo mira.)
 *   3. Si dos fichas de tipos distintos comparten nombre y el diccionario da
 *      para ese nombre más de un término inglés, no pueden publicar el mismo
 *      alias: es exactamente la firma de «gana el último».
 *   4. El alias que sirve `/datos/<edición>.json` es el mismo que pinta la
 *      ficha. Son dos llamadas a `aliasDe` y tienen que coincidir.
 *
 * Uso: node tools/test/alias.mjs [directorio]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");
const FUENTE = path.join(RAIZ, "src/lib/alias.ts");

/** Los pares inglés → español del diccionario, leídos de su fuente. */
function paresDelDiccionario() {
  const texto = fs.readFileSync(FUENTE, "utf8");
  const bloque = texto.match(/const INGLES[\s\S]*?\n\};/);
  if (!bloque) throw new Error(`No encuentro el diccionario INGLES en ${FUENTE}`);
  return [...bloque[0].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)].map(([, en, es]) => [en, es]);
}

const PARES = paresDelDiccionario();
/**
 * Un refactor puede cambiar la forma del fichero y dejar el regex leyendo cuatro
 * pares sin avisar. El diccionario tiene 381: por debajo de 300, la lectura está
 * rota y la comprobación no prueba nada.
 */
if (PARES.length < 300) {
  console.error(`✗ Solo he leído ${PARES.length} pares de ${FUENTE}; el diccionario no tiene esa forma.`);
  process.exit(1);
}

/** Español en minúsculas → términos ingleses que lo comparten. */
const CANDIDATOS = new Map();
for (const [en, es] of PARES) {
  const clave = es.trim().toLowerCase();
  if (!CANDIDATOS.has(clave)) CANDIDATOS.set(clave, new Set());
  CANDIDATOS.get(clave).add(en);
}

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };
const textoPlano = (s) => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e) => ENTIDADES[e]).trim();

/** Las fichas de `dist/`, con el nombre y el alias que publican. */
const fichas = [];
/**
 * Ediciones = las que sirven `/datos/<edición>.json`. `dist/comparar/` también
 * cuelga fichas por tipo, pero no es una edición: su JSON no existe.
 */
const ediciones = fs
  .readdirSync(DIST, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(DIST, "datos", `${e.name}.json`)))
  .map((e) => e.name);
if (ediciones.length < 2) {
  console.error(`✗ Solo encuentro ${ediciones.length} edición(es) con /datos/ en ${DIST}.`);
  process.exit(1);
}

for (const ed of ediciones) {
  for (const tipo of fs.readdirSync(path.join(DIST, ed))) {
    const dirTipo = path.join(DIST, ed, tipo);
    if (!fs.statSync(dirTipo).isDirectory()) continue;
    for (const slug of fs.readdirSync(dirTipo)) {
      const fichero = path.join(dirTipo, slug, "index.html");
      if (!fs.existsSync(fichero)) continue; // listado, no ficha
      const html = fs.readFileSync(fichero, "utf8");
      const nombre = html.match(/class="ficha__titulo">([^<]*)</);
      if (!nombre) continue;
      const bloque = html.match(/class="ficha__alias">([\s\S]*?)<\/p>/);
      const ingles = bloque ? bloque[1].match(/<span lang="en">([^<]*)<\/span>/) : null;
      fichas.push({
        ed,
        tipo,
        slug,
        nombre: textoPlano(nombre[1]),
        alias: ingles ? textoPlano(ingles[1]) : undefined,
        pagina: path.relative(DIST, fichero),
      });
    }
  }
}

const fallos = [];

for (const f of fichas) {
  const candidatos = CANDIDATOS.get(f.nombre.toLowerCase());
  if (f.alias === undefined) {
    if (candidatos?.size === 1) {
      fallos.push(`${f.pagina}: «${f.nombre}» tiene un único término inglés (${[...candidatos][0]}) y sale sin alias.`);
    }
    continue;
  }
  if (!candidatos) {
    fallos.push(`${f.pagina}: publica «En inglés: ${f.alias}» y «${f.nombre}» no está en el diccionario.`);
  } else if (!candidatos.has(f.alias)) {
    fallos.push(
      `${f.pagina}: publica «En inglés: ${f.alias}» y el diccionario da para «${f.nombre}» ${[...candidatos].join(", ")}.`,
    );
  }
}

/** Nombre → fichas que lo llevan, para cruzar tipos distintos. */
const porNombre = new Map();
for (const f of fichas) {
  const clave = f.nombre.toLowerCase();
  if (!porNombre.has(clave)) porNombre.set(clave, []);
  porNombre.get(clave).push(f);
}

let ambiguos = 0;
for (const [nombre, grupo] of porNombre) {
  const tipos = new Set(grupo.map((f) => f.tipo));
  if (tipos.size < 2) continue;
  const candidatos = CANDIDATOS.get(nombre);
  if (!candidatos || candidatos.size < 2) continue;
  ambiguos++;
  /** Alias publicado → fichas de tipos distintos que lo comparten. */
  const porAlias = new Map();
  for (const f of grupo) {
    if (!f.alias) continue;
    if (!porAlias.has(f.alias)) porAlias.set(f.alias, []);
    porAlias.get(f.alias).push(f);
  }
  for (const [alias, conEseAlias] of porAlias) {
    const tiposConEseAlias = new Set(conEseAlias.map((f) => f.tipo));
    if (tiposConEseAlias.size < 2) continue;
    const paginas = [...new Set(conEseAlias.map((f) => f.pagina))].join(", ");
    fallos.push(
      `«${nombre}» es ambiguo (${[...candidatos].join(", ")}) y ${paginas} publican los dos «${alias}».`,
    );
  }
}

let entradasJson = 0;
for (const ed of ediciones) {
  const fichero = path.join(DIST, "datos", `${ed}.json`);
  if (!fs.existsSync(fichero)) {
    fallos.push(`Falta ${path.relative(DIST, fichero)}.`);
    continue;
  }
  const datos = JSON.parse(fs.readFileSync(fichero, "utf8"));
  for (const entrada of datos.entradas) {
    entradasJson++;
    const ficha = fichas.find((f) => f.ed === ed && f.tipo === entrada.t && f.slug === entrada.s);
    if (!ficha) {
      fallos.push(`${path.relative(DIST, fichero)}: ${entrada.t}/${entrada.s} no tiene ficha compilada.`);
      continue;
    }
    if ((entrada.a ?? undefined) !== ficha.alias) {
      fallos.push(
        `${path.relative(DIST, fichero)}: ${entrada.t}/${entrada.s} sirve ${entrada.a ?? "sin alias"} y la ficha pinta ${ficha.alias ?? "sin alias"}.`,
      );
    }
  }
}

const conAlias = fichas.filter((f) => f.alias).length;
const cabecera =
  `Fichas comprobadas: ${fichas.length} · con alias: ${conAlias} · ` +
  `entradas de /datos/: ${entradasJson} · nombres ambiguos entre tipos: ${ambiguos}`;

if (fallos.length) {
  console.error(cabecera);
  for (const fallo of fallos) console.error(`✗ ${fallo}`);
  console.error(`✗ ${fallos.length} alias incorrectos.`);
  process.exit(1);
}

console.log(cabecera);
console.log("Sin fallos: cada ficha publica su alias y ninguna se queda con el de otra ficha.");
