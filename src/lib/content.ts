import fs from "node:fs";
import path from "node:path";
import { load as parseYaml } from "js-yaml";
import MarkdownIt from "markdown-it";
import { e } from "./urls";

export type Edition = "5e" | "5.5";

export const EDICIONES: Record<Edition, { dir: string; titulo: string; srd: string; nota: string }> = {
  "5e": {
    dir: "ed51",
    titulo: "Quinta edición",
    srd: "SRD 5.1",
    nota: "Reglas de 2014",
  },
  "5.5": {
    dir: "ed52",
    titulo: "Quinta edición revisada",
    srd: "SRD 5.2.1",
    nota: "Reglas de 2024",
  },
};

export const TIPOS = [
  "conjuros",
  "monstruos",
  "objetos",
  "equipo",
  "clases",
  "especies",
  "trasfondos",
  "dotes",
  "reglas",
] as const;

export type Tipo = (typeof TIPOS)[number];

export const TIPO_META: Record<Tipo, { singular: string; plural: string; icono: string; desc: string }> = {
  conjuros: { singular: "Conjuro", plural: "Conjuros", icono: "✦", desc: "Hechizos, trucos y rituales" },
  monstruos: { singular: "Monstruo", plural: "Monstruos", icono: "☠", desc: "Perfiles de criaturas" },
  objetos: { singular: "Objeto mágico", plural: "Objetos mágicos", icono: "◈", desc: "Tesoros y reliquias" },
  equipo: { singular: "Equipo", plural: "Equipo", icono: "⚒", desc: "Armas, armaduras y pertrechos" },
  clases: { singular: "Clase", plural: "Clases", icono: "♜", desc: "Progresión y rasgos" },
  especies: { singular: "Especie", plural: "Especies y razas", icono: "❧", desc: "Linajes jugables" },
  trasfondos: { singular: "Trasfondo", plural: "Trasfondos", icono: "✒", desc: "De dónde vienes" },
  dotes: { singular: "Dote", plural: "Dotes", icono: "✧", desc: "Talentos y estilos" },
  reglas: { singular: "Regla", plural: "Reglas", icono: "§", desc: "Cómo funciona el juego" },
};

// Cada edición nombra lo mismo de forma distinta: el SRD 5.1 habla de «razas» y el
// 5.2 de «especies». Se respeta el término del documento, no se unifica.
const NOMBRE_TIPO: Record<Edition, Partial<Record<Tipo, string>>> = {
  "5e": { especies: "Razas" },
  "5.5": { especies: "Especies" },
};

export function nombreTipo(ed: Edition | undefined, tipo: Tipo): string {
  const base = TIPO_META[tipo].plural;
  if (!ed) return base;
  return NOMBRE_TIPO[ed][tipo] ?? base;
}

export interface Entrada {
  slug: string;
  data: Record<string, any>;
  body: string;
  html: string;
  edicion: Edition;
  tipo: Tipo;
}

const md = new MarkdownIt({ html: false, typographer: true, linkify: false });

/** Renderiza un fragmento de Markdown (para comparar párrafos sueltos). */
export const renderizar = (texto: string) => md.render(texto);

md.renderer.rules.heading_open = (tokens, idx) => {
  const token = tokens[idx];
  const inline = tokens[idx + 1];
  const texto = inline?.content ?? "";
  const id = slugify(texto);
  token.attrSet("id", id);
  return `<${token.tag} id="${id}">`;
};

export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const cache = new Map<string, Entrada[]>();

