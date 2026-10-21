/**
 * El tamaño de una criatura en una sola forma canónica.
 *
 * El SRD trae el tamaño con la concordancia del original: la misma criatura es
 * «Mediano» o «Mediana» según cómo venga la línea del PDF («Humanoide Mediano o
 * Pequeño», «Monstruosidad Mediana o Pequeña»), y en el catálogo conviven
 * Diminuto con Diminuta, Pequeño con Pequeña, Mediano con Mediana y
 * Gargantuesco con Gargantuesca. Publicado tal cual, el filtro Tamaño del
 * bestiario salía con diez casillas —una por grafía— y quien marcaba «Mediano»
 * se dejaba fuera 39 de las 126 criaturas medianas, porque las otras 39 estaban
 * en la casilla «Mediana».
 *
 * Aquí se agrupan las dos formas en la masculina, que es la de la tabla de
 * tamaños, y se parte el tamaño alternativo: «Mediano o Pequeño» son dos
 * tamaños y una criatura que puede ser cualquiera de los dos tiene que salir al
 * filtrar por uno y por el otro. Lo que no se reconoce se devuelve tal cual, de
 * modo que un tamaño nuevo del SRD aparezca en el filtro en vez de desaparecer.
 *
 * Lo que se agrupa es la faceta, no lo que se enseña: la celda de la tabla y la
 * ficha conservan la palabra del original.
 */
import { plegar } from "./texto.ts";

/** Los tamaños del SRD de menor a mayor; es también el orden del filtro. */
export const TAMANOS = ["Diminuto", "Pequeño", "Mediano", "Grande", "Enorme", "Gargantuesco", "Gigante"] as const;

/** Las formas que usa el corpus, con su tamaño canónico. Las claves van plegadas. */
const CANONICOS: Record<string, string> = {
  diminuto: "Diminuto",
  diminuta: "Diminuto",
  pequeno: "Pequeño",
  pequena: "Pequeño",
  mediano: "Mediano",
  mediana: "Mediano",
  grande: "Grande",
  enorme: "Enorme",
  gargantuesco: "Gargantuesco",
  gargantuesca: "Gargantuesco",
  gigante: "Gigante",
};

/** Posición en la tabla de tamaños; lo que no está, detrás y por orden alfabético. */
const posicion = (tamano: string) => {
  const i = (TAMANOS as readonly string[]).indexOf(tamano);
  return i === -1 ? TAMANOS.length : i;
};

/**
 * Los tamaños de un valor del frontmatter: canónicos, sin repetir y ordenados.
 *
 * `«Mediana»` → `["Mediano"]` · `«Mediano o Pequeño»` → `["Mediano", "Pequeño"]`
 * · `«Mediano o Pequeño (mago)»` → `["Mediano", "Pequeño"]` · vacío → `[]`.
 */
export function tamanosDe(tamano: unknown): string[] {
  const texto = String(tamano ?? "").trim();
  if (!texto) return [];
  const salida: string[] = [];
  // El tamaño alternativo llega unido por «o» (o «u» ante palabra que empieza
  // por o-); el paréntesis que lo sigue es una aclaración —«o Pequeño (mago)»—
  // y no forma parte del tamaño.
  for (const trozo of texto.split(/\s+[ou]\s+/i)) {
    const limpio = trozo.trim().replace(/\s*\([^)]*\)\s*$/, "");
    if (!limpio) continue;
    const canonico = CANONICOS[plegar(limpio)] ?? limpio;
    if (!salida.includes(canonico)) salida.push(canonico);
  }
  return salida.sort((a, b) => posicion(a) - posicion(b) || a.localeCompare(b, "es"));
}
