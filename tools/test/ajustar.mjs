/**
 * Comprueba que «Ajustar una criatura» encuentra la criatura con la grafía que
 * el lector teclee y que acepta cualquier VD que el catálogo publique.
 *
 * El catálogo del 5.2.1 publica 105 criaturas de 330 con diacrítico en el
 * nombre (98 de 317 en el 5.1), y la herramienta comparaba con
 * `x.n.toLowerCase() === nombre.toLowerCase()`: minúsculas sí, tildes no, así
 * que «aguila» no encontraba «Águila» y el panel contestaba como si la criatura
 * no existiera. Lo que se vigila aquí es justo eso, sobre el catálogo publicado:
 * cada nombre con diacrítico tiene que aparecer escrito sin él, y el nombre
 * exacto tiene que seguir funcionando.
 *
 * La segunda mitad es el VD. 78 de las 330 criaturas del 5.2.1 lo tienen
 * fraccionario (`1/8`, `1/4`, `1/2`) y el campo era `type=number step=1`, así
 * que «1/2» lo dejaba vacío y «0.5» no casaba con la clave «1/2» del perfil: el
 * panel decía que el catálogo no tenía ninguna criatura con ese VD. Aquí se
 * recorre el catálogo entero escribiendo el VD de cada criatura como fracción y
 * como decimal, y se comprueba que el `<output>` de «VD actual» tenga quien lo
 * escriba.
 *
 * El rojo de este fichero contra el código viejo se comprueba dejando el
 * predicado antiguo en `src/lib/criaturas.ts` y ejecutando el fichero: los
 * nombres con tilde fallan uno a uno. El del VD, dejando `perfil.get(objetivo)`
 * en el bloque de «Ajustar» y volviendo a `type=number` en el campo.
 *
 * Uso: node tools/test/ajustar.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buscarPorNombre } from "../../src/lib/criaturas.ts";
import { claveVd, valorVd } from "../../src/lib/vd.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATOS = path.join(RAIZ, "dist/datos");
const MESA = path.join(RAIZ, "src/pages/mesa/index.astro");

/** El nombre sin diacríticos: lo que teclea quien busca «aguila». */
const sinTildes = (texto) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const catalogos = ["5e", "5.5"].map((ed) => {
  const json = JSON.parse(fs.readFileSync(path.join(DATOS, `${ed}.json`), "utf8"));
  const monstruos = json.entradas.filter((x) => x.t === "monstruos");
  assert.ok(monstruos.length > 300, `${ed}: el catálogo publica ${monstruos.length} criaturas, se esperaban más de 300`);
  return { ed, monstruos };
});

// 1. Los casos que la ficha nombra uno a uno, en el catálogo por defecto (5.2.1).
const porDefecto = catalogos.find((c) => c.ed === "5.5").monstruos;
const nombradas = [
  ["aguila", "Águila"],
  ["aparicion", "Aparición"],
  ["arpia", "Arpía"],
  ["buho", "Búho"],
  ["arbol despertado", "Árbol despertado"],
  ["arana de fase", "Araña de fase"],
];
for (const [tecleado, esperado] of nombradas) {
  const m = buscarPorNombre(porDefecto, tecleado);
  assert.ok(m, `«${tecleado}» no encuentra ninguna criatura`);
  assert.equal(m.n, esperado, `«${tecleado}» encontró «${m.n}» en vez de «${esperado}»`);
}

// 2. El catálogo entero: ningún nombre con diacrítico se queda sin encontrar al
//    escribirlo sin tilde. Es la mitad que fallaba, contada criatura a criatura.
const recuento = {};
for (const { ed, monstruos } of catalogos) {
  const conDiacritico = monstruos.filter((m) => sinTildes(m.n) !== m.n);
  const perdidas = [];
  for (const m of conDiacritico) {
    const encontrada = buscarPorNombre(monstruos, sinTildes(m.n));
    if (encontrada !== m) perdidas.push(`${m.n} → ${encontrada ? encontrada.n : "nada"}`);
  }
  assert.deepEqual(perdidas.slice(0, 8), [], `${ed}: ${perdidas.length} de ${conDiacritico.length} criaturas con diacrítico no se encuentran sin tilde`);
  recuento[ed] = { conDiacritico: conDiacritico.length, total: monstruos.length };

  // Y con la tilde, y en mayúsculas, siguen encontrándose: lo arreglado no puede
  // romper lo que ya funcionaba.
  assert.equal(buscarPorNombre(monstruos, "Águila")?.n, "Águila", `${ed}: «Águila» con tilde no se encuentra`);
  assert.equal(buscarPorNombre(monstruos, "ÁGUILA")?.n, "Águila", `${ed}: «ÁGUILA» en mayúsculas no se encuentra`);
  assert.equal(buscarPorNombre(monstruos, "  aguila  ")?.n, "Águila", `${ed}: los espacios de alrededor rompen la búsqueda`);
}

// 3. Lo que no existe contesta que no existe, y el texto vacío no busca nada.
for (const { ed, monstruos } of catalogos) {
  assert.equal(buscarPorNombre(monstruos, "criatura inventada"), null, `${ed}: «criatura inventada» devolvió una criatura`);
  assert.equal(buscarPorNombre(monstruos, "   "), null, `${ed}: el texto vacío devolvió una criatura`);
}

// 4. La herramienta pasa por la búsqueda plegada: una comparación a pelo con
//    `toLowerCase()` en el bloque de «Ajustar» volvería a dejar fuera las 105.
const fuente = fs.readFileSync(MESA, "utf8");
const bloque = fuente.slice(fuente.indexOf('$("aj-calcular")'));
assert.ok(fuente.includes("buscarPorNombre"), "src/pages/mesa/index.astro no usa buscarPorNombre");
assert.ok(
  !bloque.includes("toLowerCase() === nombre.toLowerCase()"),
  "el bloque de «Ajustar» compara los nombres con toLowerCase(), que no pliega tildes",
);

