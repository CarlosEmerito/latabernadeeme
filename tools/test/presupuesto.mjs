/**
 * Comprueba el presupuesto de PX de los encuentros contra el SRD.
 *
 * La tabla del 5.2.1 está en `data/ed52/reglas/encuentros-de-combate.md`
 * (pág. 221) y el constructor de `/mesa/` la usa para decir si un encuentro
 * es holgado o está por encima. Si el módulo `src/lib/presupuesto.ts` y el
 * markdown dejaran de coincidir, el panel daría un veredicto con números que
 * no salen del manual, y nadie lo notaría: el sitio compila igual y la cifra
 * se lee verosímil.
 *
 * Aquí se comparan las tres cosas que tienen que ir juntas:
 *
 *   1. Las cabeceras de la tabla («Baja», «Moderada», «Alta») son las
 *      dificultades del 5.2.1 del módulo, y en el mismo orden: si las
 *      columnas se cruzaran, el presupuesto se leería de la casilla
 *      equivocada sin que nada se quejara.
 *   2. Las veinte filas de la tabla son las del módulo, número a número.
 *   3. El 5.1 tiene su propia tabla, con cuatro columnas y el ajuste por
 *      número de criaturas, y no es una copia de la del 5.2.1.
 *
 * Y se fija el comportamiento que estaba roto: el catálogo 5.2.1 no lleva
 * multiplicador, así que cuatro guerreros goblin (200 PX) son un tercio del
 * presupuesto de 600 PX y el veredicto es «Holgado», no «Por encima».
 *
 * Uso: node tools/test/presupuesto.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIFICULTADES,
  REGLAS,
  TABLAS,
  dificultadDe,
  dificultadPorDefecto,
  multiplicadorDe,
  presupuestoDe,
  totalDe,
  umbralDe,
  veredictoDe,
} from "../../src/lib/presupuesto.ts";
import { plegar } from "../../src/lib/texto.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TABLA_SRD = path.join(RAIZ, "data/ed52/reglas/encuentros-de-combate.md");

const fallos = [];
let comprobados = 0;

/** Un caso: la comprobación y lo que tiene que salir. */
function comprueba(nombre, fn) {
  comprobados++;
  try {
    fn();
  } catch (e) {
    fallos.push(`${nombre}: ${String(e.message).split("\n")[0]}`);
  }
}

/** La tabla del markdown: cabeceras y filas, como números. */
function leerTablaSrd() {
  const texto = fs.readFileSync(TABLA_SRD, "utf8");
  const lineas = texto.split("\n");
  const celdas = (linea) =>
    linea
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  // La cabecera es la línea de tabla que nombra el nivel del grupo, no la
  // frase que la anuncia en prosa («Mediante la tabla “Presupuesto de PX por
  // personaje”, comprueba el nivel del grupo…»).
  const indice = lineas.findIndex((l) => l.trim().startsWith("|") && /Nivel del grupo/i.test(l));
  if (indice === -1) return null;
  const columnas = celdas(lineas[indice]).slice(1);
  const filas = [];
  for (const linea of lineas.slice(indice + 1)) {
    const c = celdas(linea);
    if (c.length !== columnas.length + 1) continue;
    if (!/^\d+$/.test(c[0])) continue;
    filas.push([Number(c[0]), c.slice(1).map((v) => Number(v.replace(/\s/g, "")))]);
  }
  return { columnas, filas };
}

// 1. La tabla del SRD y el módulo dicen lo mismo.
const tabla = leerTablaSrd();

comprueba("la tabla del SRD se lee", () => {
  assert.ok(tabla, "no encuentro la tabla «Presupuesto de PX por personaje» en el markdown del SRD");
  assert.equal(tabla.filas.length, 20, `la tabla del SRD tiene ${tabla.filas.length} filas y deberían ser 20`);
});

comprueba("las cabeceras del SRD son las dificultades del 5.2.1, en el mismo orden", () => {
  assert.ok(tabla);
  const delModulo = DIFICULTADES["5.5"].map((d) => plegar(d.etiqueta));
  assert.deepEqual(tabla.columnas.map(plegar), delModulo, "las columnas de la tabla no son las dificultades del módulo");
});

