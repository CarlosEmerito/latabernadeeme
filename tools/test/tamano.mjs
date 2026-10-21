/**
 * Comprueba que el filtro Tamaño del bestiario publica una casilla por tamaño.
 *
 * El SRD trae el tamaño con la concordancia del original —«Mediano» y
 * «Mediana», «Diminuto» y «Diminuta»—, así que la faceta publicada tal cual
 * salía con diez casillas, una por grafía, y quien marcaba «Mediano» se dejaba
 * fuera 39 de las 126 criaturas medianas: estaban en la casilla «Mediana».
 * Aquí se vigila lo que ve el usuario, sobre `dist/` y sin navegador:
 *
 *   1. Cada bestiario publica como mucho siete casillas de Tamaño, todas en la
 *      forma canónica —ninguna grafía femenina suelta— y en el orden de la
 *      tabla de tamaños.
 *   2. Las casillas son exactamente los tamaños que llevan las filas y el
 *      recuento de cada una coincide con las filas que la llevan: ninguna
 *      criatura se queda sin poder filtrarse.
 *   3. La celda de la tabla conserva la palabra del original: se agrupa la
 *      faceta, no lo que se enseña.
 *   4. `/datos/<edición>.json` sirve en `f.tamano` la misma faceta que el
 *      listado, sin volver a partir las grafías.
 *
 * La comprobación del JSON es a propósito contra el HTML y no contra la función
 * que lo genera: comparar `tamanosDe` con su propia salida saldría siempre en
 * verde.
 *
 * Uso: node tools/test/tamano.mjs [dist]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TAMANOS, tamanosDe } from "../../src/lib/tamano.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");

/** Las grafías que el filtro no puede publicar como casilla propia. */
const FEMENINAS = new Set(["Diminuta", "Pequeña", "Mediana", "Gargantuesca"]);

const fallos = [];
let comprobados = 0;
const comprobar = (condicion, detalle) => {
  comprobados++;
  if (!condicion) fallos.push(detalle);
};

// ── La función, con los casos que el corpus ya trae y los que traerá ─────────
const CASOS = [
  ["Mediano", ["Mediano"]],
  ["Mediana", ["Mediano"]],
  ["Diminuta", ["Diminuto"]],
  ["Pequeña", ["Pequeño"]],
  ["Gargantuesca", ["Gargantuesco"]],
  ["Grande", ["Grande"]],
  ["Mediano o Pequeño", ["Pequeño", "Mediano"]],
  ["Mediana o Pequeña (licántropo)", ["Pequeño", "Mediano"]],
  ["", []],
  [null, []],
  // Un tamaño que el SRD no usa no se pierde: sale tal cual para que se vea.
  ["Colosal", ["Colosal"]],
];
for (const [entrada, esperado] of CASOS) {
  const dado = tamanosDe(entrada);
  comprobar(
    JSON.stringify(dado) === JSON.stringify(esperado),
    `tamanosDe(${JSON.stringify(entrada)}) da ${JSON.stringify(dado)} y se esperaba ${JSON.stringify(esperado)}`,
  );
}

// ── Lo publicado ────────────────────────────────────────────────────────────
/** Las casillas de una faceta, en el orden en que salen. */
const casillas = (html, clave) => {
  const inicio = html.indexOf(`data-clave="${clave}"`);
  if (inicio === -1) return [];
  const bloque = html.slice(inicio, html.indexOf("</details>", inicio));
  return bloque
    .split('<label class="faceta__op">')
    .slice(1)
    .map((trozo) => ({
      valor: /<input type="checkbox" value="([^"]*)" data-faceta="[^"]*"/.exec(trozo)?.[1] ?? "",
      texto: /<span class="faceta__texto">([^<]*)<\/span>/.exec(trozo)?.[1] ?? "",
      n: Number(/<span class="faceta__n num">(\d+)<\/span>/.exec(trozo)?.[1] ?? NaN),
    }));
};

