/**
 * Que la elección guardada de la pantalla del DM no esconda paneles en silencio.
 *
 * `/mesa/pantalla/` guardaba en `localStorage` la lista de paneles marcados y, al
 * cargar, hacía `c.checked = guardado.includes(id)`. Lo que la lista no nombraba
 * se quedaba oculto, y como la página reescribía la lista en el primer cambio del
 * lector, la pérdida quedaba consolidada: un panel añadido después de guardarse
 * desaparecía para siempre, sin aviso, mientras el pie seguía prometiendo las
 * reglas que ese navegador ya no veía.
 *
 * Aquí se prueba la lectura sin navegador, que es lo que ahora vive en
 * `src/lib/pantalla.ts`. Son tres cosas distintas y se separan a propósito:
 *
 *   - lo que **no** se puede leer (nada guardado, JSON roto, un valor que no es
 *     una lista, un `localStorage` que lanza): todo a la vista, que es el estado
 *     por defecto de la pantalla y el único que no esconde reglas;
 *   - lo que se guarda hoy (`{ v: 2, paneles: { id: visible } }`, con **todos**
 *     los ids conocidos): exactamente lo que el lector dejó marcado;
 *   - lo que ya estaba guardado con el formato viejo (un array con solo los
 *     marcados): el array no distingue «el lector lo apagó» de «el panel no
 *     existía», así que no se oculta nada que no conste apagado — y la primera
 *     pasada lo reescribe en el formato nuevo, que sí lo distingue.
 *
 * También se fija que la página no vuelva a interpretar la lista: si alguien
 * mete otra vez el `JSON.parse` o el `includes` en el `<script>`, esto sale en
 * rojo aunque el caso concreto que motivó la tarea siguiera funcionando.
 *
 * Uso: node tools/test/pantalla-guardado.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAVE_PANELES,
  guardarEnAlmacen,
  leerDeAlmacen,
  leerPaneles,
} from "../../src/lib/pantalla.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PAGINA = path.join(RAIZ, "src/pages/mesa/pantalla/index.astro");

/** Los nueve paneles de la pantalla, en el orden en que los pinta la página. */
const IDS = [
  "combate",
  "condiciones",
  "pruebas",
  "dano",
  "descanso",
  "exploracion",
  "peligros",
  "social",
  "basico",
];

let comprobados = 0;
const fallos = [];

function caso(nombre, fn) {
  comprobados++;
  try {
    fn();
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallos.push(`${nombre}: ${String(e.message).split("\n").slice(0, 8).join(" ")}`);
    console.log(`✗ ${nombre}`);
  }
}

/** Un `localStorage` de mentira: lo justo para leer y escribir. */
function almacenFalso(inicial = {}) {
  const datos = { ...inicial };
  return {
    datos,
    getItem: (clave) => (clave in datos ? datos[clave] : null),
    setItem: (clave, valor) => {
      datos[clave] = valor;
    },
  };
}

/** Un almacén con algo ya guardado bajo la clave de la pantalla. */
const conGuardado = (valor) =>
  almacenFalso(valor === null ? {} : { [CLAVE_PANELES]: valor });

/* ── Lo que no se puede leer: todos a la vista ───────────────────────────── */

caso("sin elección guardada se ven los nueve paneles", () => {
  assert.deepEqual(leerDeAlmacen(conGuardado(null), IDS).visibles, IDS);
});

caso("un almacén que lanza al leer deja todos los paneles a la vista", () => {
  const roto = {
    getItem() {
      throw new Error("SecurityError: the operation is insecure");
    },
    setItem() {
      throw new Error("SecurityError: the operation is insecure");
    },
  };
  assert.deepEqual(leerDeAlmacen(roto, IDS).visibles, IDS);
  // Y escribir en un almacén que lanza no puede llevarse la página por delante.
  guardarEnAlmacen(roto, IDS, []);
});

caso("sin almacén (navegador sin localStorage) se ven los nueve paneles", () => {
  assert.deepEqual(leerDeAlmacen(null, IDS).visibles, IDS);
});

