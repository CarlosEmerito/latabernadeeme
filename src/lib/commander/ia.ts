/**
 * La parte de IA, opcional y con la clave del usuario.
 *
 * No hay servidor ni clave del sitio: la llamada sale del navegador a Google con
 * la clave que el usuario pegue. Sin clave, esta función no se llama.
 *
 * El modelo recibe el mazo ya resuelto y el análisis hecho: su trabajo es
 * redactar estrategia, no decidir legalidad ni bracket.
 */
import { conPlazo } from "./plazo.ts";
import type { Analisis } from "./analisis.ts";
import type { Mazo } from "./tipos.ts";

const MODELO = "gemini-2.5-flash";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
/** Redactar 100 cartas tarda, pero una llamada que no contesta no puede colgar la página. */
const PLAZO_MS = 60_000;

/** Prompt con el mazo y el análisis; ~6.000 tokens para 100 cartas. */
export function promptDe(mazo: Mazo, a: Analisis): string {
  const lista = [...mazo.comandantes, ...mazo.cartas]
    .filter((c) => c.tablero !== "side" && c.tablero !== "maybeboard")
    .map((c) => {
      const texto = [c.carta.oracle_text ?? "", ...(c.carta.card_faces ?? []).map((f) => f.oracle_text ?? "")]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return `${c.cantidad} ${c.carta.name} | ${c.carta.mana_cost ?? "—"} | ${c.carta.type_line} | ${texto}`;
    })
    .join("\n");

  const roles = a.roles
    .filter((r) => r.n > 0)
    .map((r) => `${r.etiqueta}: ${r.n}${r.cartas.length ? ` (${r.cartas.slice(0, 6).join(", ")})` : ""}`)
    .join("\n");

  return [
    "Eres un jugador experto de Magic: The Gathering, formato Commander (100 cartas, multijugador de 4).",
    "Vas a aconsejar cómo jugar este mazo concreto. No inventes cartas que no estén en la lista ni cambies su legalidad.",
    "Empieza directamente por el plan: no saludes, no digas «¡Excelente elección!», no resumas el mazo en una introducción y no repitas la lista de cartas.",
    "Responde en español y en Markdown: un `##` por bloque (Plan por turnos, Mano inicial, Errores típicos, Cambios concretos), listas con `-` y los nombres de carta en negrita. Nada de párrafos largos.",
    "En el plan por turnos usa tres apartados con `###`: 1-3, 4-6 y 7+.",
    "En «Errores típicos» pon exactamente tres; en «Cambios concretos», dos, y que no cuesten dinero.",
    "",
    `Comandante: ${a.comandante ?? "sin comandante"}`,
    `Cartas: ${a.total} · tierras: ${a.tierras} · media de valor: ${a.media.toFixed(1)} · bracket estimado: ${a.bracket.etiqueta}`,
    `Identidad: ${a.identidad.join("") || "incolora"}`,
    "",
    "Recuentos por rol:",
    roles,
    "",
    "Lista completa (cantidad, nombre, coste, tipo, texto):",
    lista,
  ].join("\n");
}

/** Mensaje de error legible a partir de la respuesta de Google. */
async function errorDe(respuesta: Response): Promise<string> {
  if (respuesta.status === 400 || respuesta.status === 403) {
    return "Google ha rechazado la clave. Revisa que sea una clave de Gemini API y que la API esté activada.";
  }
  if (respuesta.status === 429) {
    return "Has agotado la cuota gratuita de Gemini por ahora. Espera un rato o cambia de modelo.";
  }
  let detalle = "";
  try {
    const cuerpo = (await respuesta.json()) as { error?: { message?: string } };
    detalle = cuerpo.error?.message ?? "";
  } catch {
    // sin cuerpo legible
  }
  return `Gemini ha respondido ${respuesta.status}${detalle ? `: ${detalle}` : ""}.`;
}

interface RespuestaGemini {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { thoughtsTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Una llamada a Gemini. El presupuesto de salida incluye los tokens de
 * pensamiento: con 1.400 y Flash pensando, la respuesta se cortaba a media
 * frase. Se apaga el pensamiento (es redactar, no razonar) y se deja margen.
 */
async function pedir(
  clave: string,
  prompt: string,
  maxOutputTokens: number,
  fetchImpl: typeof fetch,
  plazoMs: number,
): Promise<RespuestaGemini> {
  const respuesta = await conPlazo("Gemini", plazoMs, (senal) =>
    fetchImpl(`${URL}?key=${encodeURIComponent(clave)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: senal,
    }),
  );
  if (!respuesta.ok) throw new Error(await errorDe(respuesta));
  return (await respuesta.json()) as RespuestaGemini;
}

function textoDe(datos: RespuestaGemini): string {
  return (datos.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

/** Llama a Gemini y devuelve el texto. Lanza con un mensaje en español. */
export async function analizarConIA(
  mazo: Mazo,
  analisis: Analisis,
  clave: string,
  fetchImpl: typeof fetch = fetch,
  plazoMs: number = PLAZO_MS,
): Promise<string> {
  const limpia = clave.trim();
  if (!limpia) throw new Error("Falta la clave de Gemini.");
  const prompt = promptDe(mazo, analisis);

  const primera = await pedir(limpia, prompt, 4096, fetchImpl, plazoMs);
  if (primera.promptFeedback?.blockReason) {
    throw new Error(`Gemini ha bloqueado la respuesta (${primera.promptFeedback.blockReason}).`);
  }
  const candidato = primera.candidates?.[0];
  let texto = textoDe(primera);
  if (candidato?.finishReason === "MAX_TOKENS") {
    // El techo se quedó corto (pasa si el modelo gasta en pensamiento): una
    // segunda pasada con el doble de margen antes de devolver algo a medias.
    const segunda = await pedir(limpia, prompt, 8192, fetchImpl, plazoMs);
    if (segunda.promptFeedback?.blockReason) {
      throw new Error(`Gemini ha bloqueado la respuesta (${segunda.promptFeedback.blockReason}).`);
    }
    texto = textoDe(segunda);
    if (segunda.candidates?.[0]?.finishReason === "MAX_TOKENS") {
      throw new Error("La respuesta se ha cortado por longitud. Vuelve a intentarlo o pide un análisis más corto.");
    }
  }
  if (!texto) throw new Error("Gemini ha contestado sin texto. Prueba otra vez.");
  return texto;
}
