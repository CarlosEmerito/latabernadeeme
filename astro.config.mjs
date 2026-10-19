// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// El sitio se publica como «project page» de GitHub Pages, de ahí el prefijo.
// Para probarlo en local con la misma ruta: npm run dev y abrir /latabernadeeme/
const base = process.env.BASE_PATH ?? "/latabernadeeme";

export default defineConfig({
  site: "https://carlosemerito.github.io",
  base,
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  compressHTML: true,
  integrations: [sitemap()],
});
