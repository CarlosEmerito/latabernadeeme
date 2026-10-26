/**
 * Carga del catálogo de criaturas que usan las herramientas de `/mesa/`.
 *
 * Vive aquí, y no dentro de la página, para que una puerta sin navegador pueda
 * probar qué pasa cuando el JSON no llega.
 *
 * La página daba por hecho que la petición siempre contesta, y no es así: un
 * despliegue que aún no ha propagado los `.json`, un corte de red o una caché
 * que devuelve el HTML del error dejan el catálogo vacío. Como la carga no
 * miraba `r.ok` ni tenía `catch`, la promesa quedaba rechazada sin dueño, el
 * datalist se quedaba con cero sugerencias sin decir nada y el panel contestaba
 * «No hay ninguna criatura que se llame «Goblin»» a quien escribía un nombre
 * que sí existe: culpaba al lector de un fallo de red. Aquí el fallo se convierte
 * en un aviso con el nombre del catálogo, que es lo que la página pinta.
 */

/** Lo que el constructor de encuentros necesita de una criatura del catálogo. */
export type MonstruoCatalogo = {
  s?: string;
  n: string;
  /** El perfil: `vd` y `xp` son los que usan el datalist y el presupuesto. */
  d: { vd: string; xp: string | number } & Record<string, unknown>;
};

/** Lo mínimo de una respuesta HTTP que la carga necesita. */
export type RespuestaHttp = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};

/** Cómo se pide el JSON: `fetch` de verdad, o un doble en las pruebas. */
export type Buscar = (url: string) => Promise<RespuestaHttp>;

export type CargaCatalogo = {
  monstruos: MonstruoCatalogo[];
  /** Qué contar al lector cuando no hay catálogo; vacío si la carga fue bien. */
  aviso: string;
};

/** El nombre con el que el sitio anuncia cada catálogo, para poder nombrarlo. */
const NOMBRES: Record<string, string> = { "5.5": "5.2.1 (2024)", "5e": "5.1 (2014)" };

export async function cargaCatalogo(
  ed: string,
  base = "",
  buscar: Buscar = (url) => fetch(url),
): Promise<CargaCatalogo> {
  const nombre = NOMBRES[ed] ?? ed;
  const sinCatalogo = (motivo: string): CargaCatalogo => ({
    monstruos: [],
    aviso: `No se ha podido cargar el catálogo del ${nombre}: ${motivo}. Las criaturas no están disponibles hasta que vuelva la conexión.`,
  });
  try {
    const r = await buscar(`${base}/datos/${ed}.json`);
    if (!r.ok) return sinCatalogo(`la petición ha respondido ${r.status ?? "con un error"}`);
    const j = (await r.json()) as { entradas?: Array<{ t?: string }> };
    const entradas = Array.isArray(j?.entradas) ? j.entradas : [];
    const monstruos = entradas.filter((e) => e?.t === "monstruos") as MonstruoCatalogo[];
    if (!monstruos.length) return sinCatalogo("el fichero no trae ninguna criatura");
    return { monstruos, aviso: "" };
  } catch {
    // Un `fetch` que no sale y un cuerpo que no es JSON acaban aquí: el lector
    // necesita el mismo aviso, no un error en la consola.
    return sinCatalogo("no ha llegado la respuesta");
  }
}
