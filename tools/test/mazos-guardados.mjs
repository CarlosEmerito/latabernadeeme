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
 * Y se prueba el tope del almacén: doce mazos, porque cada uno lleva sus 100
 * cartas de Scryfall enteras. El mazo número trece entraba y el más antiguo
 * desaparecía por un `slice` en la página, sin aviso y sin que nada dijera que
 * había un tope: aquí se exige que la lista no crezca, que el que sale vuelva
 * dicho y que el aviso nombre a los que se van y el número de mazos que caben.
 *
 * Uso: node tools/test/mazos-guardados.mjs
 */
import assert from "node:assert/strict";
import {
  CLAVE_MAZOS,
  TOPE_MAZOS,
  guardarEnLista,
  leerMazosGuardados,
  mensajeDeDescartes,
} from "../../src/lib/commander/guardados.ts";

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

// ── Guardar: el tope dice lo que hace ───────────────────────────────────────
// El almacén tiene un tope porque cada mazo lleva las 100 cartas de Scryfall
// enteras. Lo que no puede pasar es que el mazo número trece entre y el más
// antiguo desaparezca sin que el lector lo sepa: la lista de guardados se
// quedaba en 12 por un `slice` en la página y nadie se enteraba de cuál se
// había ido.

/** Una lista como la deja el almacén: el más reciente primero. */
const guardados = (cuantos) =>
  Array.from({ length: cuantos }, (_, i) => mazo({ id: `viejo-${i}`, nombre: `Mazo ${i}` }));

/** Un caso de guardado: la lista de partida, el mazo que entra y lo que sale. */
function casoGuardar(nombre, lista, nuevo, esperado, tope) {
  comprobados++;
  const copia = lista.map((m) => ({ ...m }));
  try {
    const { mazos, descartados } = guardarEnLista(lista, nuevo, tope);
    assert.deepEqual(
      { mazos: mazos.map((m) => m.id), descartados: descartados.map((m) => m.id) },
      esperado,
    );
    assert.deepEqual(lista.map((m) => m.id), copia.map((m) => m.id), "la lista de partida se modificó");
  } catch (e) {
    fallos.push(`${nombre}: ${String(e.message).split("\n")[0]}`);
  }
}

// El tope es el número que la página le enseña al lector, así que cambiarlo es
// una decisión, no un detalle: con 13 mazos en el almacén, el que sobra se va.
if (TOPE_MAZOS !== 12) fallos.push(`el tope cambió a ${TOPE_MAZOS}: la página anuncia 12 mazos`);

casoGuardar("el primero no descarta a nadie", [], mazo({ id: "nuevo" }), {
  mazos: ["nuevo"],
  descartados: [],
});
casoGuardar("el nuevo entra por delante", guardados(3), mazo({ id: "nuevo" }), {
  mazos: ["nuevo", "viejo-0", "viejo-1", "viejo-2"],
  descartados: [],
});
casoGuardar(
  "con la lista llena, el más antiguo sale y se anuncia",
  guardados(TOPE_MAZOS),
  mazo({ id: "nuevo" }),
  {
    mazos: ["nuevo", ...guardados(TOPE_MAZOS - 1).map((m) => m.id)],
    descartados: [`viejo-${TOPE_MAZOS - 1}`],
  },
);
casoGuardar(
  "volver a guardar el mismo mazo no descarta a nadie",
  guardados(TOPE_MAZOS),
  mazo({ id: "viejo-5", nombre: "Mazo 5" }),
  {
    mazos: ["viejo-5", ...guardados(TOPE_MAZOS).filter((m) => m.id !== "viejo-5").map((m) => m.id)],
    descartados: [],
  },
);
casoGuardar(
  "el tope se aplica por parámetro",
  guardados(2),
  mazo({ id: "nuevo" }),
  { mazos: ["nuevo", "viejo-0"], descartados: ["viejo-1"] },
  2,
);
casoGuardar(
  "lo que sobra de golpe se anuncia entero",
  guardados(4),
  mazo({ id: "nuevo" }),
  { mazos: ["nuevo", "viejo-0", "viejo-1"], descartados: ["viejo-2", "viejo-3"] },
  3,
);

// Y el aviso lo dice con el nombre del mazo y con el tope: es el único momento
// en que el lector se entera de que el suyo ya no está.

/** Un caso del texto del aviso: lo que se le enseña al lector, letra a letra. */
function casoTexto(nombre, descartados, esperado, tope) {
  comprobados++;
  let obtenido;
  try {
    obtenido = mensajeDeDescartes(descartados, tope);
  } catch (e) {
    fallos.push(`${nombre}: ${String(e.message).split("\n")[0]}`);
    return;
  }
  if (obtenido !== esperado) fallos.push(`${nombre}: «${obtenido}» en vez de «${esperado}»`);
}

casoTexto("sin descartes no hay aviso", [], "");
casoTexto("un mazo que sale se nombra", [mazo({ nombre: "Mazo 11" })], "Solo se guardan los 12 mazos más recientes: ha salido «Mazo 11».");
casoTexto(
  "dos mazos que salen se nombran los dos",
  [mazo({ nombre: "Mazo 10" }), mazo({ nombre: "Mazo 11" })],
  "Solo se guardan los 12 mazos más recientes: han salido «Mazo 10» y «Mazo 11».",
);
casoTexto(
  "tres mazos que salen se enumeran con comas y «y»",
  [mazo({ nombre: "A" }), mazo({ nombre: "B" }), mazo({ nombre: "C" })],
  "Solo se guardan los 12 mazos más recientes: han salido «A», «B» y «C».",
);
casoTexto(
  "el aviso dice el tope de verdad, no un número escrito",
  [mazo({ nombre: "Mazo 2" })],
  "Solo se guardan los 3 mazos más recientes: ha salido «Mazo 2».",
  3,
);

console.log(`Casos comprobados: ${comprobados} · fallos: ${fallos.length}`);
if (fallos.length === 0) {
  console.log(
    "Sin fallos: lo guardado con la forma vieja se descarta, lo bueno se queda, nada de lo descartado tumba la lectura y al llegar al tope se dice qué mazo sale.",
  );
  process.exit(0);
}

for (const fallo of fallos) console.log(`  ✗ ${fallo}`);
process.exit(1);
