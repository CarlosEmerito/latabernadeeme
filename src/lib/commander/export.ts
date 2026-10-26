/**
 * Parser del export en texto de Moxfield.
 *
 * Formato real (More → Export → Plain Text):
 *
 *   Commander
 *   1 Atraxa, Praetors' Voice (MUL) 1
 *
 *   Deck
 *   1 Sol Ring (LTC) 284
 *   10 Forest (ZNR) 280
 *   SB: 1 Rest in Peace (RTR) 18
 *
 * Reglas que sigue el parser:
 *
 * - Las secciones (`Commander`, `Deck`, `Sideboard`, `Companion`…) cambian el
 *   tablero; las que no se publican (`About`, `Name`…) se ignoran.
 * - `SB:` delante de una línea fuerza el banquillo.
 * - La cantidad es opcional: sin número, la línea es una carta.
 * - El set y el número (`(LTC) 284`) son una pista de impresión: sirven para
 *   resolver cartas cuyo nombre viene en otro idioma.
 * - `*F*` y `*E*` son acabados y no forman parte del nombre.
 * - Los comentarios empiezan por `//` o `#`.
 *
 * Lo que no se entiende no se tira: se queda como aviso para enseñarlo.
 */
import type { Linea, Tablero } from "./tipos.ts";

const SECCIONES: Record<string, Tablero | "ignorar"> = {
  commander: "commander",
  comandante: "commander",
  deck: "main",
  mazo: "main",
  mainboard: "main",
  main: "main",
  principal: "main",
  sideboard: "side",
  banquillo: "side",
  companion: "companion",
  companero: "companion",
  maybeboard: "maybeboard",
  "maybe board": "maybeboard",
  attractions: "attraction",
  schemes: "scheme",
  planes: "plane",
  tokens: "token",
  about: "ignorar",
  name: "ignorar",
  description: "ignorar",
  tags: "ignorar",
};

export interface ResultadoExport {
  lineas: Linea[];
  avisos: string[];
  /** Secciones que traía el texto, para poder enseñarlas. */
  secciones: string[];
}

/** Quita tildes y mayúsculas para comparar cabeceras. */
function plegar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** `1 Sol Ring (LTC) 284 *F*` → cantidad, nombre, set y número. */
function partirLinea(cruda: string): { cantidad: number; nombre: string; set?: string; numero?: string } {
  let texto = cruda.replace(/\s*(?:\*[FE]\*|\(?foil\)?|\(?etched\)?)\s*$/i, "").trim();

  let cantidad = 1;
  const conCantidad = texto.match(/^(\d+)\s*[xX]?\s+(.+)$/);
  if (conCantidad) {
    cantidad = Number(conCantidad[1]);
    texto = conCantidad[2].trim();
  } else {
    const conX = texto.match(/^[xX]?\s*(\d+)\s+(.+)$/);
    if (conX) {
      cantidad = Number(conX[1]);
      texto = conX[2].trim();
    }
  }

  // `(SET) 123` al final. El nombre puede llevar paréntesis propios: solo se
  // acepta como pista si lo que va dentro parece un código de set (2-6
  // caracteres alfanuméricos en mayúsculas) y detrás hay un número.
  let set: string | undefined;
  let numero: string | undefined;
  const conSet = texto.match(/^(.*?)\s*\(([A-Z0-9]{2,6})\)\s*([0-9A-Za-z★†-]+)\s*$/);
  if (conSet && conSet[1].trim()) {
    texto = conSet[1].trim();
    set = conSet[2];
    numero = conSet[3];
  }

  return { cantidad: Math.max(1, cantidad), nombre: texto.replace(/\s+/g, " ").trim(), set, numero };
}

/**
 * Convierte el texto pegado en líneas con tablero.
 *
 * No lanza: un export roto devuelve las líneas que haya podido entender y los
 * avisos de las que no, para que la página lo pueda decir sin quedarse muda.
 */
export function parsearExport(texto: string): ResultadoExport {
  const lineas: Linea[] = [];
  const avisos: string[] = [];
  const secciones: string[] = [];
  let tablero: Tablero | "ignorar" = "main";

  for (const cruda of String(texto ?? "").split(/\r?\n/)) {
    const limpia = cruda.trim();
    if (!limpia) continue;
    if (limpia.startsWith("//") || limpia.startsWith("#")) continue;

    // Cabecera de sección, con o sin dos puntos.
    const sinDosPuntos = limpia.replace(/:$/, "").trim();
    const clave = plegar(sinDosPuntos);
    if (Object.prototype.hasOwnProperty.call(SECCIONES, clave)) {
      tablero = SECCIONES[clave];
      if (tablero !== "ignorar") secciones.push(clave);
      continue;
    }

    let cuerpo = limpia;
    let forzado: Tablero | null = null;
    if (/^SB:\s*/i.test(cuerpo)) {
      cuerpo = cuerpo.replace(/^SB:\s*/i, "");
      forzado = "side";
    } else if (/^SIDEBOARD:\s*/i.test(cuerpo)) {
      cuerpo = cuerpo.replace(/^SIDEBOARD:\s*/i, "");
      forzado = "side";
    } else if (/^COMMANDER:\s*/i.test(cuerpo)) {
      cuerpo = cuerpo.replace(/^COMMANDER:\s*/i, "");
      forzado = "commander";
    }

    const parte = partirLinea(cuerpo);
    if (!parte.nombre) {
      avisos.push(`No se entiende la línea: «${limpia}»`);
      continue;
    }
    if (tablero === "ignorar" && !forzado) continue;

    lineas.push({
      cantidad: parte.cantidad,
      nombre: parte.nombre,
      set: parte.set,
      numero: parte.numero,
      tablero: forzado ?? (tablero === "ignorar" ? "main" : tablero),
    });
  }

  if (!lineas.length) avisos.push("No hay ninguna carta en el texto pegado.");
  return { lineas, avisos, secciones };
}
