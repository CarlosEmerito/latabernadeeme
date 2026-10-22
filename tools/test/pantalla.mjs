/**
 * Que la pantalla del DM publique lo que dice publicar.
 *
 * La pantalla se construía con una lista fija de cinco categorías de 5.1
 * («Condiciones», «Combate», «Exploración», «Peligros», «Social») y un
 * `continue` que descartaba en silencio todo lo que no encajara: 28 de las 174
 * reglas del 5.2.1, y ninguna del glosario, que es justo donde el SRD de 2024
 * dejó «Iniciativa», «Ataques de oportunidad», «Concentración», «Puntos de
 * golpe» o «Tirada de ataque». El sitio compilaba igual y el panel se veía
 * completo, así que la pérdida no la veía nadie.
 *
 * Aquí se cruzan tres cosas: el catálogo de `data/ed52/reglas/`, lo que
 * publica `dist/mesa/pantalla/` y lo que el módulo `src/lib/pantalla.ts`
 * decide. Si la lista se vuelve a quedar corta, o si una categoría nueva del
 * SRD aparece en `data/` sin panel, esto sale en rojo.
 *
 * Uso: node tools/test/pantalla.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CATALOGO = path.join(RAIZ, "data/ed52/reglas");
const PAGINA = path.join(RAIZ, "dist/mesa/pantalla/index.html");

const fallos = [];
let comprobados = 0;

function comprueba(nombre, fn) {
  comprobados++;
  try {
    fn();
  } catch (e) {
    fallos.push(`${nombre}: ${String(e.message).split("\n")[0]}`);
  }
}

/** Las reglas del catálogo, con su frontmatter. */
function leerCatalogo() {
  return fs
    .readdirSync(CATALOGO)
    .filter((f) => f.endsWith(".md"))
    .map((fichero) => {
      const crudo = fs.readFileSync(path.join(CATALOGO, fichero), "utf8");
      const m = crudo.match(/^---\n([\s\S]*?)\n---\n/);
      const data = m ? (parseYaml(m[1]) ?? {}) : {};
      return { slug: fichero.replace(/\.md$/, ""), data };
    });
}

