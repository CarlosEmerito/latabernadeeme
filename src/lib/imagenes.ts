import fs from "node:fs";
import path from "node:path";

/**
 * Imagen de una entrada: un sigilo generado por el sitio a partir de su tipo y
 * su slug. Todas las fichas llevan uno; el genérico de reserva cubre las que no
 * tengan el suyo, para que ninguna se quede sin imagen.
 */
export interface Imagen {
  src: string;
  alt: string;
}

const RAIZ = process.cwd();
const GENERICO = "/img/sigilos/reglas/generico.svg";

const existe = (ruta: string) => fs.existsSync(path.join(RAIZ, "public", ruta));

export function imagenDe(tipo: string, slug: string, nombre: string): Imagen {
  const sigilo = `/img/sigilos/${tipo}/${slug}.svg`;
  return {
    src: existe(sigilo) ? sigilo : GENERICO,
    alt: `Sigilo de ${nombre}`,
  };
}
