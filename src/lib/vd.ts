/**
 * El VD de una criatura, para casar lo que teclea el lector con lo que publica
 * el catálogo.
 *
 * El catálogo escribe el VD como fracción siempre que es menor que 1 (`1/8`,
 * `1/4`, `1/2`: 78 de las 330 criaturas del 5.2.1), y `Number("1/2")` es `NaN`,
 * así que «Ajustar una criatura» no encontraba la media con la que escalar y le
 * echaba la culpa al catálogo: «no tiene ninguna criatura con VD 0.5» con 27
 * criaturas en VD 1/2. Lo que se compara es el valor, no el texto: `1/2`,
 * `0.5` y `0,5` son el mismo VD.
 */

/**
 * El valor numérico de un VD escrito a mano, o `null` si no es un VD.
 *
 * Acepta la fracción del catálogo (`1/8`), el decimal con punto o con coma
 * (`0.125`, `0,125`) y el entero (`5`). Ni signo ni exponente: un VD es una
 * cantidad del manual, no una expresión.
 */
export function valorVd(texto: string): number | null {
  const escrito = String(texto ?? "").trim();
  if (!escrito) return null;
  const fraccion = /^(\d+)\s*\/\s*(\d+)$/.exec(escrito);
  if (fraccion) {
    const denominador = Number(fraccion[2]);
    return denominador > 0 ? Number(fraccion[1]) / denominador : null;
  }
  if (!/^\d+(?:[.,]\d+)?$/.test(escrito)) return null;
  return Number(escrito.replace(",", "."));
}

/**
 * La clave del catálogo que corresponde a un VD escrito a mano.
 *
 * Las claves son las del catálogo tal cual (`0`, `1/8`, `5`…), que es lo que la
 * página usa para agrupar los perfiles. Devuelve `null` si ninguna vale ese VD,
 * que es el caso de `18` en el 5.2.1: la tabla salta del 17 al 19.
 */
export function claveVd(claves: Iterable<string>, texto: string): string | null {
  const valor = valorVd(texto);
  if (valor === null) return null;
  for (const clave of claves) {
    const suyo = valorVd(clave);
    if (suyo !== null && Math.abs(suyo - valor) < 1e-9) return clave;
  }
  return null;
}
