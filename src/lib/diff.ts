/**
 * Alineación de dos textos por bloques.
 *
 * No es un diff de caracteres: empareja párrafos y encabezados, tolerando que la
 * redacción cambie (las dos ediciones están traducidas por separado). Dos bloques
 * se consideran «el mismo con cambios» cuando comparten al menos la mitad del
 * vocabulario; si no, van como bloques propios de cada lado.
 */

export type Estado = "igual" | "cambia" | "solo-izq" | "solo-der";

export interface Fila {
  izq?: string;
  der?: string;
  estado: Estado;
}

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9áéíóúñü\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const palabras = (s: string) => new Set(normalizar(s).split(" ").filter((p) => p.length > 2));

function similitud(a: string, b: string): number {
  if (a === b) return 1;
  const pa = palabras(a);
  const pb = palabras(b);
  if (!pa.size || !pb.size) return 0;
  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes++;
  return (2 * comunes) / (pa.size + pb.size);
}

export function bloques(texto: string): string[] {
  return texto
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/** Alineación global (Needleman-Wunsch) con coste de hueco bajo. */
export function alinear(izquierda: string, derecha: string): Fila[] {
  const A = bloques(izquierda);
  const B = bloques(derecha);
  const n = A.length;
  const m = B.length;
  const UMBRAL = 0.5;
  const HUECO = 0.55;

  // matriz de puntuación
  const S: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) S[i][0] = S[i - 1][0] - HUECO;
  for (let j = 1; j <= m; j++) S[0][j] = S[0][j - 1] - HUECO;

  const sim: number[][] = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = similitud(A[i - 1], B[j - 1]);
      sim[i - 1][j - 1] = s;
      const puntuacion = s >= UMBRAL ? s : -1;
      S[i][j] = Math.max(S[i - 1][j - 1] + puntuacion, S[i - 1][j] - HUECO, S[i][j - 1] - HUECO);
    }
  }

  const filas: Fila[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const s = sim[i - 1][j - 1];
      const puntuacion = s >= UMBRAL ? s : -1;
      if (Math.abs(S[i][j] - (S[i - 1][j - 1] + puntuacion)) < 1e-9) {
        filas.push({ izq: A[i - 1], der: B[j - 1], estado: A[i - 1] === B[j - 1] ? "igual" : "cambia" });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && Math.abs(S[i][j] - (S[i - 1][j] - HUECO)) < 1e-9) {
      filas.push({ izq: A[i - 1], estado: "solo-izq" });
      i--;
      continue;
    }
    filas.push({ der: B[j - 1], estado: "solo-der" });
    j--;
  }

  return filas.reverse();
}

export function resumen(filas: Fila[]) {
  const total = filas.length || 1;
  const iguales = filas.filter((f) => f.estado === "igual").length;
  return {
    iguales,
    cambian: filas.filter((f) => f.estado === "cambia").length,
    soloIzq: filas.filter((f) => f.estado === "solo-izq").length,
    soloDer: filas.filter((f) => f.estado === "solo-der").length,
    porcentaje: Math.round((iguales / total) * 100),
  };
}
