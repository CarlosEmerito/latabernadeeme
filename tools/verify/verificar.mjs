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
 *   5. `tools/test/huerfanos.mjs`: que ningún módulo de `src/lib/` se quede sin
 *      quien lo importe y ningún `export function` / `export const` suyo sin
 *      quien lo llame, que es como se cuela código muerto que duplica otra
 *      implementación y confunde sobre cuál manda.
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

console.log("▶ Módulos y exports sin uso: huerfanos.mjs (src/lib/)");
const huerfanos = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/huerfanos.mjs")]);
if (huerfanos !== 0) {
  console.error("✗ Hay módulos o símbolos exportados en src/lib/ que no usa nadie.");
  process.exit(huerfanos);
}

console.log("✓ Datos, enlaces, ids, filtro y código muerto correctos.");
