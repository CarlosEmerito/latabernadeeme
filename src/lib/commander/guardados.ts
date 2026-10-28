/**
 * Los mazos que el navegador guarda de la herramienta de Commander.
 *
 * `localStorage` no es de fiar: lo escribe una versión anterior de la página,
 * una pestaña que se cerró a medias o el lector a mano. `leerMazosGuardados` es
 * el único sitio que decide qué es un mazo guardado —igual que `leerIniciativa`
 * con el combate de `/mesa/`—, porque una entrada con la forma vieja tumbaba el
 * arranque de `/mtgcommander/` (`Cannot read properties of null (reading
 * 'nombre')`, `t.comandantes is not iterable`) y, como la entrada seguía en el
 * almacén, todos los guardados siguientes fallaban igual hasta que el lector
 * limpiaba a mano.
 *
 * Lo descartado no se reescribe: se ignora al leer, y el siguiente mazo que se
 * guarda deja en el almacén solo los que se pueden pintar.
 */
import type { CartaMazo, Mazo } from "./tipos.ts";

/**
 * La clave de los mazos guardados.
 *
 * Cambiarla deja huérfanos los mazos que la gente ya tiene en su navegador, y
 * eso no se nota en ningún otro sitio: la sección aparece vacía y nadie sabe
 * por qué.
 */
export const CLAVE_MAZOS = "taberna:commander:mazos";

/** Cuántos mazos caben en el almacén: cada uno lleva sus 100 cartas enteras. */
export const TOPE_MAZOS = 12;

/**
 * La lista que queda al guardar un mazo, y los que ha habido que dejar fuera.
 *
 * El tope no es un capricho —cada mazo guardado lleva las 100 cartas de
 * Scryfall enteras, cientos de KB—, pero el descarte no puede ser silencioso:
 * quien guarda el mazo número trece perdía el más antiguo sin un aviso y sin
 * que nada en la página dijera que había un tope. Por eso lo que sobra se
 * devuelve en vez de tirarse aquí: el texto que lo cuenta es cosa de la página,
 * y el descarte lo decide un solo sitio.
 *
 * Volver a guardar un mazo que ya estaba no descarta a nadie: sale de su sitio
 * y entra por delante.
 */
export function guardarEnLista(
  lista: Mazo[],
  mazo: Mazo,
  tope = TOPE_MAZOS,
): { mazos: Mazo[]; descartados: Mazo[] } {
  const resto = lista.filter((m) => m.id !== mazo.id);
  const todos = [mazo, ...resto];
  const mazos = todos.slice(0, tope);
  return { mazos, descartados: todos.slice(mazos.length) };
}

/**
 * Lo que se le dice al lector cuando su mazo no ha entrado por el tope, o la
 * cadena vacía si no ha salido ninguno.
 *
 * Va con el plural bien puesto y con los nombres entre comillas angulares: un
 * «ha salido «A», «B»» se lee como un error de la página, y el aviso tiene que
 * entenderse a la primera porque es el único momento en que el lector se
 * entera de que su mazo ya no está.
 */
export function mensajeDeDescartes(descartados: Mazo[], tope = TOPE_MAZOS): string {
  if (!descartados.length) return "";
  const nombres = descartados.map((m) => `«${m.nombre}»`);
  const enumerado =
    nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return `Solo se guardan los ${tope} mazos más recientes: ${nombres.length === 1 ? "ha" : "han"} salido ${enumerado}.`;
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

/**
 * Una carta que se puede pintar: cantidad, tablero y una carta con nombre. Sin
 * la carta no hay ficha que abrir y la rejilla revienta al pintar el nombre.
 */
function esCarta(valor: unknown): valor is CartaMazo {
  return (
    esObjeto(valor) &&
    typeof valor.cantidad === "number" &&
    Number.isFinite(valor.cantidad) &&
    typeof valor.tablero === "string" &&
    esObjeto(valor.carta) &&
    typeof valor.carta.name === "string" &&
    valor.carta.name.trim() !== ""
  );
}

/**
 * Las cartas que se pueden pintar de una lista guardada.
 *
 * Se cae la carta suelta, no el mazo: perder el mazo entero porque una entrada
 * de la lista vino a medias es peor que enseñarlo sin esa carta.
 */
function cartasDe(valor: unknown): CartaMazo[] {
  return Array.isArray(valor) ? valor.filter(esCarta) : [];
}

/**
 * Los mazos que se pueden pintar de lo que hay en el almacén, en su orden.
 *
 * Una entrada sin `id`, sin nombre, sin fecha legible o sin las dos listas de
 * cartas se descarta entera: es la forma vieja del formato y no hay con qué
 * pintarla. `fuente` y `noEncontradas` se normalizan porque el resto de la
 * página cuenta con ellas.
 */
export function leerMazosGuardados(crudo: string | null): Mazo[] {
  if (!crudo) return [];

  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return [];
  }
  if (!Array.isArray(datos)) return [];

  const mazos: Mazo[] = [];
  for (const entrada of datos) {
    if (!esObjeto(entrada)) continue;

    const { id, nombre, creado, fuente, comandantes, cartas, noEncontradas } = entrada;
    if (typeof id !== "string" || id.trim() === "") continue;
    if (typeof nombre !== "string" || nombre.trim() === "") continue;
    if (typeof creado !== "string" || Number.isNaN(Date.parse(creado))) continue;
    if (!Array.isArray(comandantes) || !Array.isArray(cartas)) continue;

    mazos.push({
      id,
      nombre,
      creado,
      fuente: fuente === "estatico" ? "estatico" : "export",
      comandantes: cartasDe(comandantes),
      cartas: cartasDe(cartas),
      noEncontradas: Array.isArray(noEncontradas)
        ? noEncontradas.filter((linea): linea is string => typeof linea === "string")
        : [],
    });
  }
  return mazos;
}
