/**
 * Comprueba que el humo mide el tema oscuro, no solo el claro.
 *
 * La página `/accesibilidad/` promete que «todos los textos superan el 4,5:1 en
 * ambos temas», y el tema oscuro es una paleta propia (`src/styles/tema.css`,
 * la que aplica `matchMedia("(prefers-color-scheme: dark)")` en `Base.astro`),
 * no una inversión automática del claro. El humo pasa axe a dieciséis páginas y
 * ninguna fija `prefers-color-scheme`: mide siempre lo que decida el perfil de
 * Chrome, que arranca en claro. Una regresión de contraste en la paleta oscura
 * —un `--muted`, un filete, un color de chip— se publica sin que nada la vea.
 *
 * Lo que se vigila aquí es la estrategia de la comprobación, sin abrir Chrome,
 * como ya hacen `humo-espera.mjs`, `humo-limpieza.mjs` y `humo-filtro.mjs`:
 *
 *   1. El humo emula el tema oscuro (`Emulation.setEmulatedMedia` con
 *      `prefers-color-scheme`).
 *   2. Y lo emula **en oscuro**, no en el mismo valor claro de siempre.
 *   3. Antes de medir, confirma con `matchMedia` que el navegador está en
 *      oscuro: una emulación puesta después de navegar deja la página en claro y
 *      el `axeEn` mediría el tema claro llamándolo oscuro.
 *   4. Y después pasa axe a esa página, con una etiqueta que dice que es el tema
 *      oscuro, para que el resultado del humo no engañe a quien lo lee.
 *
 * La puerta se autocomprueba: tapar la emulación, dejarla en claro, quitar la
 * confirmación o quitar el `axeEn` tienen que ponerla en rojo por su motivo.
 *
 * Uso: node tools/test/humo-axe.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RAIZ } from "../verify/comun.mjs";

const FICHERO = path.join(RAIZ, "tools/test/humo.mjs");

/** La emulación del medio: sin esto el humo mide el tema del perfil. */
const EMULACION = /setEmulatedMedia/;

/** La preferencia que se emula. */
const PREFERENCIA = /prefers-color-scheme/;

/** El valor que tiene que llevar: oscuro, no el claro de siempre. */
const OSCURO = /["']dark["']/;

/** La confirmación de que el navegador se ha quedado en oscuro antes de medir. */
const CONFIRMACION = /matchMedia\(\s*[`"']\(prefers-color-scheme: dark\)[`"']\s*\)/;

/** Una llamada a axe después de la emulación, con el tema en la etiqueta. */
const AXE_OSCURO = /axeEn\([^)]*oscur/i;

const fallos = [];
let comprobados = 0;

/** Tapa un trozo con espacios, para que deje de contar sin mover las posiciones. */
const tapar = (trozo) => trozo.replace(/[^"\n]/g, " ");

/** Las cuatro cosas que la comprobación del humo tiene que tener. */
export function auditar(fuente) {
  const texto = String(fuente ?? "");
  const problemas = [];

  const emulacion = EMULACION.exec(texto);
  if (!emulacion) {
    problemas.push("sin-emulacion: el humo no emula ningún medio, así que mide el tema del perfil");
    return problemas;
  }
  const despues = texto.slice(emulacion.index);
  if (!PREFERENCIA.test(despues) || !OSCURO.test(despues)) {
    problemas.push("sin-oscuro: la emulación no fija prefers-color-scheme en oscuro");
  }
  if (!CONFIRMACION.test(despues)) {
    problemas.push(
      "sin-confirmacion: nada comprueba que el navegador se ha quedado en oscuro antes de medir; una emulación puesta después de navegar mide el tema claro y lo llama oscuro",
    );
  }
  if (!AXE_OSCURO.test(despues)) {
    problemas.push("sin-axe: no hay ninguna pasada de axe después de la emulación que diga que es el tema oscuro");
  }
  return problemas;
}

const fuente = fs.existsSync(FICHERO) ? fs.readFileSync(FICHERO, "utf8") : null;

/** Corre la puerta: el fuente real y las cuatro autocomprobaciones. */
function main() {
  const fallos = [];
  let comprobados = 0;

  comprobados++;
  if (fuente === null) {
    fallos.push(`no está el humo en ${FICHERO}`);
  } else {
    const problemas = auditar(fuente);
    for (const problema of problemas) fallos.push(`el humo: ${problema}`);
  }

  /* Las autocomprobaciones: cada pieza que falte tiene que verse por su nombre,
     no como «algo va mal». Se hacen sobre el fuente de verdad, tapando la
     pieza. */
  if (fuente !== null) {
    const casos = [
      ["sin-emulacion", () => fuente.replace(EMULACION, (m) => tapar(m))],
      ["sin-oscuro", () => fuente.replace(OSCURO, (m) => tapar(m))],
      [
        "sin-confirmacion",
        () => {
          const m = CONFIRMACION.exec(fuente);
          return m ? fuente.replace(CONFIRMACION, tapar(m[0])) : fuente;
        },
      ],
      [
        "sin-axe",
        () => {
          const emulacion = EMULACION.exec(fuente);
          if (!emulacion) return fuente;
          const cola = fuente.slice(emulacion.index);
          const axe = AXE_OSCURO.exec(cola);
          if (!axe) return fuente;
          const inicio = emulacion.index + axe.index;
          return fuente.slice(0, inicio) + tapar(axe[0]) + fuente.slice(inicio + axe[0].length);
        },
      ],
    ];

    for (const [esperado, mutar] of casos) {
      comprobados++;
      const mutado = mutar();
      if (mutado === fuente) {
        // Sin la pieza no hay nada que tapar: la puerta ya lo dirá en el caso real.
        continue;
      }
      const problemas = auditar(mutado);
      if (!problemas.some((p) => p.startsWith(`${esperado}:`))) {
        fallos.push(`tapar «${esperado}» no pone la puerta en rojo por ese motivo: ${JSON.stringify(problemas)}`);
      }
    }
  }

  console.log(`Tema oscuro del humo: ${comprobados} casos comprobados.`);
  if (fallos.length > 0) {
    console.log("✗ El humo no mide el tema oscuro que la página de accesibilidad promete:");
    for (const fallo of fallos) console.log(`   - ${fallo}`);
    process.exit(1);
  }
  console.log(
    "El humo emula el tema oscuro, confirma que el navegador se ha quedado en él y pasa axe antes de creerse el contraste de la paleta oscura.",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
