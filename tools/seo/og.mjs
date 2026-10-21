/**
 * Tarjetas sociales del sitio: un PNG por sigilo para `og:image`.
 *
 * Facebook, X, Telegram y WhatsApp no pintan un SVG en la vista previa, así que
 * el sigilo de cada ficha se rasteriza aquí sobre el fondo del sitio. El tamaño
 * es 600×315, el mínimo que piden Facebook y X para la tarjeta grande, y el
 * fichero sale en `dist/img/og/<tipo>/<slug>.png`: la misma ruta que
 * `tarjetaDe()` de `src/lib/imagenes.ts` pone en el HTML.
 *
 * El trabajo se cachea en `.cache/og/` con la fecha del SVG de origen, así que
 * la primera compilación tarda unos veinte segundos (1454 sigilos) y las
 * siguientes solo enlazan el resultado. `npm run build` lo llama después de
 * Pagefind; no hay que ejecutarlo a mano.
 *
 * Uso: node tools/seo/og.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SIGILOS = path.join(RAIZ, "public/img/sigilos");
const DESTINO = path.join(RAIZ, "dist/img/og");
// Cambiar el dibujo de la tarjeta obliga a subir la versión de la caché.
const CACHE = path.join(RAIZ, ".cache/og", "600x315-fondo-claro");
const ANCHO = 600;
const ALTO = 315;
// El fondo del tema claro: `--fondo` en src/styles/tema.css.
const FONDO = { r: 251, g: 251, b: 249 };
// El sigilo ocupa el 82 % del alto, con un margen que respira en la vista previa.
const LADO = Math.round(ALTO * 0.82);
const OBREROS = 8;

if (!fs.existsSync(SIGILOS)) {
  console.error(`No encuentro los sigilos en ${SIGILOS}.`);
  process.exit(1);
}

const sigilos = [];
const recorrer = (dir) => {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (entrada.name.endsWith(".svg")) sigilos.push(path.relative(SIGILOS, ruta));
  }
};
recorrer(SIGILOS);

const tarjeta = async (origen) => {
  const icono = await sharp(origen).resize(LADO, LADO).png().toBuffer();
  return sharp({ create: { width: ANCHO, height: ALTO, channels: 3, background: FONDO } })
    .composite([{ input: icono, gravity: "center" }])
    .png({ compressionLevel: 6 })
    .toBuffer();
};

/** Enlaza el PNG cacheado en `dist/`; si el sistema de ficheros no deja, lo copia. */
const publicar = (origen, destino) => {
  try {
    fs.linkSync(origen, destino);
  } catch {
    fs.copyFileSync(origen, destino);
  }
};

let generadas = 0;
let reutilizadas = 0;
const pendientes = [...sigilos];

const obrero = async () => {
  for (let rel = pendientes.shift(); rel !== undefined; rel = pendientes.shift()) {
    const origen = path.join(SIGILOS, rel);
    const cache = path.join(CACHE, rel).replace(/\.svg$/, ".png");
    const destino = path.join(DESTINO, rel).replace(/\.svg$/, ".png");
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    try {
      if (!fs.existsSync(cache) || fs.statSync(cache).mtimeMs < fs.statSync(origen).mtimeMs) {
        fs.writeFileSync(cache, await tarjeta(origen));
        generadas++;
      } else {
        reutilizadas++;
      }
    } catch (e) {
      console.error(`✗ No se pudo dibujar la tarjeta de ${rel}: ${e.message}`);
      process.exit(1);
    }
    publicar(cache, destino);
  }
};

await Promise.all(Array.from({ length: OBREROS }, obrero));
console.log(`Tarjetas sociales: ${sigilos.length} en dist/img/og (${generadas} dibujadas, ${reutilizadas} de caché).`);
