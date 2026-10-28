/**
 * Traducción de los dos modos en que una petición no llega, para la herramienta
 * de Commander.
 *
 * Un `fetch` que se queda colgado —una red móvil que corta sin cerrar, una wifi
 * que pierde paquetes, un proxy que acepta la conexión y no contesta— no rechaza
 * nunca, así que sin plazo la promesa no vuelve y la página se queda en
 * «Resolviendo…» o en «Analizando el mazo con Gemini…» para siempre. Y un
 * `fetch` que no sale rechaza con el mensaje del navegador, en inglés y sin
 * decir de quién es el fallo: «TypeError: Failed to fetch» en Chrome,
 * «NetworkError when attempting to fetch resource.» en Firefox. Aquí se ponen
 * los dos techos a la vez —el del plazo y el del rechazo— y se traducen a un
 * mensaje en español que nombra la fuente y dice qué puede hacer el lector.
 *
 * El resto de fallos (404, 429, 500, un cuerpo que no es JSON) salen tal cual,
 * con el mensaje que ya traían: quien sabe qué ha pasado es el que llama, que
 * conoce el código de estado y la respuesta.
 */

/** «15 s» o «800 ms», para el mensaje de error. */
function enSegundos(ms: number): string {
  return ms >= 1000 ? `${Math.round(ms / 1000)} s` : `${ms} ms`;
}

/**
 * ¿El fallo es de la red y no de la respuesta? Un `fetch` que no llega rechaza
 * con `TypeError` según la especificación; el texto cambia por navegador
 * (Chrome, Firefox, Safari, el `fetch` de Node), así que se mira también por si
 * el error viene de otra implementación.
 */
function esFalloDeRed(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const texto = String((error as { message?: unknown })?.message ?? error ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(
    texto,
  );
}

/**
 * Llama a `peticion` con una señal que se aborta al vencer `plazoMs`. Se cambia
 * el error por uno que lo explica solo cuando lo que ha fallado es el reloj o la
 * conexión: un error HTTP anterior al plazo no se disfraza de lentitud ni de red.
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
    if (esFalloDeRed(error)) {
      throw new Error(
        `No se ha podido conectar con ${fuente}. Comprueba tu conexión a internet y vuelve a intentarlo.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(reloj);
  }
}
