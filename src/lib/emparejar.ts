/**
 * Emparejamiento de las entradas de las dos ediciones.
 *
 * El identificador de un fichero (`slug`) lo decide el orden de aparición en el
 * PDF, no el objeto: en el equipo del SRD 5.2.1 cambiaron el orden de las filas
 * de la tabla y los dos ficheros de la «Vara» se renumeraron. El slug `vara`
 * significa una cosa en el 5.1 —la varita de 1 kg— y otra en el 5.2.1 —la
 * pértiga de 3 m—, así que emparejar por identificador cruzaba dos objetos
 * distintos: `/comparar/equipo/vara/` se titulaba «Vara (3 m)» y comparaba la
 * varita de 2014 con la pértiga de 2024, y su única fila decía que la pértiga
 * era nueva en 2024 cuando en el 5.1 también estaba (pág. 71).
 *
 * El emparejamiento va, por tanto, por **identidad del objeto**: el nombre que
 * el SRD le da. El paréntesis final («Vara (3 m)») no es parte del nombre, es
 * la manera que tiene el SRD de separar dos objetos que se llaman igual, así que
 * se lee aparte: el nombre propio tiene que coincidir y lo que va detrás —con
 * paréntesis o sin ellos— es el desambiguador.
 *
 * El desambiguador puede ir con paréntesis en una edición y sin ellos en la
 * otra, y las dos escrituras son la misma entrada: el 5.1 llama «Alimento (por
 * día)» a lo que el 5.2 llama «Alimento por día». Por eso el nombre se reduce
 * siempre a su forma sin paréntesis —«alimento por dia» en los dos casos— y
 * esa es la clave que agrupa las entradas. «Vara» y «Vara (3 m)» siguen siendo
 * dos grupos distintos, porque la segunda no se puede reducir a «vara»: su
 * desambiguador («3 m») no aparece en el nombre de la primera.
 *
 * La categoría se usa como desempate, no como condición: el SRD reclasificó
 * «Red» de «Arma» a «Equipo de aventurero» y «Apresador» de dote sin categoría
 * a dote «General», y en los dos casos sigue siendo la misma entrada. Lo que
 * la categoría separa son los homónimos legítimos de dentro de una misma
 * edición —«Bastón» arma y «Bastón» canalizador arcano, «Competencia» de
 * características y del glosario—, que son objetos distintos.
 */

import { plegar } from "./texto.ts";
import type { Entrada } from "./content.ts";

export interface Par {
  /** La entrada del SRD 5.1 (2014). */
  a: Entrada;
  /** La entrada del SRD 5.2.1 (2024). */
  b: Entrada;
  /** Cómo se decidió el par. */
  via: "identidad" | "identificador";
}

/** El nombre propio y su desambiguador: «Vara (3 m)» → { nombre: "vara", desambiguador: "3 m" }. */
export interface NombreDesambiguado {
  nombre: string;
  desambiguador: string;
}

/** Compara dos nombres: sin tildes, en minúsculas y sin espacios de sobra. */
const comparable = (texto: string) => plegar(texto).replace(/\s+/g, " ").trim();

/** El paréntesis final del nombre, que es el desambiguador del SRD. */
const DESAMBIGUADOR = /\s*\(([^()]*)\)\s*$/;

/**
 * Separa el nombre propio de su desambiguador.
 *
 * Solo el paréntesis **final** cuenta: «Vara (3 m)» lleva el desambiguador
 * detrás, y un paréntesis en medio del nombre («Hoja de espada (grande)»)
 * forma parte de él. Un paréntesis vacío no desambigua nada.
 */
export function desambiguar(nombre: string): NombreDesambiguado {
  const texto = nombre.trim();
  const m = DESAMBIGUADOR.exec(texto);
  if (!m || !m[1].trim()) return { nombre: comparable(texto), desambiguador: "" };
  return {
    nombre: comparable(texto.slice(0, m.index)),
    desambiguador: comparable(m[1]),
  };
}

/**
 * El nombre reducido a su forma sin paréntesis.
 *
 * «Alimento (por día)» y «Alimento por día» dan las dos «alimento por dia»:
 * son la misma entrada con el desambiguador escrito de dos formas. «Vara» da
 * «vara» y «Vara (3 m)» da «vara 3 m», que son dos objetos distintos.
 */
function claveDeNombre(nombre: string): string {
  const { nombre: propio, desambiguador } = desambiguar(nombre);
  return desambiguador ? `${propio} ${desambiguador}` : propio;
}

