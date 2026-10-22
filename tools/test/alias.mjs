/**
 * Comprueba que cada ficha publica el alias inglés que le toca.
 *
 * El diccionario de `src/lib/alias.ts` va de inglés a español y se invierte por
 * el nombre visible, que no es único: «Mago» es el monstruo `Mage` del SRD y la
 * clase `Wizard`. Invertido a un `Map` de un solo valor, la última entrada gana
 * y las dos fichas publicaban «En inglés: Wizard» —una de ellas mintiendo— y
 * `/datos/5.5.json` servía el mismo término a las dos. El arreglo resuelve por
 * `tipo/slug` las fichas cuyo nombre es ambiguo y deja el nombre para el resto,
 * así que aquí se vigilan las tres mitades:
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
 * Y la quinta, que es la que faltaba: **el diccionario está atado a `data/`**.
 * Las 93 entradas que no apuntaban a ninguna ficha se perdían en silencio: la
 * línea «En inglés: …» no salía en ninguna página y quien buscaba «Thunderwave»
 * no llegaba a la «Ola atronadora». Aquí se comprueba, para las dos ediciones,
 * que todo término del diccionario apunte a una ficha real y que toda entrada
 * sin ficha se note, nombrando el término.
 *
 * Uso: node tools/test/alias.mjs [directorio]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";

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

/** Las tablas `POR_EDICION` y `POR_FICHA`, leídas de su fuente. */
function tablasDelDiccionario() {
  const texto = fs.readFileSync(FUENTE, "utf8");
  const porEdicion = {};
  const bloqueEd = texto.match(/const POR_EDICION[\s\S]*?\n\};/);
  if (bloqueEd) {
    for (const m of bloqueEd[0].matchAll(/"(5e|5\.5)":\s*\{([\s\S]*?)\n  \}/g)) {
      porEdicion[m[1]] = [...m[2].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)].map(([, en, es]) => [en, es]);
    }
  }
  const porFicha = {};
  const bloqueFicha = texto.match(/const POR_FICHA[\s\S]*?\n\};/);
  if (bloqueFicha) {
    for (const m of bloqueFicha[0].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)) {
      porFicha[m[1]] = m[2];
    }
  }
  return { porEdicion, porFicha };
}

const PARES = paresDelDiccionario();
/**
 * Un refactor puede cambiar la forma del fichero y dejar el regex leyendo cuatro
 * pares sin avisar. El diccionario tiene más de 300: por debajo de 300, la
 * lectura está rota y la comprobación no prueba nada.
 */
if (PARES.length < 300) {
  console.error(`✗ Solo he leído ${PARES.length} pares de ${FUENTE}; el diccionario no tiene esa forma.`);
  process.exit(1);
}

const { porEdicion, porFicha } = tablasDelDiccionario();

/**
 * Los nombres de las fichas de `data/`, por edición: el conjunto de nombres
 * que existen y las fichas concretas de cada nombre. Un nombre puede estar en
 * varios tipos («Mago» es clase y monstruo), así que se guardan todos.
 */
function nombresDeData() {
  const porEdicion = { ed51: new Map(), ed52: new Map() };
  for (const ed of Object.keys(porEdicion)) {
    const dir = path.join(RAIZ, "data", ed);
    if (!fs.existsSync(dir)) continue;
    for (const tipo of fs.readdirSync(dir)) {
      const dirTipo = path.join(dir, tipo);
      if (!fs.statSync(dirTipo).isDirectory()) continue;
      for (const fichero of fs.readdirSync(dirTipo)) {
        if (!fichero.endsWith(".md")) continue;
        const texto = fs.readFileSync(path.join(dirTipo, fichero), "utf8");
        const bloque = texto.match(/^---\n([\s\S]*?)\n---\n/);
        if (!bloque) continue;
        let datos;
        try {
          datos = parseYaml(bloque[1]);
        } catch {
          continue;
        }
        const nombre = String(datos?.name ?? "").trim();
        if (!nombre) continue;
        const clave = nombre.toLowerCase();
        const fichas = porEdicion[ed].get(clave) ?? [];
        fichas.push(`${tipo}/${fichero.replace(/\.md$/, "")}`);
        porEdicion[ed].set(clave, fichas);
      }
    }
  }
  return porEdicion;
}

const NOMBRES = nombresDeData();

/** Español en minúsculas → términos ingleses que lo comparten. */
const CANDIDATOS = new Map();
for (const [en, es] of PARES) {
  const clave = es.trim().toLowerCase();
  if (!CANDIDATOS.has(clave)) CANDIDATOS.set(clave, new Set());
  CANDIDATOS.get(clave).add(en);
}

