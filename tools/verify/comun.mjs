/**
 * Utilidades compartidas por las comprobaciones del proyecto.
 *
 * Las usan `verificar.mjs` (datos y enlaces) y `tools/test/humo-entorno.mjs`
 * (pruebas de humo), para que las dos puertas resuelvan igual el intérprete de
 * Python y el sitio compilado.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** ¿Hay un sitio compilado que se pueda comprobar? */
export function hayDist() {
  return fs.existsSync(path.join(RAIZ, "dist", "index.html"));
}

/**
 * Ejecuta un comando en la raíz del proyecto y devuelve su código de salida.
 * Lanza si el binario no existe; un código distinto de cero lo decide quien llama.
 */
export function ejecutar(orden, args, opciones = {}) {
  const r = spawnSync(orden, args, { cwd: RAIZ, stdio: "inherit", ...opciones });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

/** Compila el sitio si no hay `dist/`, para que las puertas corran en un clon limpio. */
export function asegurarDist() {
  if (hayDist()) return;
  console.log("dist/ no existe: compilo el sitio antes de continuar.");
  if (ejecutar("npm", ["run", "build"]) !== 0) {
    throw new Error("La compilación ha fallado; sin dist/ no se puede comprobar el sitio.");
  }
}

const CANDIDATOS = [".venv-ingest/bin/python", "python3"];

/**
 * Primer intérprete de Python que puede importar PyYAML, o `null` si no hay
 * ninguno. `PYTHON` manda sobre la lista; el venv de ingesta, sobre el sistema.
 */
export function buscarInterprete(entorno = process.env) {
  const candidatos = entorno.PYTHON ? [entorno.PYTHON, ...CANDIDATOS] : CANDIDATOS;
  for (const candidato of candidatos) {
    const orden = candidato.includes("/") ? path.join(RAIZ, candidato) : candidato;
    if (orden.includes("/") && !fs.existsSync(orden)) continue;
    const r = spawnSync(orden, ["-c", "import yaml"], { stdio: "ignore" });
    if (r.status === 0) return orden;
  }
  return null;
}

/** Como `buscarInterprete`, pero explica qué falta y termina con error. */
export function interpretePython() {
  const interprete = buscarInterprete();
  if (interprete) return interprete;
  console.error(
    "No encuentro un Python con PyYAML. Crea el venv de ingesta\n" +
      "  python3 -m venv .venv-ingest && .venv-ingest/bin/pip install -r tools/requirements.txt\n" +
      "o instala PyYAML en el Python del sistema, o indica el intérprete con PYTHON=/ruta/python.",
  );
  process.exit(1);
}
