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
 * Y `sinCombatiente`, la cuenta del turno al quitar una fila: es una posición
 * en la lista, no una identidad, así que quitar a alguien de delante del activo
 * desplaza el puntero si nadie lo corrige. Se prueba aquí porque en el humo
 * cada caso costaría un combate montado a mano.
 *
 * Uso: node tools/test/iniciativa.mjs
 */
import assert from "node:assert/strict";
import { CLAVE_INICIATIVA, leerIniciativa, sinCombatiente } from "../../src/lib/iniciativa.ts";

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

// Quitar un combatiente mueve el turno o no, según dónde caiga. El turno es una
// posición en la lista, y como la lista se ordena por iniciativa, quitar una
// fila de delante desplaza a todos los demás: si no se corrigiera, el puntero
// saltaría a otro combatiente sin que el DM haya pasado turno.
// Iniciativa fija por nombre, para que el combate esperado conserve los valores
// del de partida aunque se escriba con la fila de menos.
const INI = { Goblin: 20, Trasgo: 19, Aria: 18, Lobo: 17 };
const combate = (nombres, turno) => ({ turno, lista: nombres.map((nombre) => ({ nombre, valor: INI[nombre] })) });

/** Un caso de quitar: el combate, el puesto que se quita y lo que tiene que quedar. */
function casoQuitar(nombre, estado, indice, esperado) {
  comprobados++;
  try {
    assert.deepEqual(sinCombatiente(estado, indice), esperado);
  } catch (e) {
    fallos.push(`${nombre}: ${String(e.message).split("\n")[0]}`);
  }
}

// El activo es el tercero (Aria): al caer el primero, el turno baja con ella.
casoQuitar(
  "quitar uno de delante del activo",
  combate(["Goblin", "Trasgo", "Aria"], 2),
  0,
  combate(["Trasgo", "Aria"], 1),
);
// Y baja con ella aunque quede gente detrás: sin corregirlo, el turno se
// quedaría en el puesto 2 y saltaría a Lobo sin pasar turno.
casoQuitar(
  "quitar uno de delante del activo con gente detrás",
  combate(["Goblin", "Trasgo", "Aria", "Lobo"], 2),
  0,
  combate(["Trasgo", "Aria", "Lobo"], 1),
);
// Cae el activo: el hueco lo ocupa el siguiente, el turno no se toca.
casoQuitar(
  "quitar el activo",
  combate(["Goblin", "Trasgo", "Aria"], 1),
  1,
  combate(["Goblin", "Aria"], 1),
);
// El activo es el último y se cae: el turno se recorta al primer puesto.
casoQuitar("quitar el activo que era el último", combate(["Goblin", "Aria"], 1), 1, combate(["Goblin"], 0));
// Uno de detrás del activo no cambia quién tiene el turno.
casoQuitar("quitar uno de detrás del activo", combate(["Goblin", "Aria"], 0), 1, combate(["Goblin"], 0));
// El último combatiente: el combate se queda sin nadie y el turno en 0.
casoQuitar("quitar el único combatiente", combate(["Goblin"], 0), 0, { turno: 0, lista: [] });
// Un puesto que no existe no toca nada: ni recorta ni inventa un combate.
casoQuitar("puesto fuera de la lista", combate(["Goblin", "Aria"], 0), 2, null);
casoQuitar("puesto negativo", combate(["Goblin", "Aria"], 0), -1, null);
casoQuitar("puesto que no es entero", combate(["Goblin", "Aria"], 0), 1.5, null);
casoQuitar("puesto que es texto", combate(["Goblin", "Aria"], 0), "1", null);
casoQuitar("quitar de un combate vacío", { turno: 0, lista: [] }, 0, null);

console.log(`Casos comprobados: ${comprobados} · fallos: ${fallos.length}`);
if (fallos.length === 0) {
  console.log(
    "Sin fallos: el combate guardado se valida, se ordena, el turno cae dentro de la lista y quitando a alguien el turno sigue donde estaba.",
  );
  process.exit(0);
}

for (const fallo of fallos) console.log(`  ✗ ${fallo}`);
process.exit(1);