caso("un JSON roto deja todos los paneles a la vista", () => {
  assert.deepEqual(leerDeAlmacen(conGuardado('["combate",'), IDS).visibles, IDS);
  assert.deepEqual(leerDeAlmacen(conGuardado("no es json"), IDS).visibles, IDS);
});

caso("un valor que no es una lista deja todos los paneles a la vista", () => {
  for (const crudo of ['"42"', "42", "true", '{"lo":1}', '{"v":99,"paneles":{"combate":false}}']) {
    assert.deepEqual(leerDeAlmacen(conGuardado(crudo), IDS).visibles, IDS, `con ${crudo}`);
    assert.deepEqual(leerDeAlmacen(conGuardado(crudo), IDS).ocultos, [], `con ${crudo}`);
  }
});

caso("una lista vacía sigue significando «nada», no «todo por defecto»", () => {
  assert.deepEqual(leerDeAlmacen(conGuardado("[]"), IDS).visibles, []);
  assert.deepEqual(leerDeAlmacen(conGuardado("[]"), IDS).ocultos, IDS);
});

/* ── El formato que se guarda hoy: exactamente lo que se marcó ───────────── */

caso("se ve exactamente lo guardado, ni uno más ni uno menos", () => {
  const almacen = almacenFalso();
  guardarEnAlmacen(almacen, IDS, ["combate", "dano", "social"]);
  assert.deepEqual(leerDeAlmacen(almacen, IDS).visibles, ["combate", "dano", "social"]);
  assert.deepEqual(leerDeAlmacen(almacen, IDS).ocultos, [
    "condiciones",
    "pruebas",
    "descanso",
    "exploracion",
    "peligros",
    "basico",
  ]);
});

caso("guardar conserva todos los ids conocidos, marcados o no", () => {
  const almacen = almacenFalso();
  guardarEnAlmacen(almacen, IDS, ["condiciones", "pruebas"]);
  const guardado = JSON.parse(almacen.datos[CLAVE_PANELES]);
  assert.equal(guardado.v, 2, "el formato guardado lleva versión");
  assert.deepEqual(Object.keys(guardado.paneles).sort(), [...IDS].sort());
  assert.equal(guardado.paneles.condiciones, true);
  assert.equal(guardado.paneles.combate, false, "un panel apagado tiene que constar como apagado");
});

caso("un panel que la lista guardada no menciona se ve (panel nuevo)", () => {
  // Lo que deja una pantalla configurada antes de que existiera «social».
  const crudo = JSON.stringify({
    v: 2,
    paneles: { combate: true, condiciones: false, pruebas: true },
  });
  const vista = leerDeAlmacen(conGuardado(crudo), ["combate", "condiciones", "pruebas", "social"]);
  assert.deepEqual(vista.visibles, ["combate", "pruebas", "social"]);
});

caso("un id guardado que ya no existe se ignora y no reaparece", () => {
  const crudo = JSON.stringify({
    v: 2,
    paneles: { combate: false, fantasma: true, condiciones: true },
  });
  const vista = leerDeAlmacen(conGuardado(crudo), ["combate", "condiciones", "pruebas"]);
  assert.deepEqual(vista.visibles, ["condiciones", "pruebas"]);
  assert.deepEqual(vista.ocultos, ["combate"]);
});

caso("apagar todos los paneles se respeta en el formato nuevo", () => {
  const todosApagados = Object.fromEntries(IDS.map((id) => [id, false]));
  const crudo = JSON.stringify({ v: 2, paneles: todosApagados });
  assert.deepEqual(leerDeAlmacen(conGuardado(crudo), IDS).visibles, []);
});

/* ── Lo que ya estaba guardado con el formato viejo ──────────────────────── */

caso("una lista del formato viejo sin el panel «combate» no lo oculta", () => {
  // El repro de la tarea: pantalla configurada antes de que existiera «combate».
  const crudo = JSON.stringify([
    "basico",
    "condiciones",
    "dano",
    "descanso",
    "exploracion",
    "peligros",
    "pruebas",
    "social",
  ]);
  const vista = leerDeAlmacen(conGuardado(crudo), IDS);
  assert.ok(vista.visibles.includes("combate"), "el panel que la lista no nombra no puede quedar oculto");
  assert.deepEqual(vista.visibles, IDS);
});

