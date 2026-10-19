/**
 * Prefijo de despliegue.
 *
 * El sitio vive en una «project page» de GitHub Pages, así que todas las rutas
 * internas tienen que llevar el nombre del repositorio delante. `BASE_URL` lo
 * aporta Astro desde `astro.config.mjs`; en local se puede vaciar con
 * `BASE_PATH="" npm run dev`.
 */
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Convierte una ruta absoluta del sitio en una URL servible. */
export function e(ruta: string): string {
  if (!ruta.startsWith("/")) ruta = `/${ruta}`;
  return `${base}${ruta}`;
}

export { base };
