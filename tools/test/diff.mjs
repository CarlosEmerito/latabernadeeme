/**
 * Comprueba la alineación de bloques que hace el comparador de `/comparar/`.
 *
 * `alinear` empareja los párrafos y los encabezados de dos ediciones del SRD
 * para pintar una tabla de dos columnas. El emparejamiento no es de
 * caracteres: dos bloques son «el mismo con cambios» cuando comparten la
 * mitad del vocabulario, y si no van como bloques propios de cada lado.
 *
 * Lo que se vigila aquí es el contrato que el propio módulo promise y que
 * ninguna otra comprobación miraba: **un encabezado solo se empareja con un
 * encabezado**. Antes, emparejar un título con un párrafo costaba lo mismo
 * que saltarse los dos bloques y el empate se resolvía a favor de la
 * diagonal, así que un «## Acciones adicionales» que solo existe en el
 * 5.2.1 salía enfrente del párrafo de al lado como «reescrito» y se llevaba
 * por delante la nota de que el apartado es nuevo. Pasó en 32 filas de las
 * 1019 páginas del comparador.
 *
 * Los casos se prueban sin navegador: `src/lib/diff.ts` no importa nada, así
 * que Node lo carga tal cual.
 *
 * Uso: node tools/test/diff.mjs
 */
import assert from "node:assert/strict";
import { alinear, bloques, resumen } from "../../src/lib/diff.ts";

const fallos = [];
let comprobados = 0;

/** Un caso: lo que se alinea y lo que tiene que salir. */
function caso(nombre, izq, der, esperado) {
  comprobados++;
  try {
    assert.deepEqual(alinear(izq, der), esperado);
  } catch (e) {
    fallos.push(`${nombre}: ${String(e.message).split("\n").slice(0, 6).join(" | ")}`);
  }
}

/** Un caso que solo mira un valor de la salida. */
function comprueba(nombre, fn) {
  comprobados++;
  try {
    fn();
  } catch (e) {
    fallos.push(`${nombre}: ${String(e.message).split("\n").slice(0, 6).join(" | ")}`);
  }
}

const esTitulo = (s) => /^#{1,6}\s/.test(s);

// 1. Un encabezado nunca se empareja con un párrafo, ni al revés, y el bloque
//    suelto de la izquierda sale antes que el de la derecha.
caso(
  "encabezado contra párrafo",
  "## Rasgos de clase",
  "Texto normal distinto aqui.",
  [
    { izq: "## Rasgos de clase", estado: "solo-izq" },
    { der: "Texto normal distinto aqui.", estado: "solo-der" },
  ],
);

// Y en el otro sentido: un párrafo de la izquierda contra un encabezado de la
// derecha sale igual de suelto, no como reescritura. El bloque suelto de la
// izquierda va antes: la tabla va 5.1 | 5.2.1 y se lee de izquierda a derecha.
caso(
  "párrafo contra encabezado",
  "Texto normal distinto aqui.",
  "## Rasgos de clase",
  [
    { izq: "Texto normal distinto aqui.", estado: "solo-izq" },
    { der: "## Rasgos de clase", estado: "solo-der" },
  ],
);

// Dos encabezados distintos sí se emparejan entre ellos: son del mismo tipo.
caso(
  "encabezado contra encabezado",
  "## Rasgos",
  "## Rasgos",
  [{ izq: "## Rasgos", der: "## Rasgos", estado: "igual" }],
);

// 2. Dos bloques idénticos salen como iguales.
caso(
  "bloques idénticos",
  "El couatl es inmune al escudriñamiento.",
  "El couatl es inmune al escudriñamiento.",
  [
    {
      izq: "El couatl es inmune al escudriñamiento.",
      der: "El couatl es inmune al escudriñamiento.",
      estado: "igual",
    },
  ],
);

// 3. Los mismos números con otra redacción salen como «cambia»: los números
//    son la parte mecánica del rasgo y la redacción cambia entre ediciones.
caso(
  "mismos números con otra redacción",
  "Ataque con arma cuerpo a cuerpo: +7, alcance 1,5 m. Acierto: 11 (1d12 + 5) de daño perforante.",
  "Ataque cuerpo a cuerpo: +7, alcance 1,5 m. Impacto: 11 (1d12 + 5) de daño cortante.",
  [
    {
      izq: "Ataque con arma cuerpo a cuerpo: +7, alcance 1,5 m. Acierto: 11 (1d12 + 5) de daño perforante.",
      der: "Ataque cuerpo a cuerpo: +7, alcance 1,5 m. Impacto: 11 (1d12 + 5) de daño cortante.",
      estado: "cambia",
    },
  ],
);

