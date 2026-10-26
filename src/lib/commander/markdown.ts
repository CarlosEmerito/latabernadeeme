/**
 * El texto que devuelve la IA, listo para pintar.
 *
 * `markdown-it` ya está en el proyecto y se configura sin HTML crudo: el modelo
 * no puede inyectar etiquetas. `sinIntroduccion` quita la primera frase de
 * relleno («¡Excelente elección de comandante!…») cuando el modelo la cuela
 * aunque se le pida ir al grano.
 */
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

/** Markdown a HTML seguro (sin HTML crudo). */
export function markdownDe(texto: string): string {
  return md.render(texto);
}

const SALUDOS =
  /^(¡|claro\b|por supuesto\b|excelente\b|buena elecci[oó]n\b|qu[eé] buena\b|vamos all[aá]\b|aqu[ií] tienes\b|con gusto\b)/i;

/**
 * Quita la introducción si el modelo la mete:
 *
 * - un saludo suelto como primer bloque;
 * - un primer párrafo de resumen («Este mazo es un potente arquetipo…») cuando
 *   el bloque siguiente ya es una sección con `#`.
 *
 * No toca nada si el texto empieza directamente por una sección o por una lista.
 */
export function sinIntroduccion(texto: string): string {
  const bloques = String(texto ?? "").trim().split(/\n\s*\n/);
  if (bloques.length < 2) return bloques.join("\n\n").trim();

  const primero = bloques[0].trim();
  const segundo = bloques[1].trim();
  const esSeccion = /^#{1,6}\s/.test(primero) || /^[-*]\s/.test(primero);
  const segundoEsSeccion = /^#{1,6}\s/.test(segundo);
  const esSaludo = SALUDOS.test(primero);
  const esResumen = segundoEsSeccion && primero.length < 600 && !esSeccion;

  if (!esSeccion && (esSaludo || esResumen)) {
    return bloques.slice(1).join("\n\n").trim();
  }
  return bloques.join("\n\n").trim();
}
