/**
 * Qué reglas del catálogo publica la pantalla del DM y en qué panel.
 *
 * La pantalla se construía con una lista fija de cinco categorías de 5.1 y un
 * `continue` que descartaba en silencio lo que no encajara: 28 de las 174
 * reglas del 5.2.1, y ninguna del glosario. El SRD de 2024 movió al glosario
 * casi todas las reglas de combate —«Iniciativa», «Ataques de oportunidad»,
 * «Concentración», «Cobertura», «Puntos de golpe», «Tirada de ataque»—, así
 * que la pantalla se quedó sin lo que un DM consulta con la partida en marcha
 * y el sitio seguía compilando.
 *
 * Aquí la lista es explícita y verificable:
 *
 *   - Las categorías del catálogo que tienen panel se publican **enteras**: no
 *     se eligen fichas sueltas dentro de una categoría.
 *   - Del glosario se publica una selección por `slug` —lo que se consulta en
 *     la mesa— y el resto se queda en el índice de reglas, que es lo que la
 *     pantalla dice en su pie.
 *   - Lo que el SRD añada mañana en una categoría nueva no se descarta: el
 *     módulo lanza y el build se para, porque una regla que desaparece sin
 *     decirlo es peor que una pantalla corta.
 *
 * El módulo no importa nada a propósito: lo carga la plantilla de Astro y
 * también `tools/test/`, donde Node ejecuta el TypeScript quitando los tipos
 * (un import relativo sin extensión moriría con `ERR_MODULE_NOT_FOUND`).
 */

export interface ReglaDePantalla {
  slug: string;
  data: Record<string, any>;
}

export interface PanelDePantalla<T extends ReglaDePantalla> {
  id: string;
  titulo: string;
  entradas: T[];
}

interface Definicion {
  /** Id estable: es lo que se guarda en `localStorage` y el `data-panel`. */
  id: string;
  titulo: string;
  /** Categorías del catálogo que este panel publica completas. */
  categorias: string[];
  /** Reglas del glosario que se suman al panel, por `slug`. */
  glosario: string[];
}

/** La categoría del glosario: la única que no se publica entera. */
const GLOSARIO = "Glosario";

const DEFINICIONES: Definicion[] = [
  {
    id: "combate",
    titulo: "Combate",
    categorias: ["Combate"],
    glosario: [
      "iniciativa",
      "sorpresa",
      "ataques-de-oportunidad",
      "accion",
      "accion-adicional",
      "reaccion",
      "preparar-una-accion",
      "atacar",
      "ataque-con-arma",
      "ataque-sin-armas",
      "ataque-de-conjuro",
      "tirada-de-ataque",
      "tirada-de-dano",
      "clase-de-armadura",
      "alcance",
      "area-de-efecto",
      "cobertura",
      "esconderse",
      "concentracion",
      "critico",
    ],
  },
  {
    id: "condiciones",
    titulo: "Condiciones",
    categorias: ["Condiciones"],
    glosario: [],
  },
  {
    id: "pruebas",
    titulo: "Pruebas y salvaciones",
    categorias: ["Características"],
    glosario: [
      "prueba-de-caracteristica",
      "clase-de-dificultad",
      "habilidad",
      "ventaja",
      "desventaja",
      "tirada-de-salvacion",
    ],
  },
  {
    id: "dano",
    titulo: "Daño, puntos de golpe y curación",
    categorias: [],
    glosario: [
      "dano",
      "tipos-de-dano",
      "umbral-de-dano",
      "puntos-de-golpe",
      "puntos-de-golpe-temporales",
      "dados-de-puntos-de-golpe",
      "tirada-de-salvacion-contra-muerte",
      "estable",
      "curacion",
      "resistencia",
      "vulnerabilidad",
      "inmunidad",
    ],
  },
  {
    id: "descanso",
    titulo: "Descanso",
    categorias: [],
    glosario: ["descanso-corto", "descanso-largo"],
  },
  {
    id: "exploracion",
    titulo: "Exploración",
    categorias: ["Exploración"],
    glosario: [
      "luz-brillante",
      "luz-tenue",
      "oscuridad",
      "terreno-dificil",
      "saltar",
      "trepar",
      "nadar",
      "caidas",
      "percepcion-pasiva",
    ],
  },
  {
    id: "peligros",
    titulo: "Peligros",
    categorias: ["Peligros"],
    glosario: [],
  },
  {
    id: "social",
    titulo: "Social",
    categorias: ["Social"],
    glosario: ["actitud", "amistosa", "hostil", "indiferente", "influir"],
  },
  {
    id: "basico",
    titulo: "El ritmo de juego",
    categorias: ["Básico"],
    glosario: [],
  },
];