/** La categoría de la entrada, comparable. */
const categoriaDe = (entrada: Entrada) => comparable(String(entrada.data.category ?? ""));

/** El nombre reducido de la entrada. */
const claveDe = (entrada: Entrada) => claveDeNombre(String(entrada.data.name ?? entrada.slug));

/**
 * ¿Son el mismo objeto las dos entradas?
 *
 * El nombre reducido tiene que coincidir: el 5.1 llama «Vara (3 m)» a la
 * pértiga y el 5.2.1 también, y el 5.2 titula «Alimento por día» lo que el 5.1
 * titula «Alimento (por día)». La categoría no decide: el SRD reclasificó
 * «Red» de «Arma» a «Equipo de aventurero» y sigue siendo la misma entrada.
 */
export function mismoObjeto(a: Entrada, b: Entrada): boolean {
  return claveDe(a) === claveDe(b);
}

/** Agrupa por nombre reducido, que es lo que hace a dos entradas homónimas. */
const agruparPorNombre = (entradas: Entrada[]) => {
  const grupos = new Map<string, Entrada[]>();
  for (const entrada of entradas) {
    const k = claveDe(entrada);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(entrada);
  }
  return grupos;
};

/**
 * Empareja las entradas de las dos ediciones de un tipo.
 *
 * Se empareja por identidad **antes** que por identificador a propósito: si se
 * hiciera al revés, `vara` (5.1) se llevaría por delante a `vara` (5.2.1) —la
 * pértiga— y la varita se quedaría sin pareja, que es exactamente el cruce que
 * había.
 *
 * Las entradas se agrupan por nombre reducido y, dentro de cada grupo, se
 * emparejan por categoría —que es lo que separa los homónimos—. Si dentro del
 * grupo queda una entrada en cada edición y ninguna más, se emparejan
 * también: el SRD cambió la categoría del objeto («Red», «Apresador») pero
 * sigue siendo la misma entrada.
 *
 * Lo que queda sin pareja se empareja por identificador: la entrada es la
 * misma en las dos ediciones aunque el SRD la titule de otra forma.
 */
export function emparejar(a: Entrada[], b: Entrada[]): Par[] {
  const pares: Par[] = [];
  const usadosB = new Set<string>();
  const emparejadosA = new Set<string>();

  const casar = (x: Entrada, y: Entrada, via: Par["via"]) => {
    if (emparejadosA.has(x.slug) || usadosB.has(y.slug)) return;
    usadosB.add(y.slug);
    emparejadosA.add(x.slug);
    pares.push({ a: x, b: y, via });
  };

  const gruposB = agruparPorNombre(b);
  for (const [nombre, grupoA] of agruparPorNombre(a)) {
    const grupoB = gruposB.get(nombre) ?? [];
    if (grupoB.length === 0) continue;

    // Por categoría: solo se casa cuando hay una entrada de cada lado, que es
    // lo que separa los homónimos de una misma carpeta.
    const porCategoria = new Map<string, Entrada[]>();
    for (const y of grupoB) {
      const k = categoriaDe(y);
      if (!porCategoria.has(k)) porCategoria.set(k, []);
      porCategoria.get(k)!.push(y);
    }
    for (const x of grupoA) {
      const lista = (porCategoria.get(categoriaDe(x)) ?? []).filter((y) => !usadosB.has(y.slug));
      if (lista.length === 1) casar(x, lista[0], "identidad");
    }

    // Lo que queda: una entrada en cada lado y ninguna más, así que es la
    // misma entrada con la categoría cambiada.
    const quedanA = grupoA.filter((x) => !emparejadosA.has(x.slug));
    const quedanB = grupoB.filter((y) => !usadosB.has(y.slug));
    if (quedanA.length === 1 && quedanB.length === 1) casar(quedanA[0], quedanB[0], "identidad");
  }

  // Lo que queda, por identificador.
  const porSlug = new Map(b.map((entrada) => [entrada.slug, entrada]));
  for (const x of a) {
    if (emparejadosA.has(x.slug)) continue;
    const y = porSlug.get(x.slug);
    if (y && !usadosB.has(y.slug)) casar(x, y, "identificador");
  }

  return pares;
}

/** El par de una entrada concreta, si lo hay. */
export function parDe(pares: Par[], slug: string, lado: "a" | "b"): Par | undefined {
  return pares.find((p) => (lado === "a" ? p.a : p.b).slug === slug);
}
