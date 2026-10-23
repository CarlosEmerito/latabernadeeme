/**
 * El texto de `/cambios/` tiene que describir el emparejamiento que aplica el
 * código.
 *
 * `/cambios/` cierra con un párrafo que explica cómo se decide que una entrada
 * del 5.1 y una del 5.2.1 son la misma. Ese párrafo decía que «la coincidencia
 * se calcula por identificador de entrada, no por texto», que es justo el
 * criterio que se demostró equivocado y que el propio módulo del emparejamiento
 * documenta en su cabecera: por identificador, la «Vara» (la varita de 1 kg de
 * 2014) se cruzaba con la pértiga de 3 m de 2024. La página publicaba dos
 * historias distintas del mismo cálculo —el contador sale de `emparejar()`, y
 * la frase que lo explica decía lo contrario— y es la página que explica cómo
 * se compara el SRD de 2014 con el de 2024.
 *
 * Lo que se vigila aquí son las dos mitades del contrato, y ninguna vale sola:
 *
 *   1. **El párrafo publicado no puede describir el criterio viejo.** Dice que
 *      la coincidencia va por identidad del objeto y por el nombre que le da el
 *      SRD, que la categoría es lo que separa los homónimos legítimos, que el
 *      identificador de fichero solo entra al final —para las entradas que el
 *      SRD renombró, porque lo decide el orden del PDF— y que por eso una
 *      entrada puede cambiar de nombre entre las dos ediciones y seguir
 *      contando como «en ambas».
 *   2. **Esas cuatro afirmaciones son las que hace el código.** El caso
 *      sintético las ejecuta sobre `emparejar()` —un par por identidad, dos
 *      homónimos que separa la categoría con los identificadores cruzados, y
 *      una entrada renombrada que solo casa por identificador—, y el corpus
 *      comprueba que lo que manda son las parejas por identidad y que ninguna
 *      de las que caen en el identificador junta dos nombres iguales.
 *
 * Así, si alguien vuelve a poner «por identificador» en el texto, la primera
 * mitad lo canta; y si el código cambia de criterio y el texto no se toca, lo
 * canta la segunda. El texto viejo se pasa por el comprobador al final: una
 * puerta que solo mira el párrafo bueno no demuestra que sepa distinguirlo del
 * malo.
 *
 * Uso: node tools/test/cambios.mjs [directorio]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";
import { emparejar } from "../../src/lib/emparejar.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");
const DATOS = path.join(RAIZ, "data");

const TIPOS = [
  "conjuros",
  "monstruos",
  "objetos",
  "equipo",
  "clases",
  "especies",
  "trasfondos",
  "dotes",
  "reglas",
];

/** El párrafo que el texto viejo publicaba: la puerta tiene que rechazarlo. */
const TEXTO_VIEJO =
  "La coincidencia se calcula por identificador de entrada, no por texto: dos fichas con el " +
  "mismo nombre pueden tener reglas distintas. El comparador de texto, línea a línea, es el paso " +
  "siguiente.";

const fallos = [];

/** El texto tal como se lee: sin etiquetas, sin entidades y con un solo espacio. */
function legible(html) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Los párrafos de la página publicada, ya legibles. */
function parrafos() {
  const ficha = path.join(DIST, "cambios", "index.html");
  if (!fs.existsSync(ficha)) {
    fallos.push(`no existe ${ficha}: hay que compilar antes de pasar la puerta (npm run build)`);
    return [];
  }
  const html = fs.readFileSync(ficha, "utf8");
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => legible(m[1]));
}

/**
 * Qué le falta al párrafo para describir el criterio que aplica `emparejar()`.
 * Devuelve la lista de problemas; vacía quiere decir que el texto está bien.
 */
function problemasDe(texto) {
  const problemas = [];

  if (/coincidencia\s+(?:se\s+calcula|es)\s+por\s+identificador/i.test(texto)) {
    problemas.push(
      "dice que la coincidencia es por identificador, que es el criterio que el código descartó",
    );
  }
  if (!/identidad del objeto/i.test(texto)) {
    problemas.push("no dice que la coincidencia sea por identidad del objeto");
  }
  if (!/\bnombres?\b/i.test(texto)) {
    problemas.push("no dice que lo que empareja es el nombre que le da el SRD");
  }
  if (!/categor[ií]a[\s\S]{0,80}hom[oó]nimos?/i.test(texto)) {
    problemas.push("no dice que la categoría es lo que separa los homónimos legítimos");
  }
  if (!/identificador[\s\S]{0,90}(?:renombr|al final|último recurso|ultimo recurso)/i.test(texto)) {
    problemas.push("no dice que el identificador de fichero solo entra al final (entradas renombradas)");
  }
  if (!/cambiar de nombre/i.test(texto)) {
    problemas.push("no dice que el nombre puede cambiar entre ediciones sin dejar de estar «en ambas»");
  }

  return problemas;
}

// 1. El párrafo publicado.
const candidatos = parrafos().filter((t) => /coincidencia/i.test(t));
const publicado = candidatos.at(-1);
if (candidatos.length === 0) {
  fallos.push("la página de cambios no publica ningún párrafo que explique la coincidencia");
} else {
  for (const problema of problemasDe(publicado)) fallos.push(`el párrafo de /cambios/ ${problema}`);
}

// 2. El comprobador distingue el texto viejo del bueno: si no, no vigila nada.
{
  const problemas = problemasDe(TEXTO_VIEJO);
  if (!problemas.some((p) => p.includes("por identificador"))) {
    fallos.push(
      "el comprobador da por bueno el texto viejo: no detecta «se calcula por identificador»",
    );
  }
}