/** Las filas del cuerpo, con sus facetas ya parseadas y el texto de sus celdas. */
const filasDe = (html) => {
  const abre = html.indexOf('<tbody id="cuerpo"');
  const cierra = html.indexOf("</tbody>", abre);
  if (abre === -1 || cierra === -1) return null;
  return html
    .slice(abre, cierra)
    .split("<tr")
    .slice(1)
    .map((trozo) => {
      const bruto = /data-facetas="([^"]*)"/.exec(trozo)?.[1] ?? "{}";
      let facetas = {};
      try {
        facetas = JSON.parse(bruto.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
      } catch {
        facetas = {};
      }
      return {
        facetas,
        slug: /\/([^/"<]+)\/">/.exec(trozo)?.[1] ?? "",
        celdas: [...trozo.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
          m[1].replace(/<[^>]+>/g, "").trim(),
        ),
      };
    });
};

/** La posición de la columna Tamaño, leída de la cabecera y no supuesta. */
const columnaTamano = (html) => {
  const cabecera = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
  return [...cabecera.matchAll(/<button type="button">([^<]*)<\/button>/g)].map((m) => m[1]).indexOf("Tamaño");
};

const resumen = [];
for (const ed of ["5.5", "5e"]) {
  const pagina = path.join(DIST, ed, "monstruos", "index.html");
  if (!fs.existsSync(pagina)) {
    comprobar(false, `${ed}/monstruos: falta el listado compilado`);
    continue;
  }
  const html = fs.readFileSync(pagina, "utf8");
  const opciones = casillas(html, "tamano");
  const filas = filasDe(html);
  if (!filas) {
    comprobar(false, `${ed}/monstruos: el listado no tiene tbody#cuerpo`);
    continue;
  }

  const valores = opciones.map((o) => o.valor);
  resumen.push(`${ed}: ${opciones.length} casillas · ${filas.length} criaturas`);

  // 1. Una casilla por tamaño, en forma canónica y en orden.
  comprobar(
    opciones.length > 0 && opciones.length <= TAMANOS.length,
    `${ed}/monstruos: el filtro Tamaño tiene ${opciones.length} casillas y como mucho caben ${TAMANOS.length}`,
  );
  for (const o of opciones) {
    comprobar(
      !FEMENINAS.has(o.valor),
      `${ed}/monstruos: el filtro publica «${o.valor}» como casilla propia en vez de agruparla`,
    );
    comprobar(o.texto === o.valor, `${ed}/monstruos: la casilla «${o.valor}» se rotula «${o.texto}»`);
  }
  const conocidos = valores.filter((v) => TAMANOS.includes(v));
  comprobar(
    JSON.stringify(conocidos) ===
      JSON.stringify(TAMANOS.filter((t) => conocidos.includes(t))),
    `${ed}/monstruos: las casillas salen desordenadas: ${conocidos.join(", ")}`,
  );

  // 2. Cada fila tiene tamaño y cada tamaño publicado cuenta sus filas.
  const tokens = filas.map((f) => String(f.facetas.tamano ?? "").split("|").filter(Boolean));
  filas.forEach((f, i) => {
    comprobar(tokens[i].length > 0, `${ed}/monstruos: la fila «${f.celdas[0]}» no lleva tamaño en la faceta`);
    for (const t of tokens[i]) {
      comprobar(
        valores.includes(t),
        `${ed}/monstruos: «${f.celdas[0]}» lleva el tamaño «${t}» y el filtro no lo ofrece`,
      );
    }
  });
  for (const o of opciones) {
    const real = tokens.filter((ts) => ts.includes(o.valor)).length;
    comprobar(
      o.n === real,
      `${ed}/monstruos: la casilla «${o.valor}» anuncia ${o.n} y la llevan ${real} criaturas`,
    );
  }

  // 3. La celda conserva la palabra del original.
  const indice = columnaTamano(html);
  comprobar(indice > 0, `${ed}/monstruos: la tabla no tiene columna Tamaño`);
  const conservadas = filas.filter(
    (f, i) => indice > 0 && /^(Mediana|Diminuta|Pequeña|Gargantuesca)$/.test(f.celdas[indice] ?? "") && tokens[i].length > 0,
  );
  comprobar(
    conservadas.length > 0,
    `${ed}/monstruos: ninguna celda conserva la grafía del original; se esperaba que la agrupara solo el filtro`,
  );

  // 4. El JSON sirve la misma faceta que el listado.
  const fichero = path.join(DIST, "datos", `${ed}.json`);
  if (!fs.existsSync(fichero)) {
    comprobar(false, `${ed}: falta /datos/${ed}.json`);
  } else {
    const datos = JSON.parse(fs.readFileSync(fichero, "utf8"));
    const porSlug = new Map(
      (datos.entradas ?? []).filter((e) => e.t === "monstruos").map((e) => [e.s, String(e.f?.tamano ?? "")]),
    );
    for (const f of filas) {
      const enJson = porSlug.get(f.slug);
      if (enJson === undefined) continue;
      comprobar(
        enJson === String(f.facetas.tamano ?? ""),
        `${ed}/datos: «${f.celdas[0]}» sale como «${enJson}» en el JSON y como «${f.facetas.tamano}» en el listado`,
      );
    }
    for (const [, tamano] of porSlug) {
      for (const trozo of tamano.split("|")) {
        comprobar(
          !FEMENINAS.has(trozo),
          `${ed}/datos: la faceta publica «${trozo}» sin agrupar con su forma canónica`,
        );
      }
    }
  }
}

console.log(`Bestiarios comprobados: ${resumen.join(" · ")} · casos de la función: ${CASOS.length}`);
if (fallos.length === 0) {
  console.log("Sin fallos: el filtro Tamaño agrupa las grafías y no pierde ninguna criatura.");
  process.exit(0);
}

console.log(`\nFallos: ${fallos.length}`);
for (const detalle of fallos.slice(0, 20)) console.log(`  ✗ ${detalle}`);
process.exit(1);
