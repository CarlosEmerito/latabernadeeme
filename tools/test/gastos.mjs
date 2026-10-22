/**
 * Comprueba que la ficha de gastos del SRD 5.2.1 publica las tres tablas del
 * capítulo «Gastos y servicios».
 *
 * La ficha de `data/ed52/equipo/gastos.md` llegó al repositorio con una
 * disculpa en vez de datos: «La tabla “Comida, bebida y alojamiento” de esta
 * edición llega con las celdas de las dos columnas intercaladas en el flujo
 * del PDF y no se ha podido reconstruir fila a fila; queda pendiente de una
 * pasada manual sobre la pág. 110». En el PDF la tabla no está ilegible: sale
 * en dos pares de columnas —«Elemento | Precio | Elemento | Precio»— que el
 * flujo entrega intercalados, y basta con reordenar las celdas por su
 * coordenada para recuperar las filas. La página `/5.5/equipo/gastos/` publica
 * ahora las tres tablas, y esta puerta vigila que no vuelvan a desaparecer.
 *
 * Lo que se compara no es el texto de la tabla sino sus filas, con el valor en
 * su grupo y en su fila: una celda que se cuela en la fila de al lado deja la
 * tabla tan completa como si estuviera bien, así que se comparan las filas una
 * a una, y el precio de cada elemento tiene que estar al lado de su nombre.
 *
 * El ancla son las filas del SRD 5.2.1 (págs. 110 y 111), y no el fichero de
 * `data/`: si la puerta comparase la ficha consigo misma, una regeneración que
 * perdiera la tabla seguiría en verde. Las cifras están en `.cache/srd/`, que
 * no se versiona, así que el ancla vive en este fichero.
 *
 * Uso: node tools/test/gastos.mjs [dist]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");
const MARKDOWN = path.join(RAIZ, "data/ed52/equipo/gastos.md");
const PUBLICADO = path.join(DIST, "5.5/equipo/gastos/index.html");

/**
 * Las tres tablas del capítulo «Gastos y servicios» del SRD 5.2.1.
 *
 * Los grupos («Comida», «Estancia en posada por día», «Vino (botella)») son
 * las filas que en el PDF no traen precio al lado y sí las de sus hijuelas;
 * su celda de precio va vacía, como en el 5.1.
 */
const SECCIONES = [
  {
    titulo: "Comida, bebida y alojamiento",
    id: "comida-bebida-y-alojamiento",
    cabecera: ["Elemento", "Precio"],
    filas: [
      ["Cerveza (jarra)", "4 pc"],
      ["Comida", ""],
      ["Miserable", "1 pc"],
      ["Pobre", "2 pc"],
      ["Modesta", "1 pp"],
      ["Copiosa", "2 pp"],
      ["Lujosa", "3 po"],
      ["Aristocrática", "6 pp"],
      ["Estancia en posada por día", ""],
      ["Miserable", "7 pc"],
      ["Pobre", "1 pp"],
      ["Modesta", "5 pp"],
      ["Cómoda", "8 pp"],
      ["Lujosa", "2 po"],
      ["Aristocrática", "4 po"],
      ["Pan (hogaza)", "2 pc"],
      ["Queso (cuña)", "1 pp"],
      ["Vino (botella)", ""],
      ["Común", "2 pp"],
      ["De calidad", "10 po"],
    ],
  },
  {
    titulo: "Asalariados",
    id: "asalariados",
    cabecera: ["Servicio", "Remuneración"],
    filas: [
      ["Asalariado cualificado", "2 po al día"],
      ["Asalariado no cualificado", "2 pp al día"],
      ["Mensajero", "1 o 2 pc por kilómetro"],
    ],
  },
  {
    titulo: "Servicios de lanzamiento de conjuros",
    id: "servicios-de-lanzamiento-de-conjuros",
    cabecera: ["Nivel del conjuro", "Disponibilidad", "Remuneración"],
    filas: [
      ["Truco", "Aldea, pueblo o ciudad", "30 po"],
      ["1", "Aldea, pueblo o ciudad", "50 po"],
      ["2", "Aldea, pueblo o ciudad", "200 po"],
      ["3", "Solo pueblo o ciudad", "300 po"],
      ["4–5", "Solo pueblo o ciudad", "2000 po"],
      ["6–8", "Solo ciudad", "20 000 po"],
      ["9", "Solo ciudad", "100 000 po"],
    ],
  },
];

