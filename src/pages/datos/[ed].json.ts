import type { APIRoute } from "astro";
import { EDICIONES, TIPOS, cargar, type Edition } from "../../lib/content";
import { aliasDe } from "../../lib/alias";
import { xpNumerico } from "../../lib/xp";

export function getStaticPaths() {
  return (["5e", "5.5"] as Edition[]).map((ed) => ({ params: { ed } }));
}

/** Convierte el VD en número para poder filtrar por rangos. */
function vdNumerico(vd: unknown): number {
  const s = String(vd ?? "").trim();
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    return b ? a / b : 0;
  }
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export const GET: APIRoute = ({ params }) => {
  const ed = params.ed as Edition;
  const entradas = TIPOS.flatMap((tipo) =>
    cargar(ed, tipo).map((en) => {
      const d = en.data;
      const alias = aliasDe(String(d.name ?? en.slug), tipo, en.slug);
      const base: Record<string, any> = { s: en.slug, t: tipo, n: String(d.name ?? en.slug) };
      if (alias) base.a = alias;

      switch (tipo) {
        case "conjuros":
          base.f = {
            nivel: d.level === 0 ? "truco" : String(d.level),
            escuela: String(d.school ?? ""),
            clase: Array.isArray(d.classes) ? d.classes.join("|") : "",
            ritual: d.ritual ? "sí" : "no",
            concentracion: d.concentration ? "sí" : "no",
          };
          base.r = { nivel: Number(d.level ?? 0) };
          base.d = {
            nivel: d.level,
            escuela: d.school,
            tiempo: d.castingTime,
            alcance: d.range,
            componentes: d.components,
            duracion: d.duration,
            clases: d.classes,
          };
          break;
        case "monstruos":
          base.f = {
            vd: String(d.cr ?? ""),
            tipo: String(d.type ?? ""),
            tamano: String(d.size ?? ""),
          };
          base.r = { vd: vdNumerico(d.cr), xp: xpNumerico(d.xp), pg: Number.parseInt(String(d.hp ?? "0"), 10) || 0 };
          base.d = { vd: d.cr, xp: d.xp, tipo: d.type, tamano: d.size, pg: d.hp, ca: d.ac };
          break;
        case "objetos":
          base.f = {
            tipo: String(d.type ?? ""),
            rareza: String(d.rarity || "sin rareza"),
            sintonizacion: d.attunement ? "sí" : "no",
          };
          base.d = { tipo: d.type, rareza: d.rarity, sint: !!d.attunement };
          break;
        case "equipo":
          base.f = { categoria: String(d.category ?? "") };
          base.d = { categoria: d.category, precio: d.price, peso: d.weight };
          break;
        case "clases":
          base.f = {};
          base.d = { dado: d.hitDie, caracteristica: d.primaryAbility };
          break;
        case "especies":
          base.f = {};
          base.d = { tamano: d.size, velocidad: d.speed };
          break;
        case "dotes":
          base.f = { categoria: String(d.category ?? "") };
          base.d = { categoria: d.category, prerrequisito: d.prerequisite };
          break;
        default:
          base.f = { categoria: String(d.category ?? "") };
          base.d = {};
      }

      return base;
    }),
  );

  const cuerpo = JSON.stringify({
    ed,
    srd: EDICIONES[ed].srd,
    total: entradas.length,
    entradas,
  });

  return new Response(cuerpo, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
