/**
 * Buscar una criatura del catálogo por su nombre, con la grafía que sea.
 *
 * El catálogo publica los nombres como los escribe el manual («Águila»,
 * «Aparición», «Araña de fase»), pero nadie teclea tildes en el buscador de una
 * mesa: `type=search` no las pide y el teclado del móvil tampoco las ofrece. La
 * comparación tiene que plegar los diacríticos de los dos lados, como hace el
 * resto del sitio con `plegar()` —el filtro de los listados, `slugify` y el
 * buscador—; quedarse en `toLowerCase()` era creer que minúsculas y grafía sin
 * tilde son lo mismo.
 *
 * La búsqueda es exacta (nada de «contiene») a propósito: esta herramienta
 * reescala la criatura que el lector nombra, así que devolver la primera
 * parecida de una lista sería escalar otra. Quien escribe «dragon» y hay tres
 * dragones no recibe ninguno, y el mensaje de la herramienta lo dice.
 */
import { plegar } from "./texto.ts";

/** Lo único que la búsqueda necesita de una criatura: su nombre. */
export type ConNombre = { n: string };

/**
 * La criatura del catálogo cuyo nombre coincide con `texto`, sin importar
 * tildes ni mayúsculas.
 *
 * Devuelve `null` si el texto viene vacío o si ninguna criatura se llama así.
 */
export function buscarPorNombre<T extends ConNombre>(catalogo: readonly T[], texto: string): T | null {
  const buscado = plegar(texto.trim());
  if (!buscado) return null;
  return catalogo.find((x) => plegar(x.n) === buscado) ?? null;
}
