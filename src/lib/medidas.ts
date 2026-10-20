/**
 * Cifras del SRD convertidas a una unidad común, para ordenar las tablas.
 *
 * Las columnas numéricas de los listados se ordenan comparando números, pero dos
 * de ellas mezclan unidades en la misma columna: Precio usa piezas de oro, plata
 * y cobre (188 filas en 5.2: 158 po, 18 pp y 11 pc) y Peso usa kilos y gramos
 * (9 filas en gramos entre 5.1 y 5.2). Un `parseFloat` del texto compara
 * magnitudes distintas —«5 pp» (medio oro) salía por encima de «1 po»— y corta
 * en el separador de millar: «40 000 po» valía 40, así que la Aeronave caía en
 * el puesto 152 de 188. Aquí cada unidad se convierte a la común (oro y kilos)
 * antes de comparar.
 */

/** Piezas de oro por unidad. La plata vale una décima, el cobre una centésima y el platino diez. */
const ORO_POR_UNIDAD: Record<string, number> = { po: 1, pp: 0.1, pc: 0.01, ppt: 10 };

/** Kilos por unidad. */
const KILOS_POR_UNIDAD: Record<string, number> = { kg: 1, g: 0.001 };

/**
 * «40 000», «1 500,5», «0,5»: quita el separador de millar —espacio normal, duro
 * o fino, y el punto cuando agrupa de tres en tres— y deja la coma como decimal.
 */
function cifra(texto: string): number {
  const limpio = texto
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}

/** Última palabra del texto si parece una unidad («po», «pp», «kg», «g»). */
function unidadDe(texto: string): string | undefined {
  return /([a-zá-ú]+)$/i.exec(texto)?.[1].toLowerCase();
}

/** Precio de una celda («5 pp», «40 000 po», «—») en piezas de oro. */
export function precioEnOro(precio: unknown): number {
  const texto = String(precio ?? "").trim();
  const unidad = unidadDe(texto);
  const factor = unidad ? ORO_POR_UNIDAD[unidad] : undefined;
  // Sin unidad conocida se lee el número tal cual, que es el oro por defecto.
  if (factor === undefined) return cifra(texto);
  return cifra(texto.slice(0, texto.length - unidad!.length)) * factor;
}

/** Peso de una celda («35 kg», «125 g», «—») en kilos. */
export function pesoEnKilos(peso: unknown): number {
  const texto = String(peso ?? "").trim();
  const unidad = unidadDe(texto);
  const factor = unidad ? KILOS_POR_UNIDAD[unidad] : undefined;
  if (factor === undefined) return cifra(texto);
  return cifra(texto.slice(0, texto.length - unidad!.length)) * factor;
}

/**
 * Valor con el que se ordena una celda numérica de las tablas de listado.
 *
 * Precio y Peso pasan por su unidad; el resto de columnas numéricas (Nivel, VD,
 * PG) ya vienen en una sola unidad y basta con leer el número, salvo los VD
 * fraccionarios («1/8», «1/4», «1/2»), que se leen como fracción porque
 * `parseFloat` los dejaría todos en 1 y el orden los empataría.
 */
export function valorDeOrden(clave: string, texto: string): number {
  if (clave === "precio") return precioEnOro(texto);
  if (clave === "peso") return pesoEnKilos(texto);
  const limpio = texto.trim().replace(",", ".");
  const fraccion = /^(\d+)\s*\/\s*(\d+)$/.exec(limpio);
  if (fraccion) {
    const denominador = Number(fraccion[2]);
    return denominador ? Number(fraccion[1]) / denominador : 0;
  }
  const n = Number.parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}
