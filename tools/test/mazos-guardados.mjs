/**
 * Comprueba la lectura de los mazos guardados de Commander.
 *
 * `leerMazosGuardados` es el único sitio que decide qué es un mazo guardado
 * válido, y lo que llega no es de fiar: `localStorage` lo escribe el navegador
 * de cualquiera, una versión anterior del formato pudo dejarlo a medias y una
 * lista tocada a mano tumbaba el arranque de `/mtgcommander/` —la sección
 * «Mazos guardados» se quedaba visible y vacía, `refrescarIA()` ya no corría y
 * ningún mazo nuevo se guardaba, porque la entrada mala seguía en el almacén—.
 * Se prueba aquí, sin navegador, porque en el humo cada forma mala costaría una
 * pasada entera con su Chrome.
 *
 * También se fija el valor de la clave: cambiarla deja huérfanos los mazos que
 * la gente ya tiene en su navegador, y eso no se nota en ningún otro sitio.
 *
 * Uso: node tools/test/mazos-guardados.mjs
 */
import assert from "node:assert/strict";
import { CLAVE_MAZOS, leerMazosGuardados } from "../../src/lib/commander/guardados.ts";

const fallos = [];
let comprobados = 0;

/** Un mazo con la forma buena, para torcer un campo en cada caso. */
const mazo = (extra = {}) => ({
  id: "mazo-1",
  nombre: "Mazo bueno",
  creado: "2025-01-01T00:00:00.000Z",
  fuente: "export",
  comandantes: [],
  cartas: [],
  noEncontradas: [],
  ...extra,
});

/** Una carta con la forma que pinta la rejilla. */
const carta = (extra = {}) => ({
  cantidad: 1,
  tablero: "main",
  linea: { cantidad: 1, nombre: "Sol Ring", tablero: "main" },
  carta: { id: "abc", name: "Sol Ring", type_line: "Artifact" },
  ...extra,
});

/** Un caso de lectura: el JSON guardado tal cual y lo que tiene que salir. */
function caso(nombre, crudo, esperado) {
  comprobados++;
  try {
    assert.deepEqual(leerMazosGuardados(crudo), esperado);
  } catch (e) {
    fallos.push(`${nombre}: ${String(e.message).split("\n")[0]}`);
  }
}

if (CLAVE_MAZOS !== "taberna:commander:mazos")
  fallos.push(`la clave cambió a «${CLAVE_MAZOS}»: los mazos ya guardados se quedan huérfanos`);

// Nada guardado: la sección se queda oculta, no rota.
caso("sin clave", null, []);
caso("clave vacía", "", []);
caso("JSON roto", '[{"id":"mazo-1",', []);
caso("JSON que no es una lista", '{"id":"mazo-1"}', []);
caso("JSON que es un número", "0", []);
caso("lista vacía", "[]", []);

// La forma vieja del formato: se descarta la entrada, no la página.
caso("una entrada nula", "[null]", []);
caso("un objeto suelto", "[{}]", []);
caso("un mazo sin comandantes", JSON.stringify([mazo({ comandantes: undefined })]), []);
caso("un mazo sin cartas", JSON.stringify([mazo({ cartas: undefined })]), []);
caso("comandantes que no son lista", JSON.stringify([mazo({ comandantes: "Sol Ring" })]), []);
caso("cartas que no son lista", JSON.stringify([mazo({ cartas: 100 })]), []);
caso("sin id", JSON.stringify([mazo({ id: "" })]), []);
caso("sin nombre", JSON.stringify([mazo({ nombre: "   " })]), []);
caso("sin fecha legible", JSON.stringify([mazo({ creado: "ayer" })]), []);
caso("una lista en vez de un mazo", '[["mazo-1","Mazo bueno"]]', []);

// Y lo bueno sobrevive, en su orden, con la forma normalizada.
caso("un mazo bueno", JSON.stringify([mazo()]), [mazo()]);
caso(
  "los malos de en medio no se llevan a los buenos",
  JSON.stringify([mazo({ id: "a" }), null, mazo({ id: "b", cartas: undefined }), mazo({ id: "c" })]),
  [mazo({ id: "a" }), mazo({ id: "c" })],
);
caso(
  "una carta a medias se cae sola y el mazo se queda",
  JSON.stringify([mazo({ comandantes: [null, carta({ tablero: "commander" })], cartas: [carta(), { cantidad: 1 }] })]),
  [mazo({ comandantes: [carta({ tablero: "commander" })], cartas: [carta()] })],
);
caso(
  "una fuente que no es la del formato se lee como importado",
  JSON.stringify([mazo({ fuente: "otra-cosa" })]),
  [mazo()],
);
caso("una fuente estática se conserva", JSON.stringify([mazo({ fuente: "estatico" })]), [mazo({ fuente: "estatico" })]);
caso(
  "las líneas no encontradas se quedan y lo que no es texto se va",
  JSON.stringify([mazo({ noEncontradas: ["1 Carta Fantasma", 7, null] })]),
  [mazo({ noEncontradas: ["1 Carta Fantasma"] })],
);
caso("un mazo sin la lista de no encontradas", JSON.stringify([{ ...mazo(), noEncontradas: undefined }]), [mazo()]);

console.log(`Casos comprobados: ${comprobados} · fallos: ${fallos.length}`);
if (fallos.length === 0) {
  console.log(
    "Sin fallos: lo guardado con la forma vieja se descarta, lo bueno se queda y nada de lo descartado tumba la lectura.",
  );
  process.exit(0);
}

for (const fallo of fallos) console.log(`  ✗ ${fallo}`);
process.exit(1);
