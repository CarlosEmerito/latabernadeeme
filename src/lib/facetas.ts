import type { Entrada, Tipo } from "./content";

export interface Faceta {
  clave: string;
  etiqueta: string;
  valores: { valor: string; texto: string }[];
}

export interface ItemListado {
  slug: string;
  nombre: string;
  meta: string;
  texto: string;
  facetas: Record<string, string>;
}

const ORDEN_NIVEL = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const textoPlano = (s: string) =>
  s
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\n+/g, " ")
    .trim();

const ORDEN_CR = [
  "0",
  "1/8",
  "1/4",
  "1/2",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
];

function unicos(valores: (string | undefined)[]): string[] {
  return Array.from(new Set(valores.filter((v): v is string => Boolean(v && String(v).trim()))));
}

function ordenarPor(valores: string[], orden?: string[]): string[] {
  if (!orden) return valores.sort((a, b) => a.localeCompare(b, "es"));
  return valores.sort((a, b) => {
    const ia = orden.indexOf(a);
    const ib = orden.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "es");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function preparar(tipo: Tipo, entradas: Entrada[]): { facetas: Faceta[]; items: ItemListado[] } {
  const items: ItemListado[] = entradas.map((e) => {
    const d = e.data;
    const facetas: Record<string, string> = {};
    let meta = "";
    let texto = textoPlano(e.body).slice(0, 140);

    switch (tipo) {
      case "conjuros": {
        meta = `${d.level === 0 ? "Truco" : `Nivel ${d.level}`} · ${d.school}`;
        facetas.nivel = String(d.level ?? "");
        facetas.escuela = String(d.school ?? "");
        facetas.ritual = d.ritual ? "sí" : "no";
        facetas.clase = Array.isArray(d.classes) ? d.classes.join("|") : "";
        break;
      }
      case "monstruos": {
        meta = `VD ${d.cr} · ${d.size} ${String(d.type ?? "").toLowerCase()}`;
        facetas.vd = String(d.cr ?? "");
        facetas.tipo = String(d.type ?? "");
        facetas.tamano = String(d.size ?? "");
        break;
      }
      case "objetos": {
        meta = [d.rarity, d.type].filter(Boolean).join(" · ");
        facetas.rareza = String(d.rarity ?? "") || "sin rareza";
        facetas.sintonizacion = d.attunement ? "sí" : "no";
        break;
      }
      case "equipo": {
        meta = [d.category, d.price].filter(Boolean).join(" · ");
        facetas.categoria = String(d.category ?? "");
        break;
      }
      case "clases": {
        meta = [d.hitDie && `Dado ${d.hitDie}`, d.primaryAbility].filter(Boolean).join(" · ");
        break;
      }
      case "dotes": {
        meta = [d.category, d.prerequisite].filter(Boolean).join(" · ");
        facetas.categoria = String(d.category ?? "");
        break;
      }
      case "especies":
      case "trasfondos": {
        meta = [d.size, d.speed].filter(Boolean).join(" · ");
        break;
      }
      case "reglas": {
        meta = String(d.category ?? "");
        facetas.categoria = String(d.category ?? "");
        break;
      }
    }

    return { slug: e.slug, nombre: String(d.name ?? e.slug), meta, texto, facetas };
  });

  const facetas: Faceta[] = [];

  switch (tipo) {
    case "conjuros": {
      facetas.push({
        clave: "nivel",
        etiqueta: "Nivel",
        valores: ordenarPor(unicos(items.map((i) => i.facetas.nivel)), ORDEN_NIVEL).map((v) => ({
          valor: v,
          texto: v === "0" ? "Truco" : `Nivel ${v}`,
        })),
      });
      facetas.push({
        clave: "escuela",
        etiqueta: "Escuela",
        valores: ordenarPor(unicos(items.map((i) => i.facetas.escuela))).map((v) => ({ valor: v, texto: v })),
      });
      const clases = unicos(items.flatMap((i) => (i.facetas.clase ? i.facetas.clase.split("|") : [])));
      if (clases.length > 0) {
        facetas.push({
          clave: "clase",
          etiqueta: "Clase",
          valores: ordenarPor(clases).map((v) => ({ valor: v, texto: v })),
        });
      }
      facetas.push({
        clave: "ritual",
        etiqueta: "Ritual",
        valores: [
          { valor: "sí", texto: "Sí" },
          { valor: "no", texto: "No" },
        ],
      });
      break;
    }
    case "monstruos": {
      facetas.push({
        clave: "vd",
        etiqueta: "Valor de desafío",
        valores: ordenarPor(unicos(items.map((i) => i.facetas.vd)), ORDEN_CR).map((v) => ({ valor: v, texto: v })),
      });
      facetas.push({
        clave: "tipo",
        etiqueta: "Tipo",
        valores: ordenarPor(unicos(items.map((i) => i.facetas.tipo))).map((v) => ({ valor: v, texto: v })),
      });
      facetas.push({
        clave: "tamano",
        etiqueta: "Tamaño",
        valores: ordenarPor(
          unicos(items.map((i) => i.facetas.tamano)),
          ["Diminuto", "Pequeño", "Mediano", "Grande", "Enorme", "Gigante"],
        ).map((v) => ({ valor: v, texto: v })),
      });
      break;
    }
    case "objetos": {
      facetas.push({
        clave: "rareza",
        etiqueta: "Rareza",
        valores: ordenarPor(
          unicos(items.map((i) => i.facetas.rareza)),
          ["común", "poco común", "raro", "muy raro", "legendario", "varía", "artefacto", "sin rareza"],
        ).map((v) => ({ valor: v, texto: v })),
      });
      facetas.push({
        clave: "sintonizacion",
        etiqueta: "Sintonización",
        valores: [
          { valor: "sí", texto: "Sí" },
          { valor: "no", texto: "No" },
        ],
      });
      break;
    }
    case "equipo":
    case "dotes":
    case "reglas": {
      const valores = unicos(items.map((i) => i.facetas.categoria));
      if (valores.length > 1) {
        facetas.push({
          clave: "categoria",
          etiqueta: "Categoría",
          valores: ordenarPor(valores).map((v) => ({ valor: v, texto: v })),
        });
      }
      break;
    }
  }

  return { facetas, items };
}
