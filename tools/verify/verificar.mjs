/**
 * Comprobaciones que no necesitan navegador: `npm run verificar`.
 *
 *   1. `tools/verify/validar.py` con un intérprete de Python (el venv de
 *      ingesta si existe, `python3` si no): recuentos, campos obligatorios,
 *      cuerpos vacíos o desbordados y duplicados de `data/`.
 *   2. `tools/test/enlaces.mjs` sobre `dist/`: que cada enlace interno —y cada
 *      fragmento— apunte a una página y a un ancla que existen.
 *   3. `tools/test/ids.mjs` sobre `dist/`: que ninguna página repita un `id`,
 *      que es lo que deja las anclas sin destino único.
 *   4. `tools/test/filtro.mjs` sobre `dist/`: que el filtro de texto de los
 *      listados venga plegado del HTML y «dragon» encuentre «Dragón».
 *   5. `tools/test/columnas.mjs` sobre `dist/`: que ningún listado publique una
 *      columna entera de guiones —el SRD 5.1 no declara la característica de
 *      sus clases ni la categoría de sus dotes— y que las celdas sigan
 *      alineadas con sus cabeceras.
 *   6. `tools/test/iconos.mjs` sobre `dist/`: que toda ficha lleve el icono de
 *      su banda, que es lo que delata un tipo o una escuela sin SVG.
 *   7. `tools/test/alias.mjs` sobre `dist/`: que cada ficha publique el alias
 *      inglés que le toca —por nombre o, si el nombre es ambiguo, por ficha— y
 *      que `/datos/<edición>.json` sirva el mismo que pinta la página.
 *   8. `tools/test/iniciativa.mjs`: que el combate guardado en el navegador se
 *      lea como un solo contrato en `/mesa/` y `/mesa/jugadores/` —JSON roto,
 *      entradas a medias y `turno` fuera de la lista incluidos—, para que
 *      recargar no deje las dos pantallas con combates distintos.
 *   9. `tools/test/huerfanos.mjs`: que ningún módulo de `src/lib/` se quede sin
 *      quien lo importe y ningún `export function` / `export const` suyo sin
 *      quien lo llame, que es como se cuela código muerto que duplica otra
 *      implementación y confunde sobre cuál manda.
 *  10. `tools/test/fuentes.mjs`: que README y `/licencias/` acrediten exactamente
 *      las tipografías que el CSS carga —ni una de menos ni una de más— y que
 *      `package.json` no declare ninguna fuente sin importar.
 *
 * Si `dist/` no existe (clon recién hecho), compila el sitio antes del segundo
 * paso. El intérprete se puede forzar con `PYTHON=/ruta/python`.
 */
import path from "node:path";
import { RAIZ, asegurarDist, ejecutar, interpretePython } from "./comun.mjs";

const python = interpretePython();

console.log(`▶ Datos: validar.py (${python})`);
const datos = ejecutar(python, [path.join(RAIZ, "tools/verify/validar.py")]);
if (datos !== 0) {
  console.error("✗ Los datos no pasan la validación.");
  process.exit(datos);
}

asegurarDist();

console.log("▶ Enlaces internos: enlaces.mjs (dist/)");
const enlaces = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/enlaces.mjs")]);
if (enlaces !== 0) {
  console.error("✗ Hay enlaces internos rotos.");
  process.exit(enlaces);
}

console.log("▶ Ids únicos: ids.mjs (dist/)");
const ids = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/ids.mjs")]);
if (ids !== 0) {
  console.error("✗ Hay páginas con id repetidos.");
  process.exit(ids);
}

console.log("▶ Filtro de los listados: filtro.mjs (dist/)");
const filtro = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/filtro.mjs")]);
if (filtro !== 0) {
  console.error("✗ El filtro de texto de los listados no pliega tildes.");
  process.exit(filtro);
}

console.log("▶ Columnas sin datos: columnas.mjs (dist/)");
const columnas = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/columnas.mjs")]);
if (columnas !== 0) {
  console.error("✗ Algún listado publica una columna vacía o desalineada.");
  process.exit(columnas);
}

console.log("▶ Icono de la banda: iconos.mjs (dist/)");
const iconos = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/iconos.mjs")]);
if (iconos !== 0) {
  console.error("✗ Alguna ficha sale sin el icono de su banda.");
  process.exit(iconos);
}

console.log("▶ Alias inglés de las fichas: alias.mjs (dist/)");
const alias = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/alias.mjs")]);
if (alias !== 0) {
  console.error("✗ Alguna ficha publica un alias que no es el suyo.");
  process.exit(alias);
}

console.log("▶ Combate guardado: iniciativa.mjs (src/lib/)");
const iniciativa = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/iniciativa.mjs")]);
if (iniciativa !== 0) {
  console.error("✗ La iniciativa guardada no se lee igual en la mesa y en la vista de jugador.");
  process.exit(iniciativa);
}

console.log("▶ Módulos y exports sin uso: huerfanos.mjs (src/lib/)");
const huerfanos = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/huerfanos.mjs")]);
if (huerfanos !== 0) {
  console.error("✗ Hay módulos o símbolos exportados en src/lib/ que no usa nadie.");
  process.exit(huerfanos);
}

console.log("▶ Tipografías acreditadas: fuentes.mjs (src/ y dist/)");
const fuentes = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/fuentes.mjs")]);
if (fuentes !== 0) {
  console.error("✗ La atribución de tipografías no coincide con lo que carga el sitio.");
  process.exit(fuentes);
}

console.log("✓ Datos, enlaces, ids, filtro, columnas, iconos, alias, iniciativa, código muerto y fuentes correctos.");
