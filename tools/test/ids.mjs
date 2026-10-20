/**
 * Comprueba que ninguna página de `dist/` repite un atributo `id`.
 *
 * Un `id` tiene que ser único dentro de su documento: si se repite, el
 * navegador se queda con el primero, el resto de anclas llevan donde no deben y
 * el índice lateral promete enlaces que no existen. El sitio genera los id a
 * partir del texto del encabezado (`slugify` en `src/lib/content.ts`), así que
 * dos apartados con el mismo título —«A niveles superiores» en cada carta de
 * conjuro, las dos columnas del comparador— salen con el mismo id si nadie los
 * desambigua. `IdsDeDocumento` los numera por página; esto lo vigila sobre el
 * HTML publicado, que es lo que ve el navegador.
 *
 * Uso: node tools/test/ids.mjs [dist]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");

const paginas = [];
const recorrer = (dir) => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (entrada.name.endsWith(".html")) paginas.push(ruta);
  }
};
recorrer(DIST);

const repetidos = [];

for (const pagina of paginas) {
  const html = fs.readFileSync(pagina, "utf8");
  const cuenta = new Map();
  for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) {
    cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }
  const duplicados = [...cuenta].filter(([, veces]) => veces > 1);
  if (duplicados.length > 0) repetidos.push({ pagina, duplicados });
}

const total = repetidos.reduce((n, r) => n + r.duplicados.length, 0);
console.log(`Páginas comprobadas: ${paginas.length} · páginas con id repetidos: ${repetidos.length}`);
if (repetidos.length === 0) {
  console.log("Sin ids repetidos: cada ancla de cada página es única.");
  process.exit(0);
}

console.log(`\nIds repetidos: ${total}`);
for (const { pagina, duplicados } of repetidos.slice(0, 40)) {
  const detalle = duplicados
    .slice(0, 4)
    .map(([id, veces]) => `${id} (${veces})`)
    .join(", ");
  console.log(`  ✗ ${path.relative(DIST, pagina)}: ${detalle}`);
}
process.exit(1);