/** Los paneles publicados, con el id y los enlaces de cada uno. */
function leerPaneles(html) {
  const secciones = [
    ...html.matchAll(/<section class="pantalla__panel"[^>]*data-panel="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g),
  ];
  return secciones.map(([, id, cuerpo]) => ({
    id,
    enlaces: [...cuerpo.matchAll(/<a href="[^"]*\/5\.5\/reglas\/([^/"]+)\/"[^>]*>([\s\S]*?)<\/a>/g)].map(
      ([, slug, texto]) => ({ slug, nombre: texto.replace(/<[^>]+>/g, "").trim() }),
    ),
  }));
}

const catalogo = leerCatalogo();
const porSlug = new Map(catalogo.map((r) => [r.slug, r]));
const categorias = new Set(catalogo.map((r) => String(r.data.category ?? "")));

const html = fs.existsSync(PAGINA) ? fs.readFileSync(PAGINA, "utf8") : null;
const paneles = html ? leerPaneles(html) : [];
const publicadas = paneles.flatMap((p) => p.enlaces);
const slugsPublicados = new Set(publicadas.map((e) => e.slug));

comprueba("la pantalla está compilada en dist/", () => {
  if (!html) throw new Error(`no existe ${path.relative(RAIZ, PAGINA)}: compila antes de probar`);
  if (!paneles.length) throw new Error("la pantalla no publica ningún panel");
});

// Las reglas que un DM consulta con la partida en marcha y que el SRD 5.2.1
// dejó dentro del glosario: si la lista de paneles vuelve a ser la de 5.1,
// estas desaparecen de la pantalla sin que nada avise.
const IMPRESCINDIBLES = [
  "Ataques de oportunidad",
  "Iniciativa",
  "Concentración",
  "Cobertura",
  "Esconderse",
  "Clase de armadura",
  "Tirada de ataque",
  "Tirada de daño",
  "Tirada de salvación contra muerte",
  "Puntos de golpe",
  "Puntos de golpe temporales",
  "Reacción",
  "Ventaja",
  "Desventaja",
  "Descanso corto",
  "Descanso largo",
  "Acción",
  "Acción adicional",
  "Preparar una acción",
  "Umbral de daño",
  "Curación",
  "Daño",
  "Habilidad",
  "Prueba de característica",
  "Tipos de daño",
  "Dados de puntos de golpe",
];

comprueba("las reglas de combate del glosario están en la pantalla", () => {
  const nombres = new Set(publicadas.map((e) => e.nombre));
  const faltan = IMPRESCINDIBLES.filter((n) => !nombres.has(n));
  if (faltan.length) throw new Error(`faltan ${faltan.length}: ${faltan.join(", ")}`);
});

comprueba("cada categoría del catálogo tiene su panel", () => {
  const publicadasPorCategoria = (cat) =>
    catalogo.filter((r) => String(r.data.category) === cat && slugsPublicados.has(r.slug)).length;
  const sinPanel = [...categorias].filter(
    (cat) => cat !== "Glosario" && publicadasPorCategoria(cat) === 0,
  );
  if (sinPanel.length) throw new Error(`categorías sin panel: ${sinPanel.join(", ")}`);
  // Y no se queda a medias: la categoría entera, no una muestra.
  const aMedias = [...categorias]
    .filter((cat) => cat !== "Glosario")
    .map((cat) => ({
      cat,
      dentro: publicadasPorCategoria(cat),
      total: catalogo.filter((r) => String(r.data.category) === cat).length,
    }))
    .filter((x) => x.dentro !== x.total);
  if (aMedias.length)
    throw new Error(
      `categorías publicadas a medias: ${aMedias.map((x) => `${x.cat} ${x.dentro}/${x.total}`).join(", ")}`,
    );
});

comprueba("ninguna regla sale dos veces", () => {
  const vistos = new Map();
  for (const e of publicadas) vistos.set(e.slug, (vistos.get(e.slug) ?? 0) + 1);
  const repetidas = [...vistos].filter(([, n]) => n > 1).map(([s]) => s);
  if (repetidas.length) throw new Error(`repetidas: ${repetidas.join(", ")}`);
});

comprueba("cada enlace apunta a una regla del catálogo", () => {
  const inventadas = publicadas.filter((e) => !porSlug.has(e.slug)).map((e) => e.slug);
  if (inventadas.length) throw new Error(`no están en data/: ${inventadas.join(", ")}`);
  const cruzan = publicadas.filter((e) => porSlug.has(e.slug) && porSlug.get(e.slug).data.name !== e.nombre);
  if (cruzan.length)
    throw new Error(
      `el nombre no es el de la ficha: ${cruzan.map((e) => `${e.slug} («${e.nombre}»)`).join(", ")}`,
    );
});

comprueba("los paneles tienen id único y ninguno vacío", () => {
  const ids = paneles.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new Error(`ids repetidos: ${ids.join(", ")}`);
  const vacios = paneles.filter((p) => !p.enlaces.length).map((p) => p.id);
  if (vacios.length) throw new Error(`paneles vacíos: ${vacios.join(", ")}`);
});

comprueba("la pantalla declara cuántas reglas publica y de qué edición", () => {
  const publicadasDeclaradas = html.match(/data-publicadas="(\d+)"/);
  const totalDeclarado = html.match(/data-total="(\d+)"/);
  if (!publicadasDeclaradas || !totalDeclarado)
    throw new Error("la pantalla no declara data-publicadas / data-total");
  if (Number(totalDeclarado[1]) !== catalogo.length)
    throw new Error(`declara ${totalDeclarado[1]} reglas en el catálogo y data/ tiene ${catalogo.length}`);
  if (Number(publicadasDeclaradas[1]) !== publicadas.length)
    throw new Error(`declara ${publicadasDeclaradas[1]} publicadas y publica ${publicadas.length}`);
  const fuera = catalogo.length - publicadas.length;
  // La nota del pie tiene que decir el resto que se queda fuera y enlazar al
  // índice del catálogo que publica, no al de 5.1.
  if (!html.includes(`${fuera}`))
    throw new Error(`la pantalla no dice que ${fuera} reglas se quedan en el glosario`);
  if (!/5\.2\.1/.test(html)) throw new Error("la pantalla no nombra el SRD 5.2.1");
  if (!/href="[^"]*\/5\.5\/reglas\/indice\/"/.test(html))
    throw new Error("el pie no enlaza al índice de reglas de 5.2.1");
  if (/href="[^"]*\/5e\/reglas\/indice\/"/.test(html))
    throw new Error("el pie sigue enlazando al índice de 5.1, que no es el catálogo que publica");
});

comprueba("el catálogo no tiene categorías huérfanas", () => {
  // Solo el glosario puede quedarse fuera de la pantalla; cualquier otra
  // categoría sin publicar es una regla que se pierde sin decirlo.
  const fuera = catalogo.filter((r) => !slugsPublicados.has(r.slug));
  const raras = fuera.filter((r) => String(r.data.category) !== "Glosario").map((r) => r.slug);
  if (raras.length) throw new Error(`fuera de la pantalla y no son glosario: ${raras.join(", ")}`);
});

// El módulo que decide los paneles: la pantalla ya no puede llevar su lista.
let modulo = null;
comprobados++;
try {
  if (!fs.existsSync(path.join(RAIZ, "src/lib/pantalla.ts")))
    throw new Error("no existe src/lib/pantalla.ts: la lista sigue dentro de la plantilla");
  modulo = await import("../../src/lib/pantalla.ts");
  if (typeof modulo.panelesDe !== "function") throw new Error("el módulo no exporta panelesDe()");
  if (typeof modulo.fueraDePantalla !== "function")
    throw new Error("el módulo no exporta fueraDePantalla()");
} catch (e) {
  fallos.push(`la lista de paneles vive en src/lib/pantalla.ts: ${String(e.message).split("\n")[0]}`);
}

comprueba("el módulo y la pantalla dicen lo mismo", () => {
  if (!modulo) throw new Error("sin módulo no se puede comparar");
  const dentro = modulo.panelesDe(catalogo).flatMap((p) => p.entradas.map((r) => r.slug));
  const iguales =
    dentro.length === publicadas.length && dentro.every((slug) => slugsPublicados.has(slug));
  if (!iguales)
    throw new Error(`el módulo publica ${dentro.length} reglas y la pantalla ${publicadas.length}`);
  const fuera = modulo.fueraDePantalla(catalogo);
  if (fuera.length !== catalogo.length - dentro.length)
    throw new Error(`fueraDePantalla() devuelve ${fuera.length} y deberían ser ${catalogo.length - dentro.length}`);
});

comprueba("una categoría nueva sin panel rompe el módulo, no se descarta", () => {
  if (!modulo) throw new Error("sin módulo no se puede comprobar");
  const conNueva = [...catalogo, { slug: "hechiceria", data: { name: "Hechicería", category: "Hechicería" } }];
  let lanzo = null;
  try {
    modulo.panelesDe(conNueva);
  } catch (e) {
    lanzo = e;
  }
  if (!lanzo) throw new Error("una categoría desconocida se descarta en silencio");
  if (!/Hechicería/.test(String(lanzo.message))) throw new Error(`el error no nombra la categoría: ${lanzo.message}`);
});

comprueba("un slug mal escrito en el módulo rompe el módulo", () => {
  if (!modulo) throw new Error("sin módulo no se puede comprobar");
  const sinIniciativa = catalogo.filter((r) => r.slug !== "iniciativa");
  let lanzo = null;
  try {
    modulo.panelesDe(sinIniciativa);
  } catch (e) {
    lanzo = e;
  }
  if (!lanzo) throw new Error("un slug que no está en data/ se ignora en silencio");
  if (!/iniciativa/.test(String(lanzo.message))) throw new Error(`el error no nombra el slug: ${lanzo.message}`);
});

console.log(`Pantalla del DM comprobada: ${comprobados} casos.`);
if (fallos.length) {
  console.log("");
  for (const f of fallos) console.log(`  ✗ ${f}`);
  console.log("");
  console.log("La pantalla tiene que publicar las reglas de combate del 5.2.1 y decir cuántas deja fuera.");
  process.exit(1);
}
console.log(
  `La pantalla publica ${publicadas.length} de las ${catalogo.length} reglas del 5.2.1 en ${paneles.length} paneles, y las que deja fuera son del glosario.`,
);