caso("una lista del formato viejo completa se lee tal cual", () => {
  const crudo = JSON.stringify(IDS);
  assert.deepEqual(leerDeAlmacen(conGuardado(crudo), IDS).visibles, IDS);
  const tres = JSON.stringify(["combate", "dano", "basico"]);
  const vista = leerDeAlmacen(conGuardado(tres), ["combate", "dano", "basico"]);
  assert.deepEqual(vista.visibles, ["combate", "dano", "basico"]);
});

caso("la primera pasada reescribe el formato viejo con todos los ids", () => {
  const almacen = conGuardado(JSON.stringify(["combate", "dano"]));
  const { visibles } = leerDeAlmacen(almacen, IDS);
  guardarEnAlmacen(almacen, IDS, visibles);
  const guardado = JSON.parse(almacen.datos[CLAVE_PANELES]);
  assert.equal(guardado.v, 2);
  assert.deepEqual(Object.keys(guardado.paneles).sort(), [...IDS].sort());
  // Y la segunda lectura ya devuelve exactamente lo mismo: la migración no mueve nada.
  assert.deepEqual(leerDeAlmacen(almacen, IDS).visibles, visibles);
});

/* ── Invariantes ────────────────────────────────────────────────────────── */

caso("visibles y ocultos no se solapan y cubren los ids conocidos", () => {
  const casos = [
    null,
    "[]",
    JSON.stringify(["combate", "basico"]),
    JSON.stringify({ v: 2, paneles: { combate: false } }),
    "{",
  ];
  for (const crudo of casos) {
    const { visibles, ocultos } = leerPaneles(crudo, IDS);
    assert.deepEqual(
      [...visibles, ...ocultos].sort(),
      [...IDS].sort(),
      `con ${String(crudo)}`,
    );
    assert.equal(new Set(visibles).size, visibles.length, "sin repetidos");
    assert.deepEqual(visibles.filter((id) => ocultos.includes(id)), []);
  }
});

caso("leer no lanza con ninguna forma, aunque no sea la nuestra", () => {
  for (const crudo of ["null", '{"v":2}', '{"v":2,"paneles":null}', "[1,2,3]", '"x"', "{}", "0"]) {
    assert.doesNotThrow(() => leerPaneles(crudo, IDS), `con ${crudo}`);
  }
});

/* ── La página no vuelve a interpretar la lista ─────────────────────────── */

caso("el script de la página lee y escribe con el módulo, no con JSON.parse", () => {
  const fuente = fs.readFileSync(PAGINA, "utf8");
  const script = fuente.slice(fuente.indexOf("<script>"), fuente.indexOf("</script>"));
  assert.ok(script.includes("leerDeAlmacen"), "la página tiene que leer con leerDeAlmacen");
  assert.ok(script.includes("guardarEnAlmacen"), "la página tiene que escribir con guardarEnAlmacen");
  assert.ok(!script.includes("JSON.parse"), "la página no puede interpretar la lista guardada");
  assert.ok(!/localStorage\.(getItem|setItem)/.test(script), "el almacén lo toca el módulo");
  assert.ok(!/guardado\.includes/.test(script), "la página no decide qué se ve: eso es del módulo");
});

caso("el lector de la pantalla se puede probar sin navegador", () => {
  // Si alguien mete en el módulo un import relativo sin extensión, Node no puede
  // cargarlo y este mismo fichero deja de arrancar: el aviso lo dice aquí.
  assert.equal(typeof leerPaneles, "function");
  assert.equal(typeof leerDeAlmacen, "function");
  assert.equal(typeof guardarEnAlmacen, "function");
  assert.equal(CLAVE_PANELES, "taberna:pantalla", "cambiar la clave deja huérfanas las pantallas guardadas");
});

console.log(`\n${comprobados - fallos.length}/${comprobados} comprobaciones correctas`);
if (fallos.length) {
  console.error("\nFallos:");
  for (const f of fallos) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(
  "La pantalla del DM lee su elección guardada sin esconder paneles: el formato nuevo dice qué se apagó, un panel nuevo se ve y lo que no se puede leer deja todo a la vista.",
);