// 4. Un bloque que solo está en un lado sale como tal, y no desaparece. Con
//    dos textos que comparten vocabulario salen emparejados como «cambia»,
//    así que el caso que de verdad sale suelto es el que no tiene nada en
//    común con el otro lado.
caso("bloque solo en la izquierda", "Uno.\n\nDos.", "Uno.", [
  { izq: "Uno.", der: "Uno.", estado: "igual" },
  { izq: "Dos.", estado: "solo-izq" },
]);
caso("bloque solo en la derecha", "Uno.", "Uno.\n\nDos.", [
  { izq: "Uno.", der: "Uno.", estado: "igual" },
  { der: "Dos.", estado: "solo-der" },
]);

// Y un apartado que solo existe en una edición sale como bloque propio, con
// su nota de «Solo en SRD …», no emparejado con el párrafo de al lado.
caso("apartado que solo existe en una edición", "## Rasgos\n\nUno.", "## Rasgos\n\nUno.\n\n## Reacciones\n\nDos.", [
  { izq: "## Rasgos", der: "## Rasgos", estado: "igual" },
  { izq: "Uno.", der: "Uno.", estado: "igual" },
  { der: "## Reacciones", estado: "solo-der" },
  { der: "Dos.", estado: "solo-der" },
]);

// 5. El orden se conserva: el bloque de la izquierda sigue en su sitio y el
//    de la derecha también, aunque cada uno se empareje con quien le toque.
comprueba("el orden se conserva", () => {
  const izq = "Primero.\n\n## Un apartado\n\nTercero.";
  const der = "Primero.\n\nTercero.";
  const filas = alinear(izq, der);
  const ladoIzq = filas.filter((f) => f.izq).map((f) => f.izq);
  const ladoDer = filas.filter((f) => f.der).map((f) => f.der);
  assert.deepEqual(ladoIzq, ["Primero.", "## Un apartado", "Tercero."]);
  assert.deepEqual(ladoDer, ["Primero.", "Tercero."]);
});

// Y ningún encabezado acaba enfrente de un párrafo en ninguna fila, sea cual
// sea la forma de los dos lados.
comprueba("ningún encabezado frente a un párrafo", () => {
  const izquierda = "## Rasgos\n\nUn parrafo.\n\n## Acciones\n\nOtro parrafo.";
  const derecha = "Un parrafo distinto.\n\n## Rasgos\n\n## Acciones extra\n\nOtro parrafo.";
  const filas = alinear(izquierda, derecha);
  for (const f of filas) {
    if (f.izq && f.der) {
      assert.equal(
        esTitulo(f.izq),
        esTitulo(f.der),
        `«${f.izq.slice(0, 30)}» frente a «${f.der.slice(0, 30)}»`,
      );
    }
  }
});

// 6. Los cuatro contadores del resumen suman las filas que hay.
comprueba("los contadores suman las filas", () => {
  const izq = "## Rasgos\n\nUno.\n\n## Acciones\n\nDos.";
  const der = "## Rasgos\n\nUno cambiado.\n\n## Reacciones\n\nTres.";
  const filas = alinear(izq, der);
  const r = resumen(filas);
  assert.equal(r.iguales + r.cambian + r.soloIzq + r.soloDer, filas.length);
});

// Y también con el caso real que dio el nombre a la tarea: el apartado que
// solo existe en el 5.2.1 sale como bloque propio con su nota, no como
// «reescrito» enfrente del párrafo de al lado.
comprueba("el apartado nuevo sale como bloque propio", () => {
  const filas = alinear(
    "## Acciones\n\n**Mordisco.** Ataque cuerpo a cuerpo: +8.",
    "## Acciones\n\n**Mordisco.** Tirada de ataque: +7.\n\n## Acciones adicionales\n\n**Auxilio divino.** Bendición.",
  );
  const nueva = filas.find((f) => (f.der ?? "").startsWith("## Acciones adicionales"));
  assert.ok(nueva, "el apartado que solo está en 5.2.1 no sale en ninguna fila");
  assert.equal(nueva.estado, "solo-der");
  assert.equal(nueva.izq, undefined);
});

// `bloques` parte el texto por párrafos y descarta los huecos.
comprueba("bloques parte por párrafos", () => {
  assert.deepEqual(bloques("Uno.\n\n\nDos.\n\n"), ["Uno.", "Dos."]);
});

console.log(`Casos comprobados: ${comprobados} · fallos: ${fallos.length}`);
if (fallos.length === 0) {
  console.log("Sin fallos: un encabezado solo se empareja con un encabezado y el orden de los bloques se conserva.");
  process.exit(0);
}

for (const fallo of fallos) console.log(`  ✗ ${fallo}`);
process.exit(1);
