/**
 * Comprueba que «Ajustar una criatura» encuentra la criatura con la grafía que
 * el lector teclee.
 *
 * El catálogo del 5.2.1 publica 105 criaturas de 330 con diacrítico en el
 * nombre (98 de 317 en el 5.1), y la herramienta comparaba con
 * `x.n.toLowerCase() === nombre.toLowerCase()`: minúsculas sí, tildes no, así
 * que «aguila» no encontraba «Águila» y el panel contestaba como si la criatura
 * no existiera. Lo que se vigila aquí es justo eso, sobre el catálogo publicado:
 * cada nombre con diacrítico tiene que aparecer escrito sin él, y el nombre
 * exacto tiene que seguir funcionando.
 *
 * El rojo de este fichero contra el código viejo se comprueba dejando el
 * predicado antiguo en `src/lib/criaturas.ts` y ejecutando el fichero: los
 * nombres con tilde fallan uno a uno.
 *
 * Uso: node tools/test/ajustar.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buscarPorNombre } from "../../src/lib/criaturas.ts";

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

console.log(
  `✓ «Ajustar una criatura» encuentra las ${recuento["5.5"].conDiacritico} criaturas con diacrítico del 5.2.1 ` +
    `(de ${recuento["5.5"].total}) y las ${recuento["5e"].conDiacritico} del 5.1 (de ${recuento["5e"].total}) ` +
    "escribiéndolas sin tilde, y sigue encontrándolas con ella.",
);
