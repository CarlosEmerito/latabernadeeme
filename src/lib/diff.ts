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
 *
 * Los apartados se emparejan por su nombre, no por su número de nivel: el 5.2.1
 * renombró medio SRD y cambió el nivel de varios rasgos, así que comparar
 * «(nivel 3)» emparejaba apartados que no tienen nada que ver («Senda
 * Primordial» con «Subclase de bárbaro») y dejaba sin comparar el que sí
 * correspondía. Y dos apartados que no se corresponden no se emparejan: es
 * mejor que cada uno salga con su nota de «solo en el 5.1» o «solo en el 5.2.1»
 * que un emparejamiento falso que oculta los dos nombres.
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

/** El paréntesis de niveles de un apartado: «(nivel 3)» o «(niveles 9, 13 y 17)». */
const NIVELES = /\((?:nivel|niveles)\s+([^)]*)\)/i;

interface Apartado {
  /** El nombre del apartado, sin el paréntesis de niveles. */
  nombre: string;
  /** Los niveles que declara, si declara alguno. */
  niveles: Set<string> | null;
}

/** Descompone el título de un apartado en su nombre y sus niveles. */
function desglosarApartado(bloque: string): Apartado {
  const texto = bloque.replace(/^#{1,6}\s*/, "").trim();
  const encontrado = NIVELES.exec(texto);
  const nombre = texto.replace(encontrado ? encontrado[0] : "", "").trim();
  const numeros = encontrado ? (encontrado[1].match(/\d+/g) ?? []) : [];
  return { nombre, niveles: numeros.length > 0 ? new Set(numeros) : null };
}

/**
 * Similitud entre dos apartados: por su nombre, con el nivel como filtro.
 *
 * El nombre es lo que hace que dos apartados sean el mismo («Furia
 * (nivel 1)» en las dos ediciones). El nivel solo sirve para descartar: si los
 * dos declaran niveles y no comparten ninguno, no son el mismo apartado, aunque
 * sus nombres se parezcan. Sin ese filtro, «Furia (nivel 1)» del 5.1 se
 * emparejaba con «Furia (nivel 11)» del 5.2.1 —que es otro rasgo— y el nombre
 * del 5.2.1 desaparecía de la página.
 */
function similitudApartado(a: string, b: string): number {
  const A = desglosarApartado(a);
  const B = desglosarApartado(b);
  if (A.niveles && B.niveles) {
    let comunes = 0;
    for (const n of A.niveles) if (B.niveles.has(n)) comunes++;
    if (comunes === 0) return 0;
  }
  if (normalizar(A.nombre) === normalizar(B.nombre)) return 1;
  const pa = palabras(A.nombre);
  const pb = palabras(B.nombre);
  if (!pa.size || !pb.size) return 0;
  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes++;
  return (2 * comunes) / (pa.size + pb.size);
}

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

const esTitulo = (s: string) => /^#{1,6}\s/.test(s);

/**
 * Parte el texto en bloques y separa un encabezado de su párrafo.
 *
 * En el markdown del SRD hay apartados en los que el encabezado va pegado al
 * párrafo que lo explica, sin línea en blanco entre medias: «#### Frenesí
 * (nivel 3)» seguido de su descripción. Como bloque único, el párrafo no se
 * podía alinear con nada y su texto no llegaba a la página de comparación: el
 * apartado salía con su nombre y el texto, que lo explica, desaparecía.
 */
export function bloques(texto: string): string[] {
  const brutos = texto
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const salida: string[] = [];
  for (const bruto of brutos) {
    if (!esTitulo(bruto)) {
      salida.push(bruto);
      continue;
    }
    const lineas = bruto.split("\n");
    salida.push(lineas[0].trim());
    const resto = lineas.slice(1).join("\n").trim();
    if (resto) salida.push(resto);
  }
  return salida;
}

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
 *
 * Dos apartados se emparejan por su nombre (`similitudApartado`), no por el
 * puntaje genérico: así «Furia (nivel 1)» del 5.1 y «Furia (nivel 11)» del
 * 5.2.1 dejan de emparejarse —son rasgos distintos— y cada uno sale con su
 * nota. Y si dos apartados tienen el mismo nombre pero niveles que no se
 * tocan, tampoco son el mismo.
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
      const dosApartados = esTitulo(A[i - 1]) && esTitulo(B[j - 1]);
      const s = !mismoTipo ? 0 : dosApartados ? similitudApartado(A[i - 1], B[j - 1]) : similitud(A[i - 1], B[j - 1]);
      // Un encabezado y un párrafo no son el mismo bloque: la diagonal no vale
      // y el emparejamiento se descarta por completo, sin puntaje. Antes valía
      // -1.2, que es exactamente lo que cuestan los dos huecos, y el empate
      // se resolvía a favor de la diagonal: el título se emparejaba con el
      // párrafo de al lado.
      //
      // Dos apartados que no se corresponden tampoco se emparejan: la diagonal
      // vale menos que los dos huecos juntos, así que cada uno sale como
      // bloque propio con su nota de «solo en el 5.1» o «solo en el 5.2.1».
      const diagonal = !mismoTipo
        ? Number.NEGATIVE_INFINITY
        : dosApartados
          ? s >= UMBRAL
            ? S[i - 1][j - 1] + s
            : S[i - 1][j - 1] - 1.3
          : S[i - 1][j - 1] + (s >= UMBRAL ? s : -1);
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
