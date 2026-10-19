import fs from "node:fs";
import path from "node:path";
import { load as parseYaml } from "js-yaml";
import MarkdownIt from "markdown-it";

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

export interface Entrada {
  slug: string;
  data: Record<string, any>;
  body: string;
  html: string;
  edicion: Edition;
  tipo: Tipo;
}

const md = new MarkdownIt({ html: false, typographer: true, linkify: false });

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
export function enlazarConjuros(html: string, ed: Edition, tipoActual: Tipo): string {
  /* Se enlazan solo las menciones en cursiva, que es como el SRD marca los
     nombres de conjuros: <em>bola de fuego</em>. */
  const conjuros = indice(ed, "conjuros");
  const monstruos = indice(ed, "monstruos");
  return html.replace(/<em>([^<]{2,60})<\/em>/g, (todo, texto: string) => {
    const clave = texto.trim().toLowerCase();
    const slugConjuro = conjuros.get(clave);
    if (slugConjuro && tipoActual !== "conjuros") {
      return `<em><a href="/${ed}/conjuros/${slugConjuro}/">${texto}</a></em>`;
    }
    const slugMonstruo = monstruos.get(clave);
    if (slugMonstruo && tipoActual !== "monstruos") {
      return `<em><a href="/${ed}/monstruos/${slugMonstruo}/">${texto}</a></em>`;
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