comprueba("las veinte filas del SRD son las del módulo", () => {
  assert.ok(tabla);
  for (const [nivel, valores] of tabla.filas) {
    assert.deepEqual(
      [...(TABLAS["5.5"][nivel] ?? [])],
      valores,
      `el nivel ${nivel} no coincide: el módulo dice ${JSON.stringify(TABLAS["5.5"][nivel])} y el SRD ${JSON.stringify(valores)}`,
    );
  }
});

comprueba("el módulo no tiene filas de más", () => {
  const niveles = Object.keys(TABLAS["5.5"]).map(Number).sort((a, b) => a - b);
  assert.deepEqual(niveles, Array.from({ length: 20 }, (_, i) => i + 1));
});

comprueba("cada fila tiene una PX por cada dificultad", () => {
  for (const ed of ["5.5", "5e"]) {
    for (const [nivel, fila] of Object.entries(TABLAS[ed])) {
      assert.equal(fila.length, DIFICULTADES[ed].length, `${ed} nivel ${nivel}: ${fila.length} columnas y ${DIFICULTADES[ed].length} dificultades`);
      assert.ok(
        fila.every((v) => Number.isInteger(v) && v > 0),
        `${ed} nivel ${nivel}: hay un valor que no es un PX entero positivo`,
      );
    }
  }
});

// 2. El 5.1 tiene su propia tabla, con cuatro columnas y su ajuste.
comprueba("el 5.1 tiene cuatro dificultades y no es una copia del 5.2.1", () => {
  assert.equal(DIFICULTADES["5e"].length, 4);
  assert.deepEqual(
    DIFICULTADES["5e"].map((d) => d.clave),
    ["facil", "media", "dificil", "mortal"],
  );
  const iguales = Object.keys(TABLAS["5.5"]).filter(
    (nivel) => JSON.stringify(TABLAS["5.5"][nivel]) === JSON.stringify(TABLAS["5e"][nivel]),
  );
  assert.equal(iguales.length, 0, `los niveles ${iguales.join(", ")} tienen la misma tabla en las dos ediciones`);
});

comprueba("el 5.2.1 no multiplica por número de criaturas y el 5.1 sí", () => {
  for (const n of [1, 2, 3, 4, 6, 8, 12, 20]) {
    assert.equal(multiplicadorDe("5.5", n), 1, `el 5.2.1 no lleva ajuste por número de criaturas (${n})`);
  }
  assert.equal(multiplicadorDe("5e", 1), 1);
  assert.equal(multiplicadorDe("5e", 2), 1.5);
  assert.equal(multiplicadorDe("5e", 4), 2);
  assert.equal(multiplicadorDe("5e", 8), 2.5);
});

// 3. El presupuesto sale de la tabla de la edición que toca.
comprueba("el 5.2.1 usa la tabla del SRD: 4 PJ de nivel 3 en dificultad baja = 600 PX", () => {
  assert.equal(presupuestoDe("5.5", 3, "baja", 4), 600);
  assert.equal(presupuestoDe("5.5", 3, "moderada", 4), 900);
  assert.equal(presupuestoDe("5.5", 3, "alta", 4), 1600);
});

comprueba("el 5.1 usa su tabla: 4 PJ de nivel 3 en dificultad fácil = 300 PX", () => {
  assert.equal(presupuestoDe("5e", 3, "facil", 4), 300);
  assert.equal(presupuestoDe("5e", 3, "media", 4), 600);
  assert.equal(presupuestoDe("5e", 3, "mortal", 4), 1600);
});

comprueba("una dificultad de la otra edición cae en la de por defecto de esta", () => {
  // «media» es de 2014; en el 5.2.1 no existe, así que sale «moderada».
  assert.equal(dificultadDe("5.5", "media").clave, "moderada");
  assert.equal(dificultadDe("5e", "moderada").clave, "media");
  assert.equal(dificultadDe("5.5", "inventada").clave, dificultadPorDefecto("5.5").clave);
});

