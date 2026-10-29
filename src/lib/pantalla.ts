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

/* ── Elección guardada de la pantalla ───────────────────────────────────────
 *
 * La pantalla del DM deja al lector elegir qué paneles quiere y guarda la
 * elección en `localStorage`. La lectura vivía en un `<script>` de la página y
 * era `c.checked = guardado.includes(id)` sobre una lista de ids marcados: lo
 * que la lista no nombraba se quedaba oculto, y el primer cambio del lector
 * reescribía la lista sin él, así que la pérdida quedaba consolidada. Un panel
 * añadido después de que alguien configurara su pantalla desaparecía para
 * siempre, sin aviso, mientras el pie de la página seguía prometiendo las
 * reglas que ese navegador ya no veía (T-0388).
 *
 * El formato que se guarda ahora lleva **todos** los ids conocidos con su
 * estado:
 *
 *   { "v": 2, "paneles": { "combate": true, "social": false, … } }
 *
 * con lo que un id ausente solo puede significar una cosa: el panel no existía
 * cuando se guardó, y entonces se ve. Un id que ya no existe se ignora. Y el
 * formato viejo (un array con solo los marcados) no se puede desambiguar —la
 * ausencia es «lo apagó» o «no existía», y no hay forma de saberlo—, así que no
 * se oculta nada que no conste apagado: se respeta lo marcado y lo que no
 * consta se deja a la vista. Cuesta una vez que un lector que había apagado un
 * panel lo vuelva a ver; esconder un panel nuevo cuesta para siempre y sin
 * decirlo. La lista vacía del formato viejo se mantiene: «el DM apagó todo» es
 * una elección y se respeta.
 */

/** La clave de `localStorage` donde se guarda la elección de la pantalla. */
export const CLAVE_PANELES = "taberna:pantalla";

/** La versión del formato guardado: lo que no la declare no es nuestro. */
const VERSION = 2;

/**
 * El mínimo de `localStorage` que hace falta aquí, para que la lectura se pueda
 * probar con un doble sin abrir un navegador.
 */
export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

export interface EstadoDePaneles {
  /** Ids que van a la vista, en el orden de `ids`. */
  visibles: string[];
  /** Ids conocidos que el lector apagó a propósito. */
  ocultos: string[];
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

/**
 * Qué ids están apagados a propósito, según lo guardado.
 *
 * Devuelve solo las decisiones explícitas: un id que no aparece no está ni
 * encendido ni apagado, y quien llama lo deja a la vista.
 */
interface Guardado {
  /** El lector apagó todo: el formato viejo con la lista vacía. */
  todoApagado: boolean;
  /** Ids que constan apagados uno a uno. */
  apagados: Set<string>;
}

function apagados(crudo: string | null): Guardado | null {
  if (crudo === null || crudo.trim() === "") return null;
  let dato: unknown;
  try {
    dato = JSON.parse(crudo);
  } catch {
    return null;
  }

  // Formato viejo: un array con los ids marcados. Lo que la lista no menciona no
  // se puede distinguir de un panel que aún no existía, así que no se apaga; la
  // lista vacía sí, porque entonces no marcó nada nadie.
  if (Array.isArray(dato)) {
    return dato.length === 0 ? { todoApagado: true, apagados: new Set() } : null;
  }

  if (!esObjeto(dato) || dato.v !== VERSION || !esObjeto(dato.paneles)) return null;
  const apagados = new Set<string>();
  for (const [id, visible] of Object.entries(dato.paneles)) {
    if (visible === false) apagados.add(id);
  }
  return { todoApagado: false, apagados };
}

/** Qué paneles se ven con la elección guardada en `crudo`. */
export function leerPaneles(crudo: string | null, ids: string[]): EstadoDePaneles {
  const conocidos = [...new Set(ids)];
  const guardado = apagados(crudo);
  const visibles = guardado?.todoApagado
    ? []
    : conocidos.filter((id) => !guardado?.apagados.has(id));
  return { visibles, ocultos: conocidos.filter((id) => !visibles.includes(id)) };
}

/** Qué paneles se ven en este navegador. Un almacén que lanza deja todo a la vista. */
export function leerDeAlmacen(almacen: Almacen | null, ids: string[]): EstadoDePaneles {
  let crudo: string | null = null;
  try {
    crudo = almacen ? almacen.getItem(CLAVE_PANELES) : null;
  } catch {
    crudo = null;
  }
  return leerPaneles(crudo, ids);
}

/**
 * Guarda la elección con **todos** los ids conocidos y su estado, para que la
 * próxima lectura no tenga que adivinar nada. Si el almacén no deja escribir
 * (modo restringido, cuota llena) la pantalla sigue funcionando en esta visita.
 */
export function guardarEnAlmacen(almacen: Almacen | null, ids: string[], visibles: string[]): void {
  const puesto = new Set(visibles);
  const paneles: Record<string, boolean> = {};
  for (const id of new Set(ids)) paneles[id] = puesto.has(id);
  try {
    almacen?.setItem(CLAVE_PANELES, JSON.stringify({ v: VERSION, paneles }));
  } catch {}
}
