/**
 * PX de una criatura, ya en número.
 *
 * El SRD escribe el PX en el frontmatter con separador de millar y, en las
 * criaturas con guarida, con un segundo valor: «18 000 PX», «50 000 PX o
 * 62 000 en la guarida; BC +7». Quedarse con el primer grupo de dígitos
 * convierte 18 000 en 18, así que aquí se toma el valor base —lo que va antes
 * del primer «PX»— y se quitan los separadores (espacios, puntos, comas y
 * espacios finos) antes de convertir.
 */
export function xpNumerico(xp: unknown): number {
  const texto = String(xp ?? "");
  const corte = texto.search(/PX/i);
  const base = corte === -1 ? texto : texto.slice(0, corte);
  const digitos = base.replace(/\D/g, "");
  if (!digitos) return 0;
  const n = Number.parseInt(digitos, 10);
  return Number.isFinite(n) ? n : 0;
}
