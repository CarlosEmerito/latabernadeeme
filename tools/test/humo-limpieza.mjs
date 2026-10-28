/**
 * Comprueba que la sección de iniciativa del humo empiece y acabe con el
 * almacén sin combate.
 *
 * El combate de `/mesa/` se guarda en `localStorage` y se restaura al cargar, y
 * el humo reutiliza el mismo perfil de Chrome. El primer caso de iniciativa
 * añadía «A» y «B» dando por hecho un almacén limpio, así que en la segunda
 * pasada seguida —el mismo perfil, sin borrar nada— la lista traía las cuatro
 * filas de la pasada anterior y las tres primeras comprobaciones de iniciativa
 * salían en rojo («iniciativa», «iniciativa tras recargar» y «iniciativa tras
 * recargar y añadir») con el código perfectamente sano. Es el mismo rojo falso
 * que se arregló en el filtro Tamaño: una puerta que miente manda a buscar un
 * fallo donde no lo hay y, peor, acostumbra a ignorar el rojo.
 *
 * Lo que se vigila aquí es el orden de las preparaciones, sin abrir Chrome. Los
 * escenarios de la sección encadenan a propósito —añadir un refuerzo, pasar el
 * turno, vaciar, quitar una fila— y siguen con el combate del caso anterior, así
 * que no se pide una limpieza por caso: se pide que la cadena empiece en vacío
 * (el primer «Añadir» detrás de la receta que borra `taberna:iniciativa` y
 * recarga `/mesa/`) y que no deje nada sembrado al terminar, que es lo que ve la
 * pasada siguiente.
 *
 * La comprobación se autocomprueba: quitar la primera limpieza, dejar la receta
 * sin recarga o quitar la limpieza final tienen que ponerla en rojo. Sin eso, un
 * día que el análisis no mire nada seguiría saliendo en verde.
 *
 * Uso: node tools/test/humo-limpieza.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "../verify/comun.mjs";

const FICHERO = path.join(RAIZ, "tools/test/humo.mjs");

/** Dónde empieza y acaba la sección de iniciativa del humo. */
const DESDE = "const campos = `const n=document.getElementById('ini-nombre')";
const HASTA = "const pnj = await evaluar(mesa,";

/** La receta que deja el almacén sin combate, tal como está escrita hoy. */
const RECETA = /const limpiarCombate = async \(\) => \{[\s\S]*?\n  \};/;

/** Un «Añadir» del panel de iniciativa: el caso siembra su propio combate. */
const SIEMBRA = /getElementById\('ini-anadir'\)\.click\(\)/g;

/** La limpieza del almacén, llamada por la receta o escrita a mano. */
const LIMPIEZA = /await\s+limpiarCombate\(\)|localStorage\.removeItem\('taberna:iniciativa'\)/g;

/** La recarga de `/mesa/` que hace que la página lea el almacén ya vacío. */
const RECARGA = /await\s+ir\(mesa,\s*`\$\{BASE\}\/mesa\/`\)/;

/** Tapa un trozo con espacios, para que deje de contar sin mover las posiciones. */
const tapar = (trozo) => trozo.replace(/[^\n]/g, " ");

/** Número de línea de una posición del fuente, contando desde 1. */
function linea(fuente, posicion) {
  return fuente.slice(0, posicion).split("\n").length;
}

/**
 * Analiza el fuente del humo y devuelve los problemas encontrados.
 *
 * Devuelve una lista vacía cuando la cadena de escenarios empieza con el
 * almacén vacío, la receta recarga la página y la sección no deja combate al
 * terminar.
 */
function analizar(fuente) {
  const problemas = [];
  const desde = fuente.indexOf(DESDE);
  const hasta = fuente.indexOf(HASTA);
  if (desde < 0 || hasta <= desde) {
    return ["no se encuentra la sección de iniciativa del humo (¿cambió de forma?)"];
  }

  // La receta nombra la clave igual que un caso: se tapa para no contarla como
  // si fuera una limpieza hecha. Su cuerpo se mira aparte.
  const receta = RECETA.exec(fuente);
  let texto = fuente;
  if (receta) {
    const cuerpo = receta[0];
    if (!/localStorage\.removeItem\('taberna:iniciativa'\)/.test(cuerpo)) {
      problemas.push(`la receta de limpieza no borra taberna:iniciativa (línea ${linea(fuente, receta.index)})`);
    }
    if (!RECARGA.test(cuerpo)) {
      problemas.push(
        `la receta de limpieza no recarga /mesa/, así que la página sigue con el combate viejo en pantalla (línea ${linea(fuente, receta.index)})`,
      );
    }
    texto = fuente.slice(0, receta.index) + tapar(cuerpo) + fuente.slice(receta.index + cuerpo.length);
  }

  const marcas = [];
  for (const re of [SIEMBRA, LIMPIEZA]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(texto)) !== null) {
      if (m.index >= desde && m.index < hasta) {
        marcas.push({ posicion: m.index, tipo: re === SIEMBRA ? "siembra" : "limpieza" });
      }
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }
  marcas.sort((a, b) => a.posicion - b.posicion);

  const siembras = marcas.filter((m) => m.tipo === "siembra");
  const limpiezas = marcas.filter((m) => m.tipo === "limpieza");
  if (siembras.length === 0) {
    problemas.push("la sección de iniciativa no siembra ningún combate: el análisis se ha quedado sin nada que mirar");
    return problemas;
  }

  const primera = siembras[0];
  const ultima = siembras[siembras.length - 1];
  if (!limpiezas.some((l) => l.posicion < primera.posicion)) {
    problemas.push(
      `el primer «Añadir» (línea ${linea(fuente, primera.posicion)}) siembra sobre el almacén que dejó la pasada anterior: falta vaciar taberna:iniciativa antes, o las filas viejas se cuelan en las comprobaciones`,
    );
  }
  if (!limpiezas.some((l) => l.posicion > ultima.posicion)) {
    problemas.push(
      `la sección deja un combate sembrado al terminar (último «Añadir», línea ${linea(fuente, ultima.posicion)}): la pasada siguiente empieza con filas que no son suyas`,
    );
  }

  return problemas;
}