function splitFrontmatter(raw: string): { data: Record<string, any>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };
  let data: Record<string, any>;
  try {
    data = (parseYaml(match[1]) as Record<string, any>) ?? {};
  } catch (e) {
    throw new Error(`Frontmatter inválido: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { data, body: raw.slice(match[0].length) };
}

export function cargar(ed: Edition, tipo: Tipo): Entrada[] {
  const clave = `${ed}/${tipo}`;
  const cached = cache.get(clave);
  if (cached) return cached;

  const dir = path.join(process.cwd(), "data", EDICIONES[ed].dir, tipo);
  if (!fs.existsSync(dir)) {
    cache.set(clave, []);
    return [];
  }

  const entradas = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((fichero) => {
      const raw = fs.readFileSync(path.join(dir, fichero), "utf8");
      let data: Record<string, any>;
      let body: string;
      try {
        ({ data, body } = splitFrontmatter(raw));
      } catch (e) {
        throw new Error(`${path.join(dir, fichero)}: ${e instanceof Error ? e.message : String(e)}`);
      }
      const slug = fichero.replace(/\.md$/, "");
      return {
        slug,
        data: { name: slug, ...data },
        body,
        html: md.render(body),
        edicion: ed,
        tipo,
      } satisfies Entrada;
    })
    .sort((a, b) => String(a.data.name).localeCompare(String(b.data.name), "es"));

  cache.set(clave, entradas);
  return entradas;
}

const indices = new Map<string, Map<string, string>>();

export function indice(ed: Edition, tipo: Tipo): Map<string, string> {
  const clave = `${ed}/${tipo}`;
  const existente = indices.get(clave);
  if (existente) return existente;
  const mapa = new Map<string, string>();
  for (const e of cargar(ed, tipo)) mapa.set(String(e.data.name).toLowerCase(), e.slug);
  indices.set(clave, mapa);
  return mapa;
}

export function buscarEntrada(ed: Edition, tipo: Tipo, slug: string): Entrada | undefined {
  return cargar(ed, tipo).find((e) => e.slug === slug);
}

/** Convierte las menciones a conjuros del texto en enlaces internos. */
/** Convierte «Nombre (nivel N)» en el título de un rasgo en una etiqueta aparte. */
export function marcarNiveles(html: string): string {
  return html.replace(/(<h[34][^>]*>)([^<]*?)\s*\(nivel (\d+)\)(<\/h[34]>)/g,
    (_m, abre: string, texto: string, nivel: string, cierra: string) =>
      `${abre}${texto.trim()}<span class="nivel">Nivel ${nivel}</span>${cierra}`);
}

export interface Seccion {
  nivel: 2 | 3;
  id: string;
  texto: string;
}

/** Lista los títulos de una entrada para el índice lateral. */
export function seccionesDe(html: string): Seccion[] {
  return [...html.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h[23]>/g)].map((m) => ({
    nivel: Number(m[1]) as 2 | 3,
    id: m[2],
    texto: m[3].replace(/<span class="nivel">[\s\S]*?<\/span>/, "").replace(/<[^>]+>/g, "").trim(),
  }));
}

export function enlazarConjuros(html: string, ed: Edition, tipoActual: Tipo): string {
  /* El SRD marca los nombres en negrita o cursiva, a menudo con un añadido
     detrás («Paso brumoso (3/día).»). Se enlaza solo la parte que coincide con
     el nombre exacto de otra entrada y el resto se conserva tal cual. */
  const conjuros = indice(ed, "conjuros");
  const monstruos = indice(ed, "monstruos");

  const enlace = (nombre: string): string | null => {
    const clave = nombre.toLowerCase();
    if (clave.length < 4) return null;
    const slugConjuro = tipoActual !== "conjuros" ? conjuros.get(clave) : undefined;
    if (slugConjuro) {
      return `<a href="${e(`/${ed}/conjuros/${slugConjuro}/`)}" data-tarjeta="conjuros/${slugConjuro}" data-ed="${ed}">${nombre}</a>`;
    }
    const slugMonstruo = tipoActual !== "monstruos" ? monstruos.get(clave) : undefined;
    if (slugMonstruo) {
      return `<a href="${e(`/${ed}/monstruos/${slugMonstruo}/`)}" data-tarjeta="monstruos/${slugMonstruo}" data-ed="${ed}">${nombre}</a>`;
    }
    return null;
  };

  return html.replace(/<(em|strong)>([^<]{2,60})<\/\1>/g, (todo, etiqueta: string, bruto: string) => {
    const limpio = bruto.trim();
    const nucleo = limpio.replace(/[.,;:]+$/, "");
    const cola = limpio.slice(nucleo.length);

    // Candidatos: el texto entero y el nombre antes de un paréntesis o dos puntos.
    const candidatos = [nucleo, nucleo.replace(/\s*\(.*$/, ""), nucleo.split(":")[0]];

    for (const candidato of candidatos) {
      const enlazado = enlace(candidato);
      if (enlazado) {
        const resto = nucleo.slice(candidato.length);
        return `<${etiqueta}>${enlazado}${resto}${cola}</${etiqueta}>`;
      }
    }
    return todo;
  });
}

export function contar(ed: Edition, tipo: Tipo): number {
  return cargar(ed, tipo).length;
}

export const NOMBRE_ESCUELA: Record<string, string> = {
  Abjuración: "Abjuración",
  Adivinación: "Adivinación",
  Conjuración: "Conjuración",
  Encantamiento: "Encantamiento",
  Evocación: "Evocación",
  Ilusionismo: "Ilusionismo",
  Nigromancia: "Nigromancia",
  Transmutación: "Transmutación",
};
