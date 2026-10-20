/**
 * Entero dentro de un rango, para los campos numéricos de las herramientas.
 *
 * `type=number` no impide teclear 0, 11, -3 o un decimal, y tampoco impide
 * dejar el campo vacío: `Number("")` es 0, así que un `?? 4` nunca actúa
 * porque `value` es la cadena vacía y no `null`. Aquí un campo vacío o no
 * numérico toma el valor por defecto y el resto se redondea y se acota, de
 * forma que quien use el resultado puede indexar con él sin comprobaciones
 * extra (un presupuesto de 0 convertía el ratio en Infinity y un nivel
 * decimal se salía de la tabla de umbrales).
 */
export function enteroEnRango(valor: unknown, porDefecto: number, min: number, max: number): number {
  const texto = String(valor ?? "").trim();
  if (!texto) return porDefecto;
  const n = Math.round(Number(texto));
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, n));
}
