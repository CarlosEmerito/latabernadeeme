/**
 * Comprueba la lectura del combate de iniciativa que comparten `/mesa/` y
 * `/mesa/jugadores/`.
 *
 * `leerIniciativa` es el único sitio que decide qué es un combate guardado
 * válido, y lo que llega no es de fiar: `localStorage` lo escribe el navegador
 * de cualquiera, una versión anterior pudo dejarlo a medias y un JSON con un
 * hueco, un `valor` que no es número o un `turno` fuera de la lista dejaba la
 * página con el combate a medio pintar. Se prueba aquí, sin navegador, porque
 * reproducir esos estados en el humo costaría una pasada entera por caso.
 *
 * También se fija el valor de la clave: cambiarlo deja huérfanos los combates
 * que la gente ya tiene guardados en su navegador, y eso no se nota en ningún
 * otro sitio.
 *
 * Uso: node tools/test/iniciativa.mjs
 */
import assert from "node:assert/strict";
import { CLAVE_INICIATIVA, leerIniciativa } from "../../src/lib/iniciativa.ts";

const fallos = [];
let comprobados = 0;

/** Un caso de lectura: el JSON guardado tal cual y lo que tiene que salir. */
function caso(nombre, crudo, esperado) {
  comprobados++;
  try {
    assert.deepEqual(leerIniciativa(crudo), esperado);
  } catch (e) {
    fallos.push(`${nombre}: ${String(e.message).split("\n")[0]}`);
  }
}

if (CLAVE_INICIATIVA !== "taberna:iniciativa")
  fallos.push(`la clave cambió a «${CLAVE_INICIATIVA}»: los combates ya guardados se quedan huérfanos`);

// Nada guardado: la pantalla tiene que decir «Sin combate», no romperse.
caso("sin clave", null, null);
caso("clave vacía", "", null);
caso("JSON roto", '{"turno":0,"lista":[', null);
caso("JSON que no es un objeto", "[]", null);
caso("JSON que es un número", "0", null);
caso("lista que no es lista", '{"turno":0,"lista":"A, B"}', null);
caso("lista vacía", '{"turno":0,"lista":[]}', null);

// Una entrada mala no se lleva por delante las buenas: se descarta y se sigue.
caso(
  "entradas inválidas mezcladas",
  JSON.stringify({
    turno: 1,
    lista: [
      { nombre: "Aria", valor: 12 },
      { nombre: "Goblin", valor: 18 },
      { nombre: 7, valor: 3 },
      { nombre: "Sin número", valor: "20" },
      { nombre: "Infinito", valor: null },
      null,
      ["Aria", 12],
    ],
  }),
  {
    turno: 1,
    lista: [
      { nombre: "Goblin", valor: 18 },
      { nombre: "Aria", valor: 12 },
    ],
  },
);

caso(
  "lista sin ninguna entrada válida",
  JSON.stringify({ turno: 0, lista: [null, { nombre: 3, valor: 4 }] }),
  null,
);

// El orden guardado es el de la mesa, aunque se escriba de cualquier manera.
caso(
  "lista desordenada",
  JSON.stringify({
    turno: 0,
    lista: [
      { nombre: "Aria", valor: 12 },
      { nombre: "Goblin", valor: 18 },
      { nombre: "Trasgo", valor: 15 },
    ],
  }),
  {
    turno: 0,
    lista: [
      { nombre: "Goblin", valor: 18 },
      { nombre: "Trasgo", valor: 15 },
      { nombre: "Aria", valor: 12 },
    ],
  },
);

// El turno es la posición en esa lista ordenada: fuera de ella, el primero.
caso(
  "turno pasado de largo",
  JSON.stringify({ turno: 9, lista: [{ nombre: "Aria", valor: 12 }, { nombre: "Goblin", valor: 18 }] }),
  { turno: 0, lista: [{ nombre: "Goblin", valor: 18 }, { nombre: "Aria", valor: 12 }] },
);
caso(
  "turno negativo",
  JSON.stringify({ turno: -1, lista: [{ nombre: "Aria", valor: 12 }, { nombre: "Goblin", valor: 18 }] }),
  { turno: 0, lista: [{ nombre: "Goblin", valor: 18 }, { nombre: "Aria", valor: 12 }] },
);
caso(
  "turno que no es un entero",
  JSON.stringify({ turno: "1", lista: [{ nombre: "Aria", valor: 12 }, { nombre: "Goblin", valor: 18 }] }),
  { turno: 0, lista: [{ nombre: "Goblin", valor: 18 }, { nombre: "Aria", valor: 12 }] },
);
caso(
  "sin turno",
  JSON.stringify({ lista: [{ nombre: "Aria", valor: 12 }] }),
  { turno: 0, lista: [{ nombre: "Aria", valor: 12 }] },
);
caso(
  "turno válido que no es el primero",
  JSON.stringify({ turno: 2, lista: [{ nombre: "Aria", valor: 12 }, { nombre: "Goblin", valor: 18 }, { nombre: "Trasgo", valor: 15 }] }),
  {
    turno: 2,
    lista: [
      { nombre: "Goblin", valor: 18 },
      { nombre: "Trasgo", valor: 15 },
      { nombre: "Aria", valor: 12 },
    ],
  },
);

// Empate: el orden de entrada se respeta (la del DM decide quién va antes).
caso(
  "empate a iniciativa",
  JSON.stringify({ turno: 0, lista: [{ nombre: "Aria", valor: 12 }, { nombre: "Goblin", valor: 12 }] }),
  { turno: 0, lista: [{ nombre: "Aria", valor: 12 }, { nombre: "Goblin", valor: 12 }] },
);

console.log(`Casos comprobados: ${comprobados} · fallos: ${fallos.length}`);
if (fallos.length === 0) {
  console.log("Sin fallos: el combate guardado se valida, se ordena y el turno cae dentro de la lista.");
  process.exit(0);
}

for (const fallo of fallos) console.log(`  ✗ ${fallo}`);
process.exit(1);
