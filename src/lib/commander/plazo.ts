/**
 * Techo de tiempo para las peticiones de red de la herramienta de Commander.
 *
 * Un `fetch` que se queda colgado —una red móvil que corta sin cerrar, una wifi
 * que pierde paquetes, un proxy que acepta la conexión y no contesta— no rechaza
 * nunca, así que sin plazo la promesa no vuelve y la página se queda en
 * «Resolviendo…» o en «Analizando el mazo con Gemini…» para siempre. Aquí se
 * pone el techo y se traduce el vencimiento a un mensaje en español que nombra
 * la fuente y el plazo; el resto de fallos (404, 429, 500, red caída al
 * instante) salen tal cual, con el mensaje que ya tenían.
 */

/** «15 s» o «800 ms», para el mensaje de error. */
function enSegundos(ms: number): string {
  return ms >= 1000 ? `${Math.round(ms / 1000)} s` : `${ms} ms`;
}

/**
 * Llama a `peticion` con una señal que se aborta al vencer `plazoMs`. Solo si el
 * vencimiento es lo que corta se cambia el error por uno que lo explica: un
 * fallo anterior al plazo no se disfraza de lentitud.
 */
export async function conPlazo<T>(
  fuente: string,
  plazoMs: number,
  peticion: (senal: AbortSignal) => Promise<T>,
): Promise<T> {
  const control = new AbortController();
  let vencido = false;
  const reloj = setTimeout(() => {
    vencido = true;
    control.abort();
  }, plazoMs);
  try {
    return await peticion(control.signal);
  } catch (error) {
    if (vencido) {
      throw new Error(
        `${fuente} no ha contestado en ${enSegundos(plazoMs)}. Comprueba la conexión y vuelve a intentarlo.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(reloj);
  }
}
