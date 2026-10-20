/**
 * Texto plegado para buscar y comparar: sin diacríticos y en minúsculas.
 *
 * Nadie escribe «dragón» en un buscador, y el teclado de un móvil tampoco
 * invita a ello. NFD separa cada letra de su signo y el rango U+0300–U+036F se
 * lleva por delante tildes, diéresis y virgulillas, así que «Dragón», «dragón»
 * y «dragon» acaban en la misma cadena. Es la pieza que comparten `slugify`
 * (identificadores de URL) y el filtro de texto de los listados.
 *
 * No se usa `toLocaleLowerCase("es")` a propósito: aquí solo importa que dos
 * grafías de la misma palabra coincidan, no las reglas de capitalización de un
 * idioma. Tampoco se pliegan las ligaduras («æ») porque el SRD en español no
 * las usa y cambiarlas alteraría nombres propios.
 */
export function plegar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