comprueba("el nivel fuera de tabla sale como el 3", () => {
  assert.equal(presupuestoDe("5.5", 99, "baja", 4), presupuestoDe("5.5", 3, "baja", 4));
  assert.equal(presupuestoDe("5.5", 0, "baja", 4), presupuestoDe("5.5", 3, "baja", 4));
});

// 4. El caso que estaba roto: cuatro guerreros goblin en el catálogo 5.2.1.
comprueba("cuatro guerreros goblin en el 5.2.1 son un tercio del presupuesto", () => {
  const base = 4 * 50; // 50 PX por guerrero goblin
  const total = totalDe("5.5", base, 4);
  assert.equal(total, 200, "el 5.2.1 no debe ajustar el total por número de criaturas");
  const presupuesto = presupuestoDe("5.5", 3, "baja", 4);
  assert.equal(presupuesto, 600);
  assert.equal(veredictoDe(total / presupuesto).texto, "Holgado");
});

comprueba("los mismos cuatro goblin en el 5.1 sí llevan el ajuste", () => {
  const base = 4 * 50;
  assert.equal(totalDe("5e", base, 4), 400, "el 5.1 ajusta por número de criaturas");
  const presupuesto = presupuestoDe("5e", 3, "facil", 4);
  assert.equal(presupuesto, 300);
  assert.equal(veredictoDe(400 / 300).texto, "Por encima");
});

comprueba("cada edición dice qué regla usa, y son distintas", () => {
  assert.ok(REGLAS["5.5"].titulo.includes("5.2.1"));
  assert.ok(REGLAS["5e"].titulo.includes("2014"));
  assert.notEqual(REGLAS["5.5"].nota, REGLAS["5e"].nota);
  // La nota del 5.2.1 tiene que decir que no hay ajuste: es lo que hace que el
  // panel no lo aplique por error.
  assert.ok(/sin ajuste/i.test(REGLAS["5.5"].nota), `la nota del 5.2.1 no dice que no hay ajuste: «${REGLAS["5.5"].nota}»`);
  assert.ok(/ajuste/i.test(REGLAS["5e"].nota), `la nota del 5.1 no dice que hay ajuste: «${REGLAS["5e"].nota}»`);
});

comprueba("el umbral sale de la tabla de la edición", () => {
  assert.equal(umbralDe("5.5", 3, "baja"), 150);
  assert.equal(umbralDe("5.5", 3, "moderada"), 225);
  assert.equal(umbralDe("5.5", 3, "alta"), 400);
  assert.equal(umbralDe("5e", 3, "facil"), 75);
  assert.equal(umbralDe("5e", 3, "media"), 150);
  assert.equal(umbralDe("5e", 3, "dificil"), 225);
  assert.equal(umbralDe("5e", 3, "mortal"), 400);
  // Una dificultad que no es de esta edición no sale de la tabla: cae en la de
  // por defecto, no en un 0 que dejaría el ratio en Infinity.
  assert.equal(umbralDe("5.5", 3, "media"), 225);
  assert.equal(umbralDe("5e", 3, "moderada"), 150);
});

comprueba("el veredicto tiene cuatro tramos y ningún porcentaje raro", () => {
  assert.equal(veredictoDe(0.5).texto, "Holgado");
  assert.equal(veredictoDe(0.8).texto, "En presupuesto");
  assert.equal(veredictoDe(1.1).texto, "Al límite");
  assert.equal(veredictoDe(1.5).texto, "Por encima");
  assert.equal(veredictoDe(Number.POSITIVE_INFINITY).texto, "Sin presupuesto");
  assert.equal(veredictoDe(Number.NaN).texto, "Sin presupuesto");
});

console.log(`Presupuesto de encuentros comprobado: ${comprobados} casos.`);
if (fallos.length) {
  console.log("");
  for (const f of fallos) console.log(`  ✗ ${f}`);
  console.log("");
  console.log("La tabla del SRD y la del constructor tienen que decir lo mismo.");
  process.exit(1);
}
console.log("La tabla del 5.2.1, las dificultades y el ajuste por número de criaturas cuadran con el SRD.");
