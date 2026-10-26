/**
 * Comprueba que el constructor de encuentros no se queda mudo cuando el
 * catálogo de criaturas no llega.
 *
 * La página cargaba el catálogo con `const r = await fetch(...); const j = await
 * r.json();` sin mirar `r.ok` ni envolverlo en `try/catch`: un 404 por un
 * despliegue a medias, un corte de red o una caché que devuelve el HTML del
 * error dejaban la promesa rechazada sin dueño, el datalist con cero opciones y
 * el panel contestando «No hay ninguna criatura que se llame «Goblin»» a quien
 * escribía un nombre que sí existe. El texto acusaba al lector de un fallo de
 * red. Aquí se prueba la carga con un `fetch` de mentira —un 404, una petición
 * que no sale, un JSON que no se puede leer y un 200 vacío—, y con el catálogo
 * de verdad publicado en `dist/datos/` para demostrar que la carga buena no
 * cambia.
 *
 * El rojo de este fichero contra el código viejo: la primera llamada (el 404)
 * no vuelve, revienta con el error del parseo, porque el `await` de la carga
 * propaga el rechazo; y con el 200 vacío el aviso sale «» en vez de nombrar el
 * catálogo.
 *
 * Uso: node tools/test/catalogo.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cargaCatalogo } from "../../src/lib/catalogo.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATOS = path.join(RAIZ, "dist/datos");
const PAGINA = path.join(RAIZ, "src/pages/mesa/index.astro");

/** Un `fetch` de mentira que siempre contesta lo mismo. */
const responde = (respuesta) => async () => respuesta;

/** La respuesta de un 404 de GitHub Pages: HTML, no JSON. */
const html = (cuerpo) => ({ ok: false, status: 404, json: async () => JSON.parse(cuerpo) });

let fallos = 0;
function caso(nombre, fn) {
  try {
    fn();
    console.log(`  ✓ ${nombre}`);
  } catch (error) {
    fallos += 1;
    console.log(`  ✗ ${nombre}\n      ${error.message.split("\n")[0]}`);
  }
}

/** Corre la carga y se queda con el resultado. Un rechazo no se escapa: se
 *  devuelve como el aviso que la página nunca llegó a pintar, para que el caso
 *  falle por la aserción y diga qué pasó. */
async function cargar(ed, buscar, base = "") {
  try {
    return await cargaCatalogo(ed, base, buscar);
  } catch (error) {
    return { monstruos: [], aviso: `la carga ha reventado: ${error.message}` };
  }
}

const caidas = [
  ["un 404 con HTML en el cuerpo", await cargar("5.5", responde(html("<!doctype html><h1>404</h1>")))],
  [
    "una petición que no sale (corte de red)",
    await cargar("5.5", async () => {
      throw new TypeError("Failed to fetch");
    }),
  ],
  [
    "un 200 con un JSON que no se puede leer",
    await cargar("5.5", responde({ ok: true, status: 200, json: async () => JSON.parse("<html>") })),
  ],
  [
    "un 500 del servidor",
    await cargar("5.5", responde({ ok: false, status: 500, json: async () => ({}) })),
  ],
  [
    "un 200 sin criaturas",
    await cargar("5.5", responde({ ok: true, status: 200, json: async () => ({ entradas: [{ t: "conjuros" }] }) })),
  ],
];

for (const [nombre, resultado] of caidas) {
  caso(`con ${nombre}: cero criaturas y un aviso que nombra el catálogo`, () => {
    assert.ok(resultado, "la carga no ha devuelto nada");
    assert.deepEqual(resultado.monstruos, [], "el panel se queda con criaturas que no ha podido leer");
    assert.match(resultado.aviso, /catálogo del 5\.2\.1/, `el aviso no nombra el catálogo: «${resultado.aviso}»`);
    assert.doesNotMatch(
      resultado.aviso,
      /ninguna criatura que se llame/i,
      "el aviso culpa al nombre escrito en vez de al catálogo que falta",
    );
  });
}

// El 404 concreto se nombra en el aviso: sin el código, el lector no sabe si
// esperar a que vuelva la red o avisar de que el despliegue está a medias.
caso("el aviso del 404 dice qué ha respondido el servidor", () => {
  const [nombre, resultado] = caidas[0];
  assert.match(resultado.aviso, /404/, `el aviso de ${nombre} no dice el código: «${resultado.aviso}»`);
});

