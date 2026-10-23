/**
 * Comprueba que la puerta de huérfanos mira también los módulos de `tools/`:
 * un `.py` de `tools/ingest/` o de `tools/verify/` que no importa nadie y que
 * tampoco se lanza como script es código muerto igual que un módulo suelto de
 * `src/lib/`.
 *
 * El caso real: `tools/ingest/srd/reader.py` se quedó 117 líneas en el
 * repositorio, con docstrings que lo presentaban como el lector de referencia
 * del flujo del PDF, mientras nadie lo importaba y ni siquiera podía abrir el
 * JSONL actual (`Block(**d)` con una clave `block` que el dataclass no declara).
 * Quien tocara la ingesta lo habría encontrado primero.
 *
 * El árbol de ejemplo se monta en un directorio temporal y se le pasa a la
 * puerta con `HUERFANOS_TOOLS`: así este paso corre en un segundo y no escribe
 * nada dentro del repositorio, donde el revisor lo leería como trabajo sin
 * commitear. Las reglas que se comprueban son las de verdad —script exento por
 * su `if __name__ == "__main__"`, módulo importado, huérfano en cada una de las
 * dos carpetas y también un `.mjs`—, no una copia de la regla escrita a mano.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUERTA = path.join(RAIZ, "tools/test/huerfanos.mjs");

let fallos = 0;

function comprobar(nombre, ok, detalle = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : `\n      ${detalle}`}`);
  if (!ok) fallos += 1;
}

/** Monta el árbol de ejemplo en un directorio temporal y devuelve su ruta. */
function arbol(ficheros) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "huerfanos-tools-"));
  for (const [relativa, texto] of Object.entries(ficheros)) {
    const destino = path.join(dir, relativa);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, texto);
  }
  return dir;
}

/** Corre la puerta contra ese árbol, apuntándola con la variable de entorno. */
function correr(dir) {
  return spawnSync(process.execPath, [PUERTA], {
    cwd: RAIZ,
    encoding: "utf8",
    env: { ...process.env, HUERFANOS_TOOLS: dir },
  });
}

const SANO = {
  // Módulo de verdad, con su importador: no es huérfano.
  "ingest/lector_usado.py": '"""Un módulo que alguien importa."""\n',
  "ingest/lo_usa.py":
    'from lector_usado import Bloque\n\n\ndef main() -> Bloque:\n' +
    '    return Bloque()\n\n\nif __name__ == "__main__":\n    main()\n',
  // Se lanza a mano desde la terminal: su `__main__` es su importador.
  "ingest/se_ejecuta.py":
    '"""Script de la ingesta que se lanza con python tools/ingest/se_ejecuta.py."""\n\n\n' +
    'def main() -> None:\n    print("extrae")\n\n\nif __name__ == "__main__":\n    main()\n',
};

let sano = "";
try {
  const dir = arbol(SANO);
  try {
    const salida = correr(dir);
    sano = `${salida.stdout ?? ""}${salida.stderr ?? ""}`;
    comprobar(
      "un árbol de tools/ sin módulos sueltos sale en verde",
      salida.status === 0,
      `salió con ${salida.status}:\n${sano.trim().split("\n").slice(-6).join("\n      ")}`,
    );
    comprobar(
      "el módulo importado y el script no se denuncian",
      !sano.includes("lector_usado.py") && !sano.includes("se_ejecuta.py"),
      sano.trim().split("\n").slice(-6).join("\n      "),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Ahora un módulo de sobra en cada carpeta: la puerta tiene que suspender y
  // nombrarlos uno a uno, sin llevarse por delante a los que sí se usan.
  const sucio = arbol({
    ...SANO,
    "ingest/suelto.py": '"""Nadie me importa y no sé lanzarme: soy código muerto."""\n',
    "verify/barre_datos.py": '"""Mira los datos y no lo llama nadie."""\n',
    // Un `.mjs` que sí lo importa su vecino no es huérfano; el vecino, que es la
    // hoja del árbol, sí: nadie lo llama y `package.json` del repositorio no lo
    // nombra, así que no hay nada que lo lance.
    "verify/ayudante.mjs": "export const RAIZ = 1;\n",
    "verify/lo_usa.mjs": 'import { RAIZ } from "./ayudante.mjs";\n\nconsole.log(RAIZ);\n',
    "verify/huerfano.mjs": "export const NADIE = 2;\n",
  });
  try {
    const salida = correr(sucio);
    const texto = `${salida.stdout ?? ""}${salida.stderr ?? ""}`;
    comprobar(
      "un módulo suelto en tools/ingest/ suspende el paso",
      salida.status !== 0 && texto.includes("suelto.py"),
      `salió con ${salida.status}:\n${texto.trim().split("\n").slice(-8).join("\n      ")}`,
    );
    comprobar(
      "un módulo suelto en tools/verify/ suspende el paso",
      salida.status !== 0 && texto.includes("barre_datos.py"),
      texto.trim().split("\n").slice(-8).join("\n      "),
    );
    comprobar(
      "un .mjs suelto de tools/verify/ también cuenta",
      salida.status !== 0 && texto.includes("huerfano.mjs"),
      texto.trim().split("\n").slice(-8).join("\n      "),
    );
    comprobar(
      "el motivo que se publica es el que toca (nadie lo importa)",
      texto.includes("ningún import lo referencia"),
      texto.trim().split("\n").slice(-8).join("\n      "),
    );
    comprobar(
      "los módulos que sí se usan siguen sin salir",
      !texto.includes("lector_usado.py") && !texto.includes("se_ejecuta.py") && !texto.includes("ayudante.mjs"),
      texto.trim().split("\n").slice(-8).join("\n      "),
    );
  } finally {
    fs.rmSync(sucio, { recursive: true, force: true });
  }
} catch (error) {
  comprobar("la puerta de huérfanos de tools/ se ha podido ejecutar", false, String(error));
}

if (fallos > 0) {
  console.error(
    `✗ La puerta de huérfanos no vigila los módulos de tools/: ${fallos} comprobaciones en rojo.`,
  );
  process.exit(1);
}

console.log("✓ La puerta de huérfanos vigila tools/ingest/ y tools/verify/ como src/lib/.");