/** El texto visible de una celda: sin adornos de Markdown ni de HTML. */
const texto = (celda) =>
  celda
    .replace(/<[^>]+>/g, " ")
    .replace(/[*`]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Las celdas de una línea de tabla. */
const celdas = (linea) =>
  linea
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => texto(c));

/** Las tablas de un markdown, con el apartado (`## …`) en el que están. */
function tablasDelMarkdown(markdown) {
  const lineas = markdown.split("\n");
  const tablas = [];
  let apartado = null;
  let i = 0;
  while (i < lineas.length) {
    const linea = lineas[i];
    if (/^##\s+/.test(linea)) apartado = linea.replace(/^##\s+/, "").trim();
    const separadora = lineas[i + 1] ?? "";
    if (
      linea.trim().startsWith("|") &&
      separadora.trim().startsWith("|") &&
      celdas(separadora).every((c) => /^:?-+:?$/.test(c))
    ) {
      const filas = [];
      let j = i + 2;
      while (j < lineas.length && lineas[j].trim().startsWith("|")) {
        filas.push(celdas(lineas[j]));
        j++;
      }
      tablas.push({ apartado, cabecera: celdas(linea), filas });
      i = j;
      continue;
    }
    i++;
  }
  return tablas;
}

/** El HTML de un apartado: desde su `<h2 id="…">` hasta el siguiente `<h2`. */
function htmlDeApartado(html, id) {
  const m = new RegExp(`<h2 id="${id}"[^>]*>`).exec(html);
  if (!m) return null;
  const siguiente = html.indexOf("<h2", m.index + m[0].length);
  return html.slice(m.index, siguiente === -1 ? html.length : siguiente);
}

/** Las filas de la tabla que hay en un trozo de HTML, como texto. */
function filasDelHtml(html) {
  const cuerpo = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(html);
  if (!cuerpo) return [];
  return [...cuerpo[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((c) => texto(c[1])).join(" | "),
  );
}

/**
 * Las filas que se esperan y las que hay, en el orden en el que aparecen.
 *
 * Un grupo («Comida») y sus filas comparten la primera columna, así que dos
 * filas homónimas —«Miserable» en la comida y «Miserable» en la posada— solo
 * se distinguen por su valor. Por eso la comparación es posicional: el mismo
 * par (elemento, valor) puede aparecer dos veces, pero en su sitio.
 */
function filasEsperadas(seccion) {
  return seccion.filas.map((f) => f.join(" | "));
}

function filasDe(tabla) {
  return tabla.filas.map((f) => f.join(" | "));
}

/**
 * Las diferencias entre las filas que se esperan y las que hay.
 *
 * La comparación es posicional, no por multiconjunto: el SRD repite los
 * nombres («Miserable» sale en la comida y en la posada, «Pobre» también) y
 * lo que distingue una fila de otra es su valor, así que una fila puede
 * tener el par correcto y estar en el grupo que no le toca. Con una
 * comparación sin orden, esa fila pasaba; con esta se ve cuál es y cuál
 * debería ser.
 */
function diferencias(esperadas, reales) {
  const salida = [];
  const total = Math.max(esperadas.length, reales.length);
  for (let i = 0; i < total; i++) {
    const espera = esperadas[i];
    const real = reales[i];
    if (real === undefined) {
      salida.push(`falta la fila «${espera}»`);
      continue;
    }
    if (espera === undefined) {
      salida.push(`sobra la fila «${real}»`);
      continue;
    }
    if (espera !== real) {
      salida.push(`la fila ${i + 1} es «${real}» y debería ser «${espera}»`);
    }
  }
  return salida;
}

/** Los descuadres de la ficha, del markdown y de la página publicada. */
export function revisar(markdown, html) {
  const problemas = [];

  // La disculpa que sustituyó a los datos no puede volver.
  for (const [donde, texto_] of [
    ["data/ed52/equipo/gastos.md", markdown],
    ["la página publicada", html],
  ]) {
    for (const frase of ["queda pendiente", "no se ha podido", "pendiente de revisión"]) {
      if (texto_ && texto_.toLowerCase().includes(frase)) {
        problemas.push(`${donde} dice «${frase}»: la tabla del SRD se puede reconstruir`);
      }
    }
  }

  const tablas = tablasDelMarkdown(markdown ?? "");

  for (const seccion of SECCIONES) {
    const tabla = tablas.find((t) => t.apartado === seccion.titulo);
    if (!tabla) {
      problemas.push(`no está la tabla «${seccion.titulo}»`);
      continue;
    }
    if (tabla.cabecera.join(" | ") !== seccion.cabecera.join(" | ")) {
      problemas.push(
        `«${seccion.titulo}»: la cabecera es «${tabla.cabecera.join(" · ")}» y debería ser «${seccion.cabecera.join(" · ")}»`,
      );
    }
    for (const diferencia of diferencias(filasEsperadas(seccion), filasDe(tabla))) {
      problemas.push(`«${seccion.titulo}»: ${diferencia}`);
    }

    if (!html) {
      problemas.push(`no está la página publicada ${PUBLICADO}`);
      continue;
    }
    const publicado = htmlDeApartado(html, seccion.id);
    if (!publicado) {
      problemas.push(`la página publicada no tiene el apartado «${seccion.titulo}»`);
      continue;
    }
    for (const diferencia of diferencias(filasEsperadas(seccion), filasDelHtml(publicado))) {
      problemas.push(`la página publicada, «${seccion.titulo}»: ${diferencia}`);
    }
  }

  return problemas;
}

/** El markdown de ejemplo, con sus tres tablas tal cual deben quedar. */
function markdownDeEjemplo() {
  const partes = ["---\nname: Gastos\nsrd: '5.2'\npage: 110\n---\n"];
  for (const seccion of SECCIONES) {
    partes.push(`\n## ${seccion.titulo}\n`);
    partes.push(`| ${seccion.cabecera.join(" | ")} |`);
    partes.push(`| ${seccion.cabecera.map(() => "---").join(" | ")} |`);
    // El `trimEnd` deja la celda vacía pegada a la barra: `| Comida | |`, que
    // es como está escrita la ficha real.
    for (const fila of seccion.filas) partes.push(`| ${fila.join(" | ").trimEnd()} |`);
  }
  return partes.join("\n") + "\n";
}

/** El HTML de ejemplo: las mismas filas, ya publicadas. */
function htmlDeEjemplo() {
  const partes = [];
  for (const seccion of SECCIONES) {
    partes.push(`<h2 id="${seccion.id}">${seccion.titulo}</h2>`);
    partes.push("<table><thead><tr>");
    for (const c of seccion.cabecera) partes.push(`<th>${c}</th>`);
    partes.push("</tr></thead><tbody>");
    for (const fila of seccion.filas) {
      partes.push("<tr>");
      for (const c of fila) partes.push(c ? `<td>${c}</td>` : "<td></td>");
      partes.push("</tr>");
    }
    partes.push("</tbody></table>");
  }
  return "<html><body>" + partes.join("\n") + "</body></html>";
}

/** Lo que se comprueba en cada caso: qué se rompe y qué tiene que notar. */
const PERTURBACIONES = [
  ["una cifra de la tabla de comida", "| Cerveza (jarra) | 4 pc |", "| Cerveza (jarra) | 5 pc |"],
  ["un valor en la fila de al lado", "| Comida | |", "| Comida | 6 pp |"],
  // La fila correcta en el grupo que no le toca: el nombre y el valor son los
  // que tocan, pero la fila está en el grupo equivocado.
  ["una fila en el grupo que no le toca", "| Pobre | 2 pc |", "| Pobre | 1 pp |"],
  ["una fila que falta", "| Queso (cuña) | 1 pp |", ""],
  ["una fila de más", "| Queso (cuña) | 1 pp |", "| Queso (cuña) | 1 pp |\n| Sal (cuña) | 1 pp |"],
  ["la remuneración de un asalariado", "| Mensajero | 1 o 2 pc por kilómetro |", "| Mensajero | 1 o 3 pc por kilómetro |"],
  ["la disponibilidad de un conjuro", "| 3 | Solo pueblo o ciudad | 300 po |", "| 3 | Solo ciudad | 300 po |"],
  ["el precio de un conjure de nivel alto", "| 9 | Solo ciudad | 100 000 po |", "| 9 | Solo ciudad | 10 000 po |"],
  ["la cabecera de una tabla", "| Nivel del conjuro | Disponibilidad | Remuneración |", "| Nivel | Disponibilidad | Remuneración |"],
  ["la disculpa que sustituyó a los datos", "## Comida, bebida y alojamiento", "## Comida, bebida y alojamiento\n\nqueda pendiente de una pasada manual"],
];

const fallos = [];
let comprobados = 0;

// El ejemplo, con sus tablas correctas, no da ningún problema.
const ejemplo = markdownDeEjemplo();
const htmlEjemplo = htmlDeEjemplo();
comprobados++;
if (revisar(ejemplo, htmlEjemplo).length > 0) {
  fallos.push("el ejemplo, con sus tablas correctas, ya sale con problemas");
}

// Y cada perturbación tiene que notarse.
for (const [descripcion, viejo, nuevo] of PERTURBACIONES) {
  comprobados++;
  if (!ejemplo.includes(viejo)) {
    fallos.push(`«${descripcion}»: no encuentro «${viejo}» en el ejemplo`);
    continue;
  }
  const markdown = ejemplo.replace(viejo, nuevo);
  if (revisar(markdown, htmlEjemplo).length === 0) {
    fallos.push(`«${descripcion}»: la puerta no ve el cambio`);
  }
}

// La puerta tiene que ver también en la página publicada.
comprobados++;
if (revisar(ejemplo, htmlEjemplo.replace("4 pc", "9 pc")).length === 0) {
  fallos.push("la puerta no ve un cambio en la página publicada");
}

// Y contra la ficha real: cambiarla a mano tiene que ponerla en rojo.
if (!fs.existsSync(MARKDOWN)) {
  fallos.push(`no existe ${MARKDOWN}`);
} else {
  const markdownReal = fs.readFileSync(MARKDOWN, "utf8");
  const htmlReal = fs.existsSync(PUBLICADO) ? fs.readFileSync(PUBLICADO, "utf8") : null;
  comprobados++;
  const problemas = revisar(markdownReal, htmlReal);
  if (problemas.length > 0) {
    for (const problema of problemas) fallos.push(`la ficha real: ${problema}`);
  }

  // La prueba en rojo contra el fichero real: se cambia una cifra a mano y la
  // puerta tiene que nombrarla.
  comprobados++;
  const perturbado = markdownReal.replace("| Cerveza (jarra) | 4 pc |", "| Cerveza (jarra) | 9 pc |");
  if (perturbado === markdownReal) {
    fallos.push("la ficha real no trae la fila de la cerveza que se perturba");
  } else if (revisar(perturbado, htmlReal).length === 0) {
    fallos.push("una cifra cambiada a mano en la ficha real no pone la puerta en rojo");
  }
}

console.log(`Gastos del 5.2.1: ${comprobados} casos comprobados; una tabla que se pierde se ve.`);
if (fallos.length > 0) {
  console.log("✗ La ficha de gastos del SRD 5.2.1 no publica sus tres tablas:");
  for (const fallo of fallos) console.log(`   - ${fallo}`);
  process.exit(1);
}
console.log(
  "Las tres tablas de «Gastos y servicios» están con sus filas y sus precios, en la ficha y en la página publicada.",
);