/** Español en minúsculas → términos ingleses, ya tenido en cuenta la edición. */
const CANDIDATOS_EDICION = { "5e": new Map(), "5.5": new Map() };
for (const ed of ["5e", "5.5"]) {
  const porNombre = new Map();
  const anota = (en, es) => {
    const clave = es.trim().toLowerCase();
    if (!porNombre.has(clave)) porNombre.set(clave, new Set());
    porNombre.get(clave).add(en);
  };
  for (const [en, es] of PARES) anota(en, es);
  for (const [en, es] of porEdicion[ed] ?? []) anota(en, es);
  CANDIDATOS_EDICION[ed] = porNombre;
}

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };
const textoPlano = (s) => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e) => ENTIDADES[e]).trim();

const fallos = [];

// --- El diccionario atado a `data/` ---------------------------------------
// Los términos cuya ficha no existe no son ruido: son la razón por la que el
// alias no llegaba a publicarse. Cada uno se nombra, para que se vea cuál es.
//
// El diccionario común tiene que servir a las dos ediciones: un término cuyo
// nombre español solo existe en una deja a la otra edición sin alias. Los de
// `POR_EDICION` sí se comprueban solo contra su edición, que es su sitio.
const TERMINO_SIN_FICHA = new Map();
for (const ed of ["ed51", "ed52"]) {
  const nombres = NOMBRES[ed];
  if (!nombres || !nombres.size) {
    fallos.push(`No encuentro las fichas de data/${ed}/; la puerta no puede comprobar nada.`);
    continue;
  }
  for (const [en, es] of PARES) {
    if (!nombres.has(es.trim().toLowerCase())) {
      if (!TERMINO_SIN_FICHA.has(en)) TERMINO_SIN_FICHA.set(en, `${es} (en ${ed})`);
    }
  }
  const propios = ed === "ed51" ? (porEdicion["5e"] ?? []) : (porEdicion["5.5"] ?? []);
  for (const [en, es] of propios) {
    if (!nombres.has(es.trim().toLowerCase())) {
      if (!TERMINO_SIN_FICHA.has(en)) TERMINO_SIN_FICHA.set(en, `${es} (en ${ed})`);
    }
  }
}
for (const [en, es] of TERMINO_SIN_FICHA) {
  fallos.push(`El diccionario da «${en}» → «${es}» y no hay ninguna ficha con ese nombre en data/.`);
}

// Las entradas de `POR_FICHA` tienen que apuntar a una ficha real.
for (const [clave, termino] of Object.entries(porFicha)) {
  const [tipo, slug] = clave.split("/");
  const existe = ["ed51", "ed52"].some((ed) =>
    [...(NOMBRES[ed]?.values() ?? [])].flat().includes(`${tipo}/${slug}`),
  );
  if (!existe) {
    fallos.push(`La tabla POR_FICHA tiene «${clave}» → «${termino}» y esa ficha no existe en data/.`);
  }
}

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

/** La edición de `data/` que corresponde a la del sitio. */
const ED_DE_DATA = { "5e": "ed51", "5.5": "ed52" };

for (const f of fichas) {
  const porNombre = CANDIDATOS_EDICION[f.ed] ?? CANDIDATOS;
  const candidatos = porNombre.get(f.nombre.toLowerCase());
  // La clave por ficha manda sobre el nombre: si la hay, ese es el único
  // término que la ficha puede publicar.
  const porClave = porFicha[`${f.tipo}/${f.slug}`];
  if (f.alias === undefined) {
    if (porClave) {
      fallos.push(`${f.pagina}: la tabla POR_FICHA le da «${porClave}» y sale sin alias.`);
    } else if (candidatos?.size === 1) {
      fallos.push(`${f.pagina}: «${f.nombre}» tiene un único término inglés (${[...candidatos][0]}) y sale sin alias.`);
    }
    continue;
  }
  if (porClave) {
    if (f.alias !== porClave) {
      fallos.push(`${f.pagina}: la tabla POR_FICHA le da «${porClave}» y publica «${f.alias}».`);
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
  const porNombreEd = CANDIDATOS_EDICION[grupo[0].ed] ?? CANDIDATOS;
  const candidatos = porNombreEd.get(nombre);
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
  `entradas de /datos/: ${entradasJson} · nombres ambiguos entre tipos: ${ambiguos} · ` +
  `términos del diccionario: ${PARES.length} + ${Object.values(porEdicion).flat().length} por edición`;

if (fallos.length) {
  console.error(cabecera);
  for (const fallo of fallos) console.error(`✗ ${fallo}`);
  console.error(`✗ ${fallos.length} alias incorrectos.`);
  process.exit(1);
}

console.log(cabecera);
console.log(
  "Sin fallos: cada ficha publica su alias, cada término del diccionario apunta a una ficha y ninguna se queda con el de otra.",
);