// La edición elegida va en el aviso: «el catálogo del 5.2.1» y «el del 5.1» no
// son el mismo fichero, y el lector tiene que saber cuál ha fallado.
{
  const resultado = await cargar("5e", responde({ ok: false, status: 404, json: async () => ({}) }));
  caso("con el 5.1 caído, el aviso nombra el 5.1", () => {
    assert.match(resultado.aviso, /catálogo del 5\.1/, `el aviso no nombra el 5.1: «${resultado.aviso}»`);
  });
}

// El catálogo de verdad: la carga buena no cambia ni una criatura y no avisa.
{
  const texto = fs.readFileSync(path.join(DATOS, "5.5.json"), "utf8");
  const json = JSON.parse(texto);
  const esperadas = json.entradas.filter((e) => e.t === "monstruos").length;
  const resultado = await cargar("5.5", responde({ ok: true, status: 200, json: async () => json }));
  caso(`con el catálogo publicado (${esperadas} criaturas): todas y sin aviso`, () => {
    assert.equal(resultado.monstruos.length, esperadas, "la carga pierde criaturas del catálogo");
    assert.ok(esperadas > 300, `el catálogo publicado trae ${esperadas} criaturas, se esperaban más de 300`);
    assert.equal(resultado.aviso, "", `la carga buena avisa de algo: «${resultado.aviso}»`);
    assert.ok(
      resultado.monstruos.every((m) => typeof m.n === "string" && m.n && m.d && m.d.vd !== undefined),
      "alguna criatura llega sin nombre o sin VD",
    );
  });
}

// La página tiene que usar la carga compartida y dar salida al fallo: un aviso
// que nadie pinta y un reintento que no existe son la misma mudez de antes.
caso("la página usa la carga compartida y publica aviso y reintento", () => {
  const pagina = fs.readFileSync(PAGINA, "utf8");
  assert.match(pagina, /from "\.\.\/\.\.\/lib\/catalogo"/, "la página no importa la carga compartida");
  assert.match(pagina, /await cargaCatalogo\(/, "la página no llama a la carga compartida");
  assert.ok(!/await fetch\(`\$\{BASE\}\/datos\//.test(pagina), "la página sigue pidiendo el catálogo por su cuenta");
  assert.match(pagina, /id="enc-aviso"/, "el panel no tiene dónde decir que el catálogo no ha llegado");
  assert.match(pagina, /id="enc-reintentar"/, "el panel no ofrece reintentar la carga");
});

// Las tres herramientas de /mesa/ leen el mismo catálogo, así que un catálogo
// que no ha llegado se cuenta igual en las tres. Ajustar y Estimar se quedaron
// fuera del arreglo del panel de Encuentros: uno contestaba que la criatura no
// existe y el otro no hacía nada. Aquí se vigila que el texto sea uno solo
// —el que nombra la edición— y que los tres paneles lo usen.
caso("Ajustar y Estimar dicen que el catálogo no ha llegado, con el mismo texto", () => {
  const pagina = fs.readFileSync(PAGINA, "utf8");
  /* El trozo de fuente de un manejador basta para saber si mira el catálogo
     antes de contestar: el registro y las primeras líneas del cuerpo. */
  const bloque = (marca) => {
    const desde = pagina.indexOf(marca);
    assert.ok(desde > 0, `la página no registra ${marca}`);
    return pagina.slice(desde, desde + 400);
  };
  assert.match(bloque('$("aj-calcular")'), /pintarAvisoDeCatalogo\(salida\)/, "Ajustar no dice que el catálogo no ha llegado");
  const vd = bloque('$("vd-estimar")');
  assert.match(vd, /pintarAvisoDeCatalogo\(salida\)/, "Estimar no dice que el catálogo no ha llegado");
  assert.ok(
    !/!catalogo\.length\) return/.test(vd),
    "Estimar vuelve a callarse cuando el catálogo está vacío: un botón mudo no es un mensaje",
  );
  // Y el texto es uno solo, no tres: el de la carga, que nombra la edición.
  assert.match(pagina, /const avisoDeCatalogo = \(\) =>/, "no hay un único texto de aviso del catálogo");
  assert.equal(
    (pagina.match(/avisoDelCatalogo \|\|/g) ?? []).length,
    1,
    "el aviso del catálogo se construye en más de un sitio: son copias que se desincronizan",
  );
});

console.log(
  fallos
    ? `\n${fallos} fallo(s): el constructor de encuentros vuelve a quedarse mudo sin catálogo.`
    : "\nSin fallos: sin catálogo el panel lo dice, nombra la edición y no culpa al nombre escrito.",
);
process.exit(fallos ? 1 : 0);