/** Una entrada de `data/`, con lo que el emparejamiento necesita de ella. */
function leerEntrada(ruta, tipo) {
  const crudo = fs.readFileSync(ruta, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(crudo);
  const data = m ? (parseYaml(m[1]) ?? {}) : {};
  return {
    slug: path.basename(ruta, ".md"),
    data: { name: path.basename(ruta, ".md"), ...data },
    body: "",
    html: "",
    edicion: path.basename(path.dirname(ruta)),
    tipo,
  };
}

function cargar(edicion, tipo) {
  const carpeta = path.join(DATOS, edicion, tipo);
  if (!fs.existsSync(carpeta)) return [];
  return fs
    .readdirSync(carpeta)
    .filter((f) => f.endsWith(".md"))
    .map((f) => leerEntrada(path.join(carpeta, f), tipo));
}

/** Una entrada sintética, con lo mínimo que mira el emparejamiento. */
const entrada = (slug, nombre, categoria) => ({
  slug,
  data: { name: nombre, category: categoria },
  body: "",
  html: "",
  edicion: "sintetica",
  tipo: "equipo",
});

// 3. Las tres afirmaciones del párrafo, ejecutadas sobre el código.
{
  // Por identidad: el mismo nombre y la misma categoría, con identificadores
  // distintos, tienen que casar.
  const pares = emparejar(
    [entrada("cuerda-51", "Cuerda", "Equipo de aventurero")],
    [entrada("cuerda-52", "Cuerda", "Equipo de aventurero")],
  );
  if (pares.length !== 1 || pares[0].via !== "identidad") {
    fallos.push(
      "el código ya no empareja por identidad un objeto con el mismo nombre: el párrafo describe otro criterio",
    );
  }
}

{
  // Los homónimos los separa la categoría, no el identificador: los dos
  // «Bastón» van con los identificadores cruzados a propósito.
  const a = [
    entrada("baston-arma-51", "Bastón", "Arma"),
    entrada("baston-canalizador-51", "Bastón", "Canalizador arcano"),
  ];
  const b = [
    entrada("baston-arma-51", "Bastón", "Canalizador arcano"),
    entrada("baston-canalizador-51", "Bastón", "Arma"),
  ];
  const pares = emparejar(a, b);
  const porNombre = (slug) => pares.find((p) => p.a.slug === slug)?.b;
  const arma = porNombre("baston-arma-51");
  const canalizador = porNombre("baston-canalizador-51");
  if (
    pares.length !== 2 ||
    arma?.data.category !== "Arma" ||
    canalizador?.data.category !== "Canalizador arcano" ||
    pares.some((p) => p.via !== "identidad")
  ) {
    fallos.push(
      "el código ya no separa los homónimos por categoría: el párrafo dice que es la categoría la que los distingue",
    );
  }
}

// 4. El corpus: la mayoría de las parejas van por identidad, y las que caen en
//    el identificador son entradas renombradas (nombres distintos), que es lo
//    único que el párrafo atribuye al identificador.
let porIdentidad = 0;
let porIdentificador = 0;
const identificadorConMismoNombre = [];

for (const tipo of TIPOS) {
  const a = cargar("ed51", tipo);
  const b = cargar("ed52", tipo);
  if (a.length === 0 || b.length === 0) continue;
  for (const par of emparejar(a, b)) {
    if (par.via === "identidad") {
      porIdentidad++;
      continue;
    }
    porIdentificador++;
    if (String(par.a.data.name) === String(par.b.data.name)) {
      identificadorConMismoNombre.push(`${tipo}/${par.a.slug} [${par.a.data.name}]`);
    }
  }
}

if (porIdentidad <= porIdentificador) {
  fallos.push(
    `el corpus empareja ${porIdentidad} parejas por identidad y ${porIdentificador} por identificador: ` +
      "el código ya no se guía por la identidad, así que el párrafo está desfasado",
  );
}
if (identificadorConMismoNombre.length > 0) {
  fallos.push(
    `hay ${identificadorConMismoNombre.length} parejas que caen en el identificador con el mismo nombre ` +
      `(p. ej. ${identificadorConMismoNombre[0]}): el identificador ya no es solo el último recurso de un renombrado`,
  );
}

// 5. El contador de la cabecera sale del mismo `emparejar()` que el párrafo
//    explica: si el texto habla de otra cosa, los dos números dejan de cuadrar.
{
  const ficha = path.join(DIST, "cambios", "index.html");
  if (fs.existsSync(ficha)) {
    const html = fs.readFileSync(ficha, "utf8");
    const m = /<b>(\d+)<\/b>\s*en ambas/i.exec(legible(html)) ?? /<b>(\d+)<\/b>\s*en ambas/i.exec(html);
    if (!m) {
      fallos.push("la cabecera de /cambios/ no declara cuántas entradas están en las dos ediciones");
    } else if (Number(m[1]) !== porIdentidad + porIdentificador) {
      fallos.push(
        `la cabecera anuncia ${m[1]} entradas «en ambas» y el emparejamiento da ` +
          `${porIdentidad + porIdentificador}: el contador y el párrafo hablan de cálculos distintos`,
      );
    }
  }
}

console.log(
  `Parejas: ${porIdentidad + porIdentificador} · por identidad: ${porIdentidad} · por identificador: ${porIdentificador}`,
);

if (fallos.length > 0) {
  console.log("\n✗ El texto de /cambios/ no describe el emparejamiento que aplica el código:");
  for (const f of fallos) console.log(`  - ${f}`);
  console.log(
    "\n  Es la página que explica cómo se compara el SRD de 2014 con el de 2024: si el texto dice " +
      "otro criterio, el lector se queda con el equivocado.",
  );
  process.exit(1);
}

console.log(
  "El párrafo de /cambios/ dice lo mismo que hace el emparejamiento: identidad del objeto, " +
    "la categoría separa los homónimos y el identificador solo entra en los renombrados.",
);
