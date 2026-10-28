/**
 * Comprueba que el filtro de nivel del humo espera al efecto y no a un reloj.
 *
 * La comprobación marcaba la casilla de nivel 3, despachaba el `change` y
 * esperaba 300 ms de reloj antes de contar las filas visibles. Quien filtra es
 * el `<script>` de `src/components/Tabla.astro`, así que en la primera pasada
 * sobre un perfil de Chrome recién creado —primer documento, módulo todavía sin
 * correr— el `change` llegaba antes de que el manejador estuviera enganchado y
 * el recuento salía igual que antes: «✗ filtro — {"antes":319,"despues":319,
 * "contador":"319 entradas"}» con el filtro funcionando, la misma pasada en
 * verde minutos después y sobre el mismo `dist/`. Es la misma familia que el
 * filtro Tamaño (T-0289) y el combate del humo (T-0354): una puerta que mide
 * con un reloj miente, y un rojo que no es del código enseña a ignorar el rojo.
 *
 * Lo que se vigila aquí es la estrategia de la comprobación, sin abrir Chrome,
 * como ya hacen `humo-espera.mjs` y `humo-limpieza.mjs`:
 *
 *   1. No hay una espera fija entre el despacho del `change` y el recuento.
 *   2. Se sondea el efecto —las filas visibles— hasta un techo, en vez de leer
 *      una sola vez.
 *   3. El sondeo vuelve a despachar el `change` en cada vuelta, que es lo único
 *      que salva el caso del módulo que aún no había enganchado el manejador.
 *   4. El rojo distingue las dos causas —el módulo no llegó a aplicar el filtro
 *      o lo aplica y no reduce las filas— con la señal que deja el propio
 *      módulo (el sello `[data-sel]` y la clase `activa` de la faceta), no con
 *      un «antes y después iguales» mudo.
 *
 * La puerta se autocomprueba: la forma vieja de la comprobación —el reloj de
 * 300 ms—, quitar el reintento del despacho y quitar la señal del módulo tienen
 * que ponerla en rojo. Sin eso, un día que el análisis no mire nada seguiría
 * saliendo en verde.
 *
 * Uso: node tools/test/humo-filtro.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "../verify/comun.mjs";

const FICHERO = path.join(RAIZ, "tools/test/humo.mjs");

/** Dónde empieza y acaba la comprobación del filtro de nivel en el humo. */
const DESDE = "const listado = await abrir(`${BASE}/5e/conjuros/`);";
const HASTA = "// El filtro Tamaño ofrece una casilla por tamaño";

/** La espera fija de reloj entre el despacho y el recuento: la que mentía. */
const RELOJ = /await new Promise\(\(r\) => setTimeout\(r, \d+\)\)/;

