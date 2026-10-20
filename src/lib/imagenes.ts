import fs from "node:fs";
import path from "node:path";

export interface Imagen {
  clase: "grabado" | "sigilo";
  src: string;
  srcset?: string;
  alt: string;
  credito?: string;
  licencia?: string;
  fuente?: string;
  ancho: number;
  alto: number;
}

const RAIZ = process.cwd();
const MANIFIESTO = path.join(RAIZ, "data/imagenes-grabados.json");

interface Ficha {
  titulo: string;
  autor: string;
  fecha: string;
  museo: string;
  url: string;
  licencia: string;
}

let cache: Record<string, Ficha> | null = null;
const leerManifiesto = () => (cache ??= JSON.parse(fs.readFileSync(MANIFIESTO, "utf8")));

const existe = (ruta: string) => fs.existsSync(path.join(RAIZ, "public", ruta));

/**
 * Imagen de una entrada: grabado de dominio público si lo hay, sigilo generado
 * si no. Devuelve siempre algo, para que ninguna ficha quede vacía.
 */
export function imagenDe(tipo: string, slug: string, nombre: string): Imagen {
  const ficha = leerManifiesto()[`${tipo}/${slug}`];
  const base = `/img/grabados/${tipo}/${slug}`;

  if (ficha && existe(`${base}-960.webp`)) {
    return {
      clase: "grabado",
      src: `${base}-960.webp`,
      srcset: `${base}-480.webp 480w, ${base}-960.webp 960w`,
      alt: ficha.titulo ? `${ficha.titulo}${ficha.autor ? `, por ${ficha.autor}` : ""}` : `Ilustración de ${nombre}`,
      credito: [ficha.titulo, ficha.autor, ficha.fecha].filter(Boolean).join(" · "),
      licencia: ficha.licencia,
      fuente: ficha.url,
      ancho: 960,
      alto: 640,
    };
  }

  const sigilo = `/img/sigilos/${tipo}/${slug}.svg`;
  if (existe(sigilo)) {
    return {
      clase: "sigilo",
      src: sigilo,
      alt: `Sigilo de ${nombre}`,
      ancho: 200,
      alto: 200,
    };
  }

  return {
    clase: "sigilo",
    src: "/img/sigilos/reglas/generico.svg",
    alt: `Sigilo de ${nombre}`,
    ancho: 200,
    alto: 200,
  };
}

/** Entradas con grabado, para la tira de la portada. */
export function grabadosDestacados(): { tipo: string; slug: string }[] {
  const claves = Object.keys(leerManifiesto());
  const preferidas = ["monstruos/dragon", "monstruos/lobo", "equipo/espada", "clases/mago"];
  const elegidas = preferidas.filter((k) => claves.includes(k));
  for (const clave of claves) {
    if (elegidas.length >= 4) break;
    if (!elegidas.includes(clave)) elegidas.push(clave);
  }
  const [tipo, slug] = ["", ""];
  void tipo;
  void slug;
  return elegidas.slice(0, 4).map((k) => {
    const [t, s] = k.split("/");
    return { tipo: t, slug: s };
  });
}