const fuente = fs.readFileSync(FICHERO, "utf8");
const resultados = [];
const comprobar = (nombre, condicion, detalle = "") => {
  resultados.push({ ok: Boolean(condicion), nombre, detalle: condicion ? "" : String(detalle) });
};

// 1. El humo de hoy: la sección de iniciativa empieza y acaba con el almacén vacío.
const problemas = analizar(fuente);
comprobar(
  "la sección de iniciativa vacía el almacén antes de sembrar y no deja combate al terminar",
  problemas.length === 0,
  problemas.join(" · "),
);

// 2. Autocomprobación: sin la primera limpieza, el análisis tiene que cantarlo.
const primeraLimpieza = fuente.indexOf("await limpiarCombate();");
comprobar(
  "el humo llama a la receta de limpieza",
  primeraLimpieza > 0,
  "la sección de iniciativa no llama a limpiarCombate()",
);
if (primeraLimpieza > 0) {
  const llamado = "await limpiarCombate();";
  const sinPrimera = fuente.slice(0, primeraLimpieza) + tapar(llamado) + fuente.slice(primeraLimpieza + llamado.length);
  const canta = analizar(sinPrimera);
  comprobar(
    "quitar la primera limpieza pone la puerta en rojo",
    canta.some((p) => /siembra sobre el almacén que dejó la pasada anterior/.test(p)),
    JSON.stringify(canta),
  );
}

// 3. Autocomprobación: una receta que no recarga la página no vale.
const receta = RECETA.exec(fuente);
comprobar("el humo tiene la receta de limpieza", Boolean(receta), "no hay limpiarCombate() en tools/test/humo.mjs");
if (receta) {
  const cuerpo = receta[0];
  const recarga = RECARGA.exec(cuerpo);
  comprobar("la receta de limpieza recarga /mesa/", Boolean(recarga), cuerpo);
  if (recarga) {
    const desdeRecarga = receta.index + recarga.index;
    const sinRecarga =
      fuente.slice(0, desdeRecarga) +
      tapar(recarga[0]) +
      fuente.slice(desdeRecarga + recarga[0].length);
    const canta = analizar(sinRecarga);
    comprobar(
      "una receta sin recarga pone la puerta en rojo",
      canta.some((p) => /no recarga \/mesa\//.test(p)),
      JSON.stringify(canta),
    );
  }
  const borrado = /localStorage\.removeItem\('taberna:iniciativa'\)/.exec(cuerpo);
  if (borrado) {
    const desdeBorrado = receta.index + borrado.index;
    const sinBorrar =
      fuente.slice(0, desdeBorrado) + tapar(borrado[0]) + fuente.slice(desdeBorrado + borrado[0].length);
    const canta = analizar(sinBorrar);
    comprobar(
      "una receta que no borra la clave pone la puerta en rojo",
      canta.some((p) => /no borra taberna:iniciativa/.test(p)),
      JSON.stringify(canta),
    );
  }
}

// 4. Autocomprobación: la sección no puede terminar con un combate sembrado.
const ultimaLimpieza = fuente.lastIndexOf("await limpiarCombate();");
if (ultimaLimpieza > 0) {
  const llamado = "await limpiarCombate();";
  const sinFinal = fuente.slice(0, ultimaLimpieza) + tapar(llamado) + fuente.slice(ultimaLimpieza + llamado.length);
  const canta = analizar(sinFinal);
  comprobar(
    "quitar la limpieza final pone la puerta en rojo",
    canta.some((p) => /deja un combate sembrado al terminar/.test(p)),
    JSON.stringify(canta),
  );
}

for (const r of resultados) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.nombre}${r.detalle && !r.ok ? ` — ${r.detalle}` : ""}`);
}
const malos = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - malos}/${resultados.length} comprobaciones correctas`);
process.exit(malos ? 1 : 0);
