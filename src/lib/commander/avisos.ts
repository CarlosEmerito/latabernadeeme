/**
 * El texto que el panel enseña cuando algo falla.
 *
 * `String(error)` de un `Error` devuelve «Error: » más el mensaje, así que el
 * nombre de una clase de JavaScript se publicaba delante de un texto escrito en
 * español que ya explicaba qué hacer y de quién era el fallo. Se lee el
 * `message`, que es lo que se redactó para el lector, y solo se recurre a
 * `String` cuando lo lanzado no es un `Error` (un rechazo con una cadena, por
 * ejemplo). Un fallo sin texto no deja el recuadro vacío: deja una frase que
 * dice qué puede hacer el lector.
 */
export function mensajeDeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "No se ha podido completar la operación. Vuelve a intentarlo.";
}
