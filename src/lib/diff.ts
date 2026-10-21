/**
 * Alineación de dos textos por bloques.
 *
 * No es un diff de caracteres: empareja párrafos y encabezados, tolerando que la
 * redacción cambie (las dos ediciones están traducidas por separado). Dos bloques
 * se consideran «el mismo con cambios» cuando comparten al menos la mitad del
 * vocabulario; si no, van como bloques propios de cada lado.
 *
 * La alineación usa programación dinámica con punteros guardados: comparar
 * puntuaciones en coma flotante al reconstruir el camino falla por redondeo y
 * descoloca las filas, que es lo que hacía que un título acabara enfrente de un
 * párrafo y las columnas se vieran vacías.
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

const numeros = (s: string) => new Set(s.match(/\d+(?:[.,]\d+)?/g) ?? []);

/** Término inicial en negrita («**Carga.**»), que suele ser el nombre del rasgo. */
const termino = (s: string) => {
  const m = /^\*\*(.+?)\.?\*\*/.exec(s.trim());
  return m ? normalizar(m[1]) : "";
};

function similitud(a: string, b: string): number {
  if (normalizar(a) === normalizar(b)) return 1;
  const pa = palabras(a);
  const pb = palabras(b);
  if (!pa.size || !pb.size) return 0;
  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes++;
  const vocabulario = (2 * comunes) / (pa.size + pb.size);

  // Los números son la parte mecánica: dos bloques con el mismo +5 y el mismo
  // daño son el mismo rasgo aunque la redacción cambie por completo.
  const na = numeros(a);
  const nb = numeros(b);
  let mecanica = 0;
  if (na.size && nb.size) {
    let iguales = 0;
    for (const n of na) if (nb.has(n)) iguales++;
    mecanica = (2 * iguales) / (na.size + nb.size);
  }

  const ta = termino(a);
  const tb = termino(b);
  const bonus = ta && tb && ta === tb ? 0.3 : 0;

  return Math.min(1, 0.6 * vocabulario + 0.4 * mecanica + bonus);
}

export function bloques(texto: string): string[] {
  return texto
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}

const esTitulo = (s: string) => /^#{1,6}\s/.test(s);

/**
 * Alineación global con punteros: un título solo se empareja con un título.
 *
 * La restricción no es un detalle del puntaje sino de la estructura: un
 * encabezado nunca se empareja con un párrafo. Antes el cruce valía -1.2, el
 * mismo precio que saltarse los dos bloques (-0.6 por arriba y -0.6 por la
 * izquierda), y el empate se resolvía a favor de la diagonal, así que un
 * «## Acciones adicionales» que solo existe en el 5.2.1 salía enfrente del
 * párrafo de al lado como «reescrito» y se llevaba por delante la nota de que
 * el apartado es nuevo.
 */
export function alinear(izquierda: string, derecha: string): Fila[] {
  const A = bloques(izquierda);
  const B = bloques(derecha);
  const n = A.length;
  const m = B.length;
  const UMBRAL = 0.45;
  const HUECO = 0.6;

  const S: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const desde: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(-1));
  for (let i = 1; i <= n; i++) {
    S[i][0] = S[i - 1][0] - HUECO;
    desde[i][0] = 1; // venimos de arriba
  }
  for (let j = 1; j <= m; j++) {
    S[0][j] = S[0][j - 1] - HUECO;
    desde[0][j] = 2; // venimos de la izquierda
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const mismoTipo = esTitulo(A[i - 1]) === esTitulo(B[j - 1]);
      const s = mismoTipo ? similitud(A[i - 1], B[j - 1]) : 0;
      // Un encabezado y un párrafo no son el mismo bloque: la diagonal no vale
      // y el emparejamiento se descarta por completo, sin puntaje. Antes valía
      // -1.2, que es exactamente lo que cuestan los dos huecos, y el empate
      // se resolvía a favor de la diagonal: el título se emparejaba con el
      // párrafo de al lado.
      const diagonal = mismoTipo ? S[i - 1][j - 1] + (s >= UMBRAL ? s : -1) : Number.NEGATIVE_INFINITY;
      const arriba = S[i - 1][j] - HUECO;
      const izquierda2 = S[i][j - 1] - HUECO;

      if (diagonal >= arriba && diagonal >= izquierda2) {
        S[i][j] = diagonal;
        desde[i][j] = 0;
      } else if (izquierda2 >= arriba) {
        // Empate entre los dos huecos: se consume primero el bloque de la
        // derecha, así que en la tabla el bloque suelto de la izquierda sale
        // antes. Las columnas van 5.1 | 5.2.1 y lo que solo está en 2014 se
        // lee antes que lo que solo está en 2024.
        S[i][j] = izquierda2;
        desde[i][j] = 2;
      } else {
        S[i][j] = arriba;
        desde[i][j] = 1;
      }
    }
  }

  const filas: Fila[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const movimiento = i > 0 && j > 0 ? desde[i][j] : i > 0 ? 1 : 2;
    if (movimiento === 0) {
      filas.push({
        izq: A[i - 1],
        der: B[j - 1],
        estado: normalizar(A[i - 1]) === normalizar(B[j - 1]) ? "igual" : "cambia",
      });
      i--;
      j--;
    } else if (movimiento === 1) {
      filas.push({ izq: A[i - 1], estado: "solo-izq" });
      i--;
    } else {
      filas.push({ der: B[j - 1], estado: "solo-der" });
      j--;
    }
  }

  return filas.reverse().filter((f) => (f.izq ?? "") !== "" || (f.der ?? "") !== "");
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
