/**
 * El Markdown que se copia con el botón «Copiar Markdown».
 *
 * Vive aquí, y no en el `<script>` del componente, por dos razones: se puede
 * probar en Node —la puerta de `tools/test/markdown.mjs` la aplica a las 647
 * fichas publicadas y mira lo que sale— y el navegador y la puerta usan el
 * mismo código, así que la puerta vigila de verdad lo que el botón copia.
 *
 * El PX va con la unidad puesta una sola vez. El frontmatter del SRD ya la
 * trae dentro («50 PX», «5900 PX o 7200 en la guarida; BC +4»), y añadir
 * «PX» encima la repetía: salía «50 PX PX» y un «PX» colgando detrás del
 * «BC +4», que ya no es un PX.
 */
import { xpConUnidad } from "./xp.ts";

export interface DatosExportables {
  tipo: string;
  srd: string;
  datos: Record<string, any>;
  markdown: string;
}

/** El texto que el botón «Copiar Markdown» mete en el portapapeles. */
export function markdownDe(exportable: DatosExportables): string {
  const d = exportable.datos;
  const cabecera = [
    `# ${d.name}`,
    "",
    `*${exportable.srd}${d.page ? `, pág. ${d.page}` : ""}*`,
    "",
  ];
  if (exportable.tipo === "conjuros") {
    cabecera.push(
      `- **Tiempo:** ${d.castingTime}`,
      `- **Alcance:** ${d.range}`,
      `- **Componentes:** ${d.components}`,
      `- **Duración:** ${d.duration}`,
      "",
    );
  }
  if (exportable.tipo === "monstruos") {
    cabecera.push(
      `- **CA:** ${d.ac}`,
      `- **PG:** ${d.hp}`,
      `- **Velocidad:** ${d.speed}`,
      `- **VD:** ${d.cr} (${xpConUnidad(d.xp)})`,
      "",
    );
  }
  cabecera.push(exportable.markdown.trim(), "");
  return cabecera.join("\n");
}