const categoriaDe = (r: ReglaDePantalla) => String(r.data.category ?? "");

/**
 * Los paneles de la pantalla, con sus reglas ya resueltas contra el catálogo.
 *
 * Lanza si una regla del catálogo se queda sin panel, si un `slug` del
 * glosario no existe en el catálogo, si una regla sale en dos paneles o si un
 * panel se queda vacío: todo eso es drift entre el SRD y la pantalla, y el
 * build lo tiene que ver.
 */
export function panelesDe<T extends ReglaDePantalla>(reglas: T[]): PanelDePantalla<T>[] {
  const porSlug = new Map(reglas.map((r) => [r.slug, r]));
  const categorias = [...new Set(reglas.map(categoriaDe))];
  const conPanel = new Set(DEFINICIONES.flatMap((d) => d.categorias).concat(GLOSARIO));

  const huerfanas = categorias.filter((c) => !conPanel.has(c));
  if (huerfanas.length)
    throw new Error(
      `Categorías del catálogo sin panel en la pantalla: ${huerfanas.join(", ")}. ` +
        "Añade su panel en src/lib/pantalla.ts o publícala; no se descarta en silencio.",
    );

  const vistas = new Map<string, string>();
  const paneles = DEFINICIONES.map((def) => {
    const porCategoria = reglas.filter((r) => def.categorias.includes(categoriaDe(r)));
    const delGlosario = def.glosario.map((slug) => {
      const regla = porSlug.get(slug);
      if (!regla)
        throw new Error(
          `La regla «${slug}» del panel «${def.titulo}» no está en el catálogo: ` +
            "el slug está mal escrito o la regla ya no existe.",
        );
      if (categoriaDe(regla) !== GLOSARIO)
        throw new Error(
          `La regla «${slug}» del panel «${def.titulo}» pertenece a la categoría ` +
            `«${categoriaDe(regla)}», que ya se publica entera: quita el slug de la lista del glosario.`,
        );
      return regla;
    });

    const entradas = [...porCategoria, ...delGlosario];
    if (!entradas.length)
      throw new Error(`El panel «${def.titulo}» se ha quedado sin reglas: revisa el catálogo.`);

    for (const r of entradas) {
      const antes = vistas.get(r.slug);
      if (antes)
        throw new Error(`La regla «${r.slug}» sale en dos paneles («${antes}» y «${def.titulo}»).`);
      vistas.set(r.slug, def.titulo);
    }

    // Por slug: el orden no depende del idioma ni de la máquina que compila.
    entradas.sort((a, b) => a.slug.localeCompare(b.slug, "en"));
    return { id: def.id, titulo: def.titulo, entradas };
  });

  return paneles;
}

/**
 * Las reglas del catálogo que la pantalla no publica, que tienen que ser del
 * glosario: el índice de reglas las enseña todas y el pie de la pantalla dice
 * cuántas son. Cualquier otra es una categoría sin panel y lanza.
 */
export function fueraDePantalla<T extends ReglaDePantalla>(reglas: T[]): T[] {
  const dentro = new Set(panelesDe(reglas).flatMap((p) => p.entradas.map((r) => r.slug)));
  const fuera = reglas.filter((r) => !dentro.has(r.slug));
  const raras = fuera.filter((r) => categoriaDe(r) !== GLOSARIO);
  if (raras.length)
    throw new Error(
      `Reglas fuera de la pantalla que no son del glosario: ${raras.map((r) => r.slug).join(", ")}.`,
    );
  return fuera;
}
