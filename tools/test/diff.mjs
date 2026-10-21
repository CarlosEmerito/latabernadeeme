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

// 7. Dos apartados con nombres distintos NO se emparejan, aunque compartan el
//    nivel. El 5.2.1 renombró medio SRD, así que «Senda Primordial (nivel 3)»
//    del 5.1 y «Subclase de bárbaro (nivel 3)» del 5.2.1 son apartados
//    distintos: emparejarlos hacía que el nombre del 5.2.1 no llegara al HTML y
//    la página escondía media redacción.
comprueba("apartados con nombres distintos no se emparejan", () => {
  const filas = alinear("### Senda Primordial (nivel 3)", "### Subclase de bárbaro (nivel 3)");
  assert.equal(filas.length, 2, `filas: ${JSON.stringify(filas)}`);
  assert.equal(filas[0].estado, "solo-izq");
  assert.equal(filas[1].estado, "solo-der");
  assert.equal(filas[0].der, undefined);
  assert.equal(filas[1].izq, undefined);
});

// Y dos apartados con el mismo nombre pero niveles que no se tocan tampoco:
// «Furia (nivel 1)» y «Furia (nivel 11)» son rasgos distintos.
comprueba("apartados con el mismo nombre y niveles distintos no se emparejan", () => {
  const filas = alinear("### Furia (nivel 1)", "### Furia (nivel 11)");
  assert.equal(filas.length, 2, `filas: ${JSON.stringify(filas)}`);
  assert.equal(filas[0].estado, "solo-izq");
  assert.equal(filas[1].estado, "solo-der");
});

// Pero el mismo nombre con un nivel compartido sí es el mismo apartado, aunque
// uno declare varios niveles: «Mejora de Característica (niveles 4, 8, 12, 16 y
// 19)» del 5.1 y «Mejora de característica (nivel 4)» del 5.2.1.
comprueba("apartados con el mismo nombre y un nivel en común sí se emparejan", () => {
  const filas = alinear(
    "### Mejora de Característica (niveles 4, 8, 12, 16 y 19)",
    "### Mejora de característica (nivel 4)",
  );
  assert.equal(filas.length, 1, `filas: ${JSON.stringify(filas)}`);
  assert.equal(filas[0].estado, "cambia");
});

// Un apartado que solo cambió de redacción también se empareja: el 5.1
// llamaba «Crítico Brutal» a lo que el 5.2.1 llama «Golpe brutal», y el
// apartado es el mismo aunque el nombre no coincida palabra por palabra.
comprueba("un apartado renombrado se empareja con el suyo", () => {
  const filas = alinear("### Crítico Brutal (niveles 9, 13 y 17)", "### Golpe brutal (nivel 9)");
  assert.equal(filas.length, 1, `filas: ${JSON.stringify(filas)}`);
  assert.equal(filas[0].estado, "cambia");
  assert.ok(filas[0].izq.includes("Crítico Brutal"));
  assert.ok(filas[0].der.includes("Golpe brutal"));
});

// Y un apartado sin nivel se empareja con otro sin nivel por su nombre.
comprueba("apartados sin nivel se emparejan por su nombre", () => {
  const filas = alinear("### Rasgos de clase", "### Rasgos de clase");
  assert.equal(filas.length, 1);
  assert.equal(filas[0].estado, "igual");
});

// 8. Un encabezado pegado a su párrafo se parte en dos bloques: el apartado y
//    el texto que lo explica. Como bloque único, el párrafo no se alineaba con
//    nada y su texto no llegaba a la página de comparación.
comprueba("un encabezado pegado a su párrafo se parte en dos bloques", () => {
  const filas = alinear("#### Frenesí (nivel 3)\nEl texto que explica el frenesí.", "#### Frenesí (nivel 3)");
  assert.equal(filas.length, 2, `filas: ${JSON.stringify(filas)}`);
  assert.equal(filas[0].izq, "#### Frenesí (nivel 3)");
  assert.equal(filas[0].der, "#### Frenesí (nivel 3)");
  assert.equal(filas[1].estado, "solo-izq");
  assert.ok(filas[1].izq.includes("El texto que explica el frenesí."));
});

// Y `bloques` hace esa partición.
comprueba("bloques separa el encabezado de su párrafo", () => {
  assert.deepEqual(bloques("## Rasgos\n\nUno."), ["## Rasgos", "Uno."]);
  assert.deepEqual(bloques("## Rasgos\nEl texto pegado."), ["## Rasgos", "El texto pegado."]);
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
