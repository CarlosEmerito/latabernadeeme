/**
 * Resolución de las líneas del export contra Scryfall.
 *
 * Scryfall permite 75 identificadores por petición y 2 peticiones por segundo en
 * `/cards/collection`. Un mazo de 100 son dos peticiones con 500 ms entre ellas.
 *
 * El identificador preferido es `set` + `collector_number` cuando el export los
 * trae: resuelve igual una carta en español y no depende de que el nombre esté
 * en inglés. Si esa impresión ya no existe (un export con el set cambiado), se
 * reintenta por nombre antes de darla por perdida.
 *
 * `fetch` se recibe por parámetro para poder probar la función sin red.
 */
import type { CartaMazo, CartaScryfall, Linea } from "./tipos.ts";

const API = "https://api.scryfall.com";
const LOTE = 75;
const ESPERA_MS = 500;

export interface OpcionesResolver {
  fetchImpl?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  /**
   * Solo para Node: el navegador no deja fijar `User-Agent` y ya manda el suyo.
   * Scryfall rechaza el de `fetch` de Node con un 400.
   */
  userAgent?: string;
}

export interface ResultadoResolucion {
  cartas: CartaMazo[];
  noEncontradas: Linea[];
  peticiones: number;
}

function claveDe(linea: Linea): string {
  if (linea.set && linea.numero) return `s:${linea.set.toUpperCase()}:${linea.numero}`;
  return `n:${linea.nombre.toLowerCase()}`;
}

function plegar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** ¿La carta devuelta se llama como la línea? También vale la cara frontal. */
function mismoNombre(linea: Linea, carta: CartaScryfall): boolean {
  const pedido = plegar(linea.nombre);
  const nombres = [carta.name, carta.card_faces?.[0]?.name ?? ""].map(plegar);
  return nombres.includes(pedido) || plegar(carta.name).startsWith(`${pedido} //`);
}

/** ¿La carta es la impresión exacta que pedía la línea? */
function mismaImpresion(linea: Linea, carta: CartaScryfall): boolean {
  return (
    String(carta.set ?? "").toUpperCase() === String(linea.set ?? "").toUpperCase() &&
    String(carta.collector_number ?? "") === linea.numero
  );
}

interface Respuesta {
  data?: CartaScryfall[];
  not_found?: Array<Record<string, string>>;
}

/** Una petición a `/cards/collection`, con reintento si Scryfall pide calma. */
async function pedir(
  identificadores: Array<Record<string, string>>,
  opciones: OpcionesResolver,
): Promise<{ respuesta: Respuesta; peticiones: number }> {
  const hacerFetch = opciones.fetchImpl ?? fetch;
  const esperar = opciones.esperar ?? ((ms: number) => new Promise((listo) => setTimeout(listo, ms)));
  const cabeceras: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (opciones.userAgent) cabeceras["User-Agent"] = opciones.userAgent;

  let peticiones = 0;
  let respuesta: Response | null = null;
  for (let intento = 0; intento < 2; intento++) {
    respuesta = await hacerFetch(`${API}/cards/collection`, {
      method: "POST",
      headers: cabeceras,
      body: JSON.stringify({ identifiers: identificadores }),
    });
    peticiones += 1;
    if (respuesta.status !== 429) break;
    await esperar(1000);
  }
  if (!respuesta || !respuesta.ok) {
    let detalle = "";
    try {
      const cuerpoError = (await respuesta?.json()) as { details?: string; message?: string } | undefined;
      detalle = cuerpoError?.details ?? cuerpoError?.message ?? "";
    } catch {
      // el cuerpo no era JSON
    }
    throw new Error(
      `Scryfall ha respondido ${respuesta ? respuesta.status : "sin respuesta"} al resolver las cartas.${detalle ? ` ${detalle}` : ""}`,
    );
  }
  return { respuesta: (await respuesta.json()) as Respuesta, peticiones };
}

/**
 * Resuelve todas las líneas. Las que no aparecen se devuelven aparte: la página
 * las enseña en vez de esconderlas.
 */
export async function resolverCartas(
  lineas: Linea[],
  opciones: OpcionesResolver = {},
): Promise<ResultadoResolucion> {
  const esperar = opciones.esperar ?? ((ms: number) => new Promise((listo) => setTimeout(listo, ms)));
  const claves = new Map<string, Linea>();
  for (const linea of lineas) claves.set(claveDe(linea), linea);

  const encontradas = new Map<string, CartaScryfall>();
  let peticiones = 0;

  // Primera pasada: por impresión si el export la trae, por nombre si no.
  const entradas = [...claves.entries()];
  for (let i = 0; i < entradas.length; i += LOTE) {
    const trozo = entradas.slice(i, i + LOTE);
    const { respuesta, peticiones: n } = await pedir(
      trozo.map(([, linea]): Record<string, string> =>
        linea.set && linea.numero
          ? { set: linea.set, collector_number: linea.numero }
          : { name: linea.nombre },
      ),
      opciones,
    );
    peticiones += n;
    for (const carta of respuesta.data ?? []) {
      for (const [clave, linea] of trozo) {
        if (encontradas.has(clave)) continue;
        const vale = linea.set && linea.numero ? mismaImpresion(linea, carta) : mismoNombre(linea, carta);
        if (vale) encontradas.set(clave, carta);
      }
    }
    if (i + LOTE < entradas.length) await esperar(ESPERA_MS);
  }

  // Segunda pasada: una impresión que ya no existe no puede dejar la carta
  // fuera si el nombre está bien.
  const pendientes = lineas.filter((l) => !encontradas.has(claveDe(l)) && l.set && l.numero);
  if (pendientes.length) {
    await esperar(ESPERA_MS);
    const porNombre = new Map<string, Linea>();
    for (const linea of pendientes) porNombre.set(claveDe(linea), linea);
    const trozos = [...porNombre.entries()];
    for (let i = 0; i < trozos.length; i += LOTE) {
      const trozo = trozos.slice(i, i + LOTE);
      const { respuesta, peticiones: n } = await pedir(
        trozo.map(([, linea]) => ({ name: linea.nombre })),
        opciones,
      );
      peticiones += n;
      for (const carta of respuesta.data ?? []) {
        for (const [clave, linea] of trozo) {
          if (!encontradas.has(clave) && mismoNombre(linea, carta)) encontradas.set(clave, carta);
        }
      }
      if (i + LOTE < trozos.length) await esperar(ESPERA_MS);
    }
  }

  const cartas: CartaMazo[] = [];
  const noEncontradas: Linea[] = [];
  for (const linea of lineas) {
    const carta = encontradas.get(claveDe(linea));
    if (carta) cartas.push({ cantidad: linea.cantidad, carta, tablero: linea.tablero, linea });
    else noEncontradas.push(linea);
  }

  return { cartas, noEncontradas, peticiones };
}
