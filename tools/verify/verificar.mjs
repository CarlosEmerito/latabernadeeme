/**
 * Comprobaciones que no necesitan navegador: `npm run verificar`.
 *
 *   1. `tools/verify/validar.py` con un intérprete de Python (el venv de
 *      ingesta si existe, `python3` si no): recuentos, campos obligatorios,
 *      cuerpos vacíos o desbordados y duplicados de `data/`.
 *   2. `tools/test/enlaces.mjs` sobre `dist/`: que cada enlace interno apunte a
 *      una página que existe.
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

console.log("✓ Datos y enlaces correctos.");
