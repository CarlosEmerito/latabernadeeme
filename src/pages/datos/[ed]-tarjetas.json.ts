import type { APIRoute } from "astro";
import { EDICIONES, cargar, type Edition, type Tipo } from "../../lib/content";

/**
 * Índice delgado para las tarjetas emergentes de los enlaces con `data-tarjeta`.
 *
 * La tarjeta enseña el nombre y tres o cuatro datos del perfil, y para eso
 * descargaba `/datos/<ed>.json` entero —323 150 B en el 5.2.1, 302 778 B en el
 * 5.1—: el mismo fichero que usan las herramientas de `/mesa/` y quien lo
 * consuma de fuera, que sigue publicado igual. Aquí va solo lo que pinta
 * `pintar()` de `Base.astro`:
 *
 *   { v: 1, ed, campos: { <tipo>: [campo, …] }, textos: [ … ], <tipo>: { <slug>: [ … ] } }
 *
 * `campos` dice en qué orden vienen los valores de cada fila, así que la tarjeta
 * no tiene que saberse el formato para leerlo. Los valores de texto —escuela,
 * tiempo, alcance, duración, tamaño, tipo, VD, CA, PG— se repiten mucho entre
 * fichas, así que van a `textos` y la fila guarda su índice **en negativo**
 * (`-índice - 1`): «Instantáneo» ocupa una vez y no noventa. Los números —el
 * nivel del conjuro— van tal cual, y las cadenas vacías se quedan vacías, que
 * ocupan menos que una referencia.
 *
 * Los dos tipos que se publican son los que llevan `data-tarjeta` en el cuerpo
 * de las fichas (`enlazarConjuros` de `src/lib/content.ts`). Si algún día se
 * enlazan objetos, hay que añadirlos aquí; la puerta `tools/test/tarjetas.mjs`
 * falla si un enlace publicado se queda sin fila.
 */
export function getStaticPaths() {
  return (["5e", "5.5"] as Edition[]).map((ed) => ({ params: { ed } }));
}

/** Los datos que la tarjeta pinta de cada tipo, en el orden de la fila. */
const CAMPOS: Partial<Record<Tipo, readonly string[]>> = {
  conjuros: ["nombre", "nivel", "escuela", "tiempo", "alcance", "duracion"],
  monstruos: ["nombre", "tamano", "tipo", "vd", "ca", "pg"],
};

/** La fila de una entrada, con los mismos valores que publica `/datos/<ed>.json`. */
function filaDe(tipo: Tipo, d: Record<string, any>): (string | number)[] {
  if (tipo === "conjuros") {
    return [
      String(d.name ?? ""),
      Number(d.level ?? 0),
      String(d.school ?? ""),
      String(d.castingTime ?? ""),
      String(d.range ?? ""),
      String(d.duration ?? ""),
    ];
  }
  return [
    String(d.name ?? ""),
    String(d.size ?? ""),
    String(d.type ?? ""),
    String(d.cr ?? ""),
    String(d.ac ?? ""),
    String(d.hp ?? ""),
  ];
}

export const GET: APIRoute = ({ params }) => {
  const ed = params.ed as Edition;
  const textos: string[] = [];
  const indiceDeTexto = new Map<string, number>();
  const referencia = (valor: string): string | number => {
    if (valor === "") return "";
    let i = indiceDeTexto.get(valor);
    if (i === undefined) {
      i = textos.length;
      textos.push(valor);
      indiceDeTexto.set(valor, i);
    }
    return -i - 1;
  };

  const campos: Record<string, readonly string[]> = {};
  const secciones: Record<string, Record<string, (string | number)[]>> = {};
  for (const [tipo, lista] of Object.entries(CAMPOS)) {
    campos[tipo] = lista!;
    const seccion: Record<string, (string | number)[]> = {};
    for (const entrada of cargar(ed, tipo as Tipo)) {
      seccion[entrada.slug] = filaDe(tipo as Tipo, entrada.data).map((valor) =>
        typeof valor === "number" ? valor : referencia(valor),
      );
    }
    secciones[tipo] = seccion;
  }

  const cuerpo = JSON.stringify({ v: 1, ed, srd: EDICIONES[ed].srd, campos, textos, ...secciones });

  return new Response(cuerpo, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
