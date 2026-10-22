/**
 * Comprueba que el repositorio no versiona bytecode de Python y que `__pycache__/`
 * sigue ignorado.
 *
 * Un `.pyc` lleva dentro el mtime y el tamaño del `.py` del que se compila, y
 * Python lo invalida cuando no casan. El repositorio versionaba trece `.pyc` de
 * `tools/ingest/` y `tools/ingest/srd/`, así que en cuanto una puerta importaba
 * el parser (`verificar` llama a `validar.py`, que importa `monsters.py`) Python
 * recompilaba y el árbol quedaba sucio: `git status --porcelain` mostraba dos
 * bytecode modificados después de una pasada en verde, y en un clon recién
 * hecho pasaba a la primera. Se venía rodeando el problema subiendo el `.pyc`
 * recompilado en cada rama que tocaba un parser, que funciona hasta el clon
 * siguiente.
 *
 * La comprobación mira el índice de git —lo que se versiona de verdad— y no el
 * disco, donde los `.pyc` tienen que poder existir sin estorbar; y comprueba
 * además que el `.gitignore` los sigue tapando, porque quitar la regla devuelve
 * el ruido por el otro lado. Sin repositorio git (un tarball del código) no hay
 * nada que vigilar: se avisa y se sale en verde.
 *
 * Uso: node tools/test/bytecode.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { RAIZ } from "../verify/comun.mjs";

/** Ejecuta git en la raíz del proyecto y devuelve `{ estado, salida }`. */
function git(...args) {
  const r = spawnSync("git", args, { cwd: RAIZ, encoding: "utf8" });
  if (r.error) return { estado: null, salida: "" };
  return { estado: r.status ?? 1, salida: r.stdout ?? "" };
}

const versionados = git("ls-files", "-z");
if (versionados.estado !== 0) {
  console.log("Sin repositorio git: no hay índice que vigilar, se omite la comprobación.");
  process.exit(0);
}

const ficheros = versionados.salida.split("\0").filter(Boolean);
const bytecode = ficheros.filter((ruta) => {
  const normal = ruta.split(path.sep).join("/");
  return normal.split("/").includes("__pycache__") || /\.py[co]$/.test(normal);
});

/** Una ruta de sonda que no existe: solo interesa saber si el `.gitignore` la tapa. */
const sonda = "tools/ingest/srd/__pycache__/sonda.cpython-314.pyc";
const ignorado = git("check-ignore", "-q", sonda).estado === 0;

let fallos = false;

if (bytecode.length > 0) {
  fallos = true;
  console.log("");
  for (const ruta of bytecode) console.log(`  ✗ ${ruta} está versionado en git.`);
  console.log(
    "  Sácalo del índice con `git rm --cached` (el fichero se queda en el disco): un" +
      " .pyc guarda el mtime del fuente, así que solo vale en la máquina donde se" +
      " compiló y deja el árbol sucio en cualquier clon en cuanto se importa el módulo.",
  );
}

if (!ignorado) {
  fallos = true;
  console.log("");
  console.log(`  ✗ .gitignore no ignora «${sonda}».`);
  console.log(
    "  Añade una regla `__pycache__/`: sin ella el bytecode regenerado sale como" +
      " suciedad en `git status` y tapa el trabajo de verdad.",
  );
}

if (fallos) process.exit(1);

console.log(
  `Sin bytecode versionado: ninguno de los ${ficheros.length} ficheros del índice es` +
    " .pyc y __pycache__/ sigue ignorado.",
);
process.exit(0);