// 5. El VD se casa por valor y no por texto. El catálogo escribe la fracción
//    tal cual (`1/8`, `1/4`, `1/2`) y `Number("1/2")` es NaN, así que buscar la
//    clave por el texto dejaba fuera las 78 criaturas fraccionarias del 5.2.1:
//    el panel contestaba que el catálogo no tenía ninguna con ese VD. Cada
//    criatura tiene que ajustarse escribiendo su VD como lo publica el catálogo
//    y, si es fraccionario, también en decimal.
const DECIMALES = { "1/8": "0.125", "1/4": "0.25", "1/2": "0.5" };
const fraccionarios = {};
for (const { ed, monstruos } of catalogos) {
  const claves = new Set(monstruos.map((m) => String(m.d.vd)));
  const perdidas = new Set();
  let fraccion = 0;
  for (const m of monstruos) {
    const vd = String(m.d.vd);
    if (claveVd(claves, vd) !== vd) perdidas.add(`${m.n} (${vd})`);
    if (DECIMALES[vd]) {
      fraccion++;
      if (claveVd(claves, DECIMALES[vd]) !== vd) perdidas.add(`${m.n} (${DECIMALES[vd]} → ${vd})`);
    }
  }
  assert.equal(
    perdidas.size,
    0,
    `${ed}: ${perdidas.size} criaturas no se ajustan escribiendo su VD: ${[...perdidas].slice(0, 8).join(", ")}`,
  );
  fraccionarios[ed] = { fraccion, total: monstruos.length };
}

// El valor de un VD escrito a mano: la fracción del catálogo y el decimal con
// punto o con coma son el mismo número, y lo que no es un VD no vale nada (el
// campo era `type=number`, que deja «1/2» en vacío pero admite «1e3» y «-3»).
for (const [texto, valor] of [
  ["1/8", 0.125],
  ["1/4", 0.25],
  ["1/2", 0.5],
  ["0.125", 0.125],
  ["0,5", 0.5],
  [" 1 / 2 ", 0.5],
  ["5", 5],
  [" 17 ", 17],
]) {
  assert.equal(valorVd(texto), valor, `«${texto}» vale ${valorVd(texto)} y debería valer ${valor}`);
}
for (const texto of ["", "   ", "abc", "1/0", "0/0", "-3", "1e3", "5,", "/2", "Infinity", "NaN"]) {
  assert.equal(valorVd(texto), null, `«${texto}» no es un VD y vale ${valorVd(texto)}`);
}

// 6. Lo que no es un VD no encuentra nada, y un VD que la tabla se salta sigue
//    diciendo que no está: el 5.2.1 salta del 17 al 19, y es lo que el panel
//    tiene que contestar en vez de escalar a la criatura más cercana.
for (const { ed, monstruos } of catalogos) {
  const claves = new Set(monstruos.map((m) => String(m.d.vd)));
  assert.equal(claveVd(claves, "18"), null, `${ed}: el VD 18 no existe en el catálogo y devolvió una clave`);
  for (const texto of ["", "   ", "abc", "1/0", "-3", "1e3", "5,", "/2"]) {
    assert.equal(claveVd(claves, texto), null, `${ed}: «${texto}» no es un VD y devolvió ${claveVd(claves, texto)}`);
  }
  // Y el decimal con coma, que es como se teclea en un teclado de aquí.
  assert.equal(claveVd(claves, "0,5"), "1/2", `${ed}: «0,5» no encuentra el VD 1/2`);
  assert.equal(claveVd(claves, " 1 / 2 "), "1/2", `${ed}: «1 / 2» con espacios no encuentra el VD 1/2`);
}

// 7. La página: el campo tiene que poder escribir una fracción —`type=number`
//    la descarta y deja el campo vacío— y el `<output>` de «VD actual» tiene
//    que tener quien lo escriba, o se queda en «—» para siempre.
const campoObjetivo = /<input[^>]*id="aj-objetivo"[^>]*>/.exec(fuente)?.[0] ?? "";
assert.ok(campoObjetivo, "src/pages/mesa/index.astro no publica el campo #aj-objetivo");
assert.ok(
  !/type="number"/.test(campoObjetivo),
  "el campo de VD objetivo vuelve a ser type=number, que descarta «1/2» y «1/4» y deja el campo vacío",
);
assert.ok(fuente.includes("claveVd"), "el bloque de «Ajustar» no casa el VD por valor (claveVd)");
assert.ok(fuente.toLowerCase().includes("pintarvdactual"), "nadie escribe el «VD actual» del panel de Ajustar");
assert.ok(
  (fuente.match(/aj-vd/g) ?? []).length >= 2,
  "el «VD actual» solo aparece en la plantilla: ningún script lo escribe",
);

console.log(
  `✓ «Ajustar una criatura» encuentra las ${recuento["5.5"].conDiacritico} criaturas con diacrítico del 5.2.1 ` +
    `(de ${recuento["5.5"].total}) y las ${recuento["5e"].conDiacritico} del 5.1 (de ${recuento["5e"].total}) ` +
    "escribiéndolas sin tilde, y sigue encontrándolas con ella. Ajusta las " +
    `${fraccionarios["5.5"].fraccion} fraccionarias del 5.2.1 y las ${fraccionarios["5e"].fraccion} del 5.1 ` +
    "escribiendo su VD como fracción o como decimal, y enseña el «VD actual» de la criatura elegida.",
);
