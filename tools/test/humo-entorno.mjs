/**
 * Levanta el entorno que necesitan las pruebas de humo y lo apaga al terminar.
 *
 * `humo.mjs` no abre nada por su cuenta: navega por un servidor estático que
 * sirve `dist/` en el 8099 bajo la base del sitio y se conecta a un Chrome con
 * CDP en el 9223. Este script arranca los dos, espera a que respondan, pasa
 * `humo.mjs` y deja el sistema como estaba.
 *
 * Uso: npm run verificar:humo
 *   PUERTO_SITIO=8099   puerto del servidor estático
 *   PUERTO_CDP=9223     puerto de depuración de Chrome
 *   CHROME=/ruta/bin    navegador a usar (por defecto, el primero del PATH)
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RAIZ, asegurarDist, ejecutar } from "../verify/comun.mjs";

const PUERTO_SITIO = Number(process.env.PUERTO_SITIO ?? 8099);
const PUERTO_CDP = Number(process.env.PUERTO_CDP ?? 9223);
const BASE = process.env.BASE ?? "/latabernadeeme";
const URL_SITIO = `http://localhost:${PUERTO_SITIO}${BASE}/`;

const hijos = [];
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "humo-chrome-"));

/** Arranca un proceso en su propio grupo, para poder apagarlo entero. */
function arrancar(orden, args) {
  const hijo = spawn(orden, args, { cwd: RAIZ, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const salida = [];
  const guardar = (trozo) => {
    salida.push(...String(trozo).split("\n").filter(Boolean).slice(-5));
    if (salida.length > 40) salida.splice(0, salida.length - 40);
  };
  hijo.stdout.on("data", guardar);
  hijo.stderr.on("data", guardar);
  hijos.push({ hijo, salida });
  return { hijo, salida };
}

function enElPath(nombre) {
  for (const directorio of (process.env.PATH ?? "").split(path.delimiter)) {
    const ruta = path.join(directorio, nombre);
    try {
      fs.accessSync(ruta, fs.constants.X_OK);
      return ruta;
    } catch {
      // sigue buscando
    }
  }
  return null;
}

const NAVEGADORES = ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser", "brave-browser"];

/** Espera a que una URL responda 2xx; si no, falla con la salida del proceso. */
async function esperar(nombre, url, { hijo, salida = [], limiteMs = 30_000 } = {}) {
  const limite = Date.now() + limiteMs;
  while (Date.now() < limite) {
    if (hijo && hijo.exitCode !== null) break;
    try {
      const respuesta = await fetch(url);
      if (respuesta.ok) return;
    } catch {
      // todavía no escucha
    }
    await new Promise((hecho) => setTimeout(hecho, 300));
  }
  const detalle = salida.length ? `\n${salida.join("\n")}` : "";
  throw new Error(`No responde ${nombre} (${url}) en ${limiteMs / 1000} s.${detalle}`);
}

async function apagar() {
  for (const { hijo } of hijos) {
    if (hijo.exitCode !== null || hijo.pid === undefined) continue;
    try {
      process.kill(-hijo.pid, "SIGTERM");
    } catch {
      try {
        hijo.kill("SIGTERM");
      } catch {
        // ya estaba muerto
      }
    }
  }
  await new Promise((hecho) => setTimeout(hecho, 1500));
  for (const { hijo } of hijos) {
    if (hijo.exitCode !== null || hijo.pid === undefined) continue;
    try {
      process.kill(-hijo.pid, "SIGKILL");
    } catch {
      // ya estaba muerto
    }
  }
  fs.rmSync(perfil, { recursive: true, force: true });
}

let codigo = 1;
try {
  asegurarDist();

  const navegador = process.env.CHROME ?? NAVEGADORES.map(enElPath).find(Boolean);
  if (!navegador) {
    throw new Error(
      `No encuentro Chrome ni Chromium en el PATH (probado: ${NAVEGADORES.join(", ")}).\n` +
        "Indica el binario con CHROME=/ruta/al/navegador.",
    );
  }

  const astro = path.join(RAIZ, "node_modules", ".bin", "astro");
  if (!fs.existsSync(astro)) throw new Error("Falta node_modules/.bin/astro: ejecuta npm install.");

  const sitio = arrancar(astro, ["preview", "--port", String(PUERTO_SITIO)]);
  const chrome = arrancar(navegador, [
    "--headless=new",
    `--remote-debugging-port=${PUERTO_CDP}`,
    `--user-data-dir=${perfil}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "about:blank",
  ]);

  await esperar("el sitio", URL_SITIO, sitio);
  await esperar("Chrome", `http://localhost:${PUERTO_CDP}/json/version`, chrome);

  console.log(`Sitio en ${URL_SITIO}, Chrome en :${PUERTO_CDP}. Paso las pruebas de humo.\n`);
  codigo = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/humo.mjs"), URL_SITIO]);
} catch (error) {
  console.error(`✗ ${error.message}`);
} finally {
  await apagar();
}

process.exit(codigo);
