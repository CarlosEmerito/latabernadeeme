/**
 * El combate de iniciativa que comparten `/mesa/` y `/mesa/jugadores/`.
 *
 * Las dos páginas leen y escriben la misma clave de `localStorage`, así que la
 * forma del dato guardado es el contrato entre ellas: si una escribe algo que la
 * otra no sabe leer, la ventana de los jugadores pinta un combate que la mesa ya
 * no tiene. La lectura y la validación viven aquí para que sean una sola.
 *
 * Se valida porque lo guardado no es de fiar: lo escribe el navegador de
 * cualquiera, una versión anterior pudo dejarlo a medias y basta un `turno`
 * fuera de la lista para que ninguna fila salga marcada como la activa.
 */

/** Un combatiente tal y como se guarda: nombre visible e iniciativa ya tirada. */
export type Combatiente = { nombre: string; valor: number };

/** El combate listo para pintar: la lista ordenada y el turno dentro de ella. */
export type Iniciativa = { turno: number; lista: Combatiente[] };

/** Clave de `localStorage` del combate. La comparten las dos páginas. */
export const CLAVE_INICIATIVA = "taberna:iniciativa";

/**
 * Lee el combate guardado y lo devuelve listo para pintar, o `null` si no hay
 * ninguno que enseñar.
 *
 * `null` cubre la clave vacía, un JSON roto, una lista que no es una lista y una
 * lista sin ninguna entrada válida: en los cuatro casos lo honesto es «Sin
 * combate», no una pantalla a medias. Las entradas que no son un objeto con
 * `nombre` de texto y `valor` numérico se descartan una a una —una lista con un
 * hueco sigue sirviendo— y la que queda sale ordenada de mayor a menor
 * iniciativa, que es el orden en que se guardó y en el que se pinta. El turno
 * sale dentro de los límites de la lista, así que quien pinte no lo recorta.
 */
export function leerIniciativa(crudo: string | null): Iniciativa | null {
  if (!crudo) return null;

  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (!datos || typeof datos !== "object") return null;

  const { lista, turno } = datos as { lista?: unknown; turno?: unknown };
  if (!Array.isArray(lista)) return null;

  const combatientes = lista.filter(
    (c): c is Combatiente =>
      typeof c === "object" &&
      c !== null &&
      typeof (c as Combatiente).nombre === "string" &&
      Number.isFinite((c as Combatiente).valor),
  );
  if (!combatientes.length) return null;

  combatientes.sort((a, b) => b.valor - a.valor);
  const dentro = Number.isInteger(turno) && (turno as number) >= 0 && (turno as number) < combatientes.length;

  return { turno: dentro ? (turno as number) : 0, lista: combatientes };
}