/** El sondeo: una promesa con temporizador propio, no una lectura suelta. */
const SONDEO = /new Promise\(/;

/** Cómo se cuentan las filas que quedan a la vista. */
const FILAS = /#cuerpo tr:not\(\[hidden\]\)/;

/** El despacho del `change` sobre la casilla de la faceta. */
const DESPACHO = /dispatchEvent\(\s*new Event\(\s*["']change["']/;

/** El techo del sondeo: un contador de vueltas o un plazo que lo corta. */
const TECHO = /(?:ticks|intentos|vueltas)\s*>=\s*\d+|clearInterval\(|Date\.now\(\)/;

/** La señal que deja el módulo de la tabla cuando aplica el filtro. */
const SENAL = /\[data-sel\]|classList\.contains\(\s*["']activa["']\s*\)/;

/** La forma vieja de la comprobación, para que la puerta demuestre que la ve. */
const VIEJO = `
  const antes = await evaluar(listado, \`document.querySelectorAll('#cuerpo tr:not([hidden])').length\`);
  await evaluar(listado, \`(() => { const c = [...document.querySelectorAll('[data-faceta="nivel"]')].find(x => x.value === '3'); c.checked = true; c.dispatchEvent(new Event('change', {bubbles:true})); })()\`);
  await new Promise((r) => setTimeout(r, 300));
  const despues = await evaluar(listado, \`document.querySelectorAll('#cuerpo tr:not([hidden])').length\`);
  if (antes > 300 && despues > 20 && despues < antes) console.log('ok');
  else console.log('filtro', JSON.stringify({ antes, despues }));
`;

/** Tapa un trozo con espacios, para que deje de contar sin mover las posiciones. */
const tapar = (trozo) => trozo.replace(/[^"\n]/g, " ");

/** Tapa todas las apariciones de un patrón: la señal y el techo tienen varias. */
const taparTodo = (texto, patron) => texto.replace(new RegExp(patron.source, "g"), (m) => tapar(m));

/** Número de línea de una posición del fuente, contando desde 1. */
function linea(fuente, posicion) {
  return fuente.slice(0, posicion).split("\n").length;
}

/**
 * Analiza la comprobación del filtro de nivel y devuelve los problemas.
 *
 * Recibe el trozo de fuente del humo que va del `abrir` del listado al filtro
 * Tamaño, así que sirve tanto para el fuente de hoy como para las variantes que
 * monta la autocomprobación.
 */
function analizar(trozo, fuente = trozo, desde = 0) {
  const problemas = [];
  if (!trozo.trim()) return ["no se encuentra la comprobación del filtro de nivel (¿cambió de forma?)"];

  // 1. Nada de medir con el reloj: el efecto se espera, no se cronometra.
  const reloj = RELOJ.exec(trozo);
  if (reloj) {
    problemas.push(
      `la comprobación espera a un reloj (${reloj[0]}) entre el despacho y el recuento: el módulo de la tabla puede no haber corrido todavía y el rojo es del reloj, no de la página (línea ${linea(fuente, desde + reloj.index)})`,
    );
  }

  // 2. Tiene que sondear el efecto hasta un techo.
  const sondeo = SONDEO.exec(trozo);
  if (!sondeo) {
    problemas.push("la comprobación lee las filas una sola vez: falta un sondeo del efecto con su techo");
  } else {
    const cuerpo = trozo.slice(sondeo.index);
    if (!FILAS.test(cuerpo)) {
      problemas.push("el sondeo no cuenta las filas visibles (#cuerpo tr:not([hidden])): no espera al efecto del filtro");
    }
    if (!TECHO.test(cuerpo)) {
      problemas.push("el sondeo no tiene techo: si el filtro no se aplica, la pasada se queda colgada");
    }
    // 3. Reintentar el despacho es lo que arregla el `change` que llega antes
    //    de que el módulo enganche el manejador.
    if (!DESPACHO.test(cuerpo)) {
      problemas.push(
        "el sondeo no vuelve a despachar el change: si el primero llegó antes de que el módulo enganchara el manejador, el filtro no se aplica nunca y el rojo culpa a la página",
      );
    }
    // 4. El rojo tiene que decir cuál de las dos causas es.
    if (!SENAL.test(cuerpo)) {
      problemas.push(
        "el sondeo no mira la señal del módulo (el sello [data-sel] o la clase activa de la faceta): el rojo no distingue «no ha enganchado» de «filtra y no reduce»",
      );
    }
    const motivos = [...cuerpo.matchAll(/fallo\(\s*["'`]filtro["'`]\s*,\s*([\s\S]{0,240}?)\);/g)].map((m) => m[1].trim());
    if (motivos.length < 2) {
      problemas.push(
        `la comprobación cierra con un solo mensaje de rojo (${motivos.length}): no dice si el módulo llegó a aplicar el filtro`,
      );
    } else if (motivos[0] === motivos[1]) {
      problemas.push("los dos rojos del filtro dicen lo mismo: no separan las dos causas");
    }
  }

  return problemas;
}

const fuente = fs.readFileSync(FICHERO, "utf8");
const desde = fuente.indexOf(DESDE);
const hasta = fuente.indexOf(HASTA);
const trozo = desde >= 0 && hasta > desde ? fuente.slice(desde, hasta) : "";

const resultados = [];
const comprobar = (nombre, condicion, detalle = "") => {
  resultados.push({ ok: Boolean(condicion), nombre, detalle: condicion ? "" : String(detalle) });
};

// 1. El humo de hoy: la comprobación del filtro espera al efecto, reintenta el
//    despacho y distingue las dos causas en el rojo.
comprobar("se encuentra la comprobación del filtro de nivel", trozo.length > 0, "¿cambió de forma en tools/test/humo.mjs?");
const problemas = analizar(trozo, fuente, Math.max(desde, 0));
comprobar(
  "el filtro de nivel sondea el efecto (con reintento y techo) en vez de esperar a un reloj",
  problemas.length === 0,
  problemas.join(" · "),
);

// 2. Autocomprobación: la forma vieja —300 ms de reloj y una sola lectura— tiene
//    que salir en rojo, y por el reloj.
const viejos = analizar(VIEJO);
comprobar(
  "la forma vieja de la comprobación (reloj de 300 ms) pone la puerta en rojo",
  viejos.some((p) => /espera a un reloj/.test(p)),
  JSON.stringify(viejos),
);
comprobar(
  "la forma vieja tampoco distingue las dos causas del rojo",
  viejos.some((p) => /no mira la señal del módulo/.test(p)),
  JSON.stringify(viejos),
);

// 3. Autocomprobación: sin el reintento del despacho dentro del sondeo, la
//    puerta lo canta. Es el caso que dejaba el rojo espurio en frío.
if (trozo.length > 0) {
  const despachos = [...trozo.matchAll(new RegExp(DESPACHO.source, "g"))].map((m) => m.index);
  comprobar("el sondeo despacha el change", despachos.length >= 1, "no hay ningún dispatchEvent del change");
  if (despachos.length >= 1) {
    // Se tapa el último despacho, que es el que repite dentro del sondeo.
    const ultimo = despachos[despachos.length - 1];
    const orden = /dispatchEvent\([^)]*\)/.exec(trozo.slice(ultimo))?.[0] ?? "";
    const sinReintento = trozo.slice(0, ultimo) + tapar(orden) + trozo.slice(ultimo + orden.length);
    const canta = analizar(sinReintento);
    comprobar(
      "quitar el reintento del despacho pone la puerta en rojo",
      canta.some((p) => /no vuelve a despachar el change/.test(p)),
      JSON.stringify(canta),
    );
  }

  // 4. Autocomprobación: sin la señal del módulo no se puede decir cuál de las
  //    dos causas es.
  const senal = SENAL.exec(trozo);
  comprobar("el sondeo mira la señal del módulo", Boolean(senal), "no hay [data-sel] ni «activa»");
  if (senal) {
    // La señal son dos cosas —el sello y la clase—, así que se tapan las dos:
    // dejar una basta para que el análisis siga viendo de dónde viene el rojo.
    const canta = analizar(taparTodo(trozo, SENAL));
    comprobar(
      "quitar la señal del módulo pone la puerta en rojo",
      canta.some((p) => /no mira la señal del módulo/.test(p)),
      JSON.stringify(canta),
    );
  }

  // 5. Autocomprobación: sin techo, la puerta también lo canta.
  comprobar("el sondeo tiene techo", TECHO.test(trozo), "no hay contador de vueltas ni plazo que lo corte");
  const sinTecho = analizar(taparTodo(trozo, TECHO));
  comprobar(
    "quitar el techo del sondeo pone la puerta en rojo",
    sinTecho.some((p) => /no tiene techo/.test(p)),
    JSON.stringify(sinTecho),
  );
}

for (const r of resultados) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.nombre}${r.detalle && !r.ok ? ` — ${r.detalle}` : ""}`);
}
const malos = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - malos}/${resultados.length} comprobaciones correctas`);
process.exit(malos ? 1 : 0);
