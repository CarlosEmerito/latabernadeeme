/**
 * La puerta de la herramienta de Commander, sin navegador y sin red.
 *
 * Comprueba las cuatro piezas que pueden fallar en silencio:
 *
 *   1. El parser del export: secciones, cantidades, sets con números raros
 *      (`C15-56`), acabados y comentarios.
 *   2. Los roles: una carta concreta tiene que caer en el rol que toca.
 *   3. El análisis: 100 cartas, singleton, identidad, banlist y bracket.
 *   4. El resolver: lotes de 75, espera entre lotes, reintento por nombre y 429.
 *
 * Los datos de las cartas son de mentira pero con la forma de Scryfall; el
 * parser y los roles se prueban con textos reales de cartas conocidas.
 *
 * Uso: node tools/test/commander.mjs
 */
import { parsearExport } from "../../src/lib/commander/export.ts";
import { rolesDe } from "../../src/lib/commander/roles.ts";
import { analizarMazo } from "../../src/lib/commander/analisis.ts";
import { consejoDe } from "../../src/lib/commander/consejo.ts";
import { analizarConIA, promptDe } from "../../src/lib/commander/ia.ts";
import { markdownDe, sinIntroduccion } from "../../src/lib/commander/markdown.ts";
import { resolverCartas } from "../../src/lib/commander/scryfall.ts";

const fallos = [];
let comprobados = 0;
const comprobar = (condicion, detalle) => {
  comprobados += 1;
  if (!condicion) fallos.push(detalle);
};
const titulo = (t) => console.log(`\n▶ ${t}`);

// ── 1. Parser ───────────────────────────────────────────────────────────────
titulo("Parser del export");
{
  const texto = `Commander
1 Atraxa, Praetors' Voice (MUL) 1

Deck
1 Sol Ring (LTC) 284
10 Forest (ZNR) 280
1 Command Beacon (PLST) C15-56
1 Delver of Secrets // Insectile Aberration (ISD) 51 *F*
1x Arcane Signet (CMM) 951
SB: 1 Rest in Peace (RTR) 18
// comentario
# otro comentario
1 Orim's Chant (PLST) PLS-11
`;
  const r = parsearExport(texto);
  const porNombre = new Map(r.lineas.map((l) => [l.nombre, l]));
  comprobar(r.lineas.length === 8, `esperaba 8 líneas y hay ${r.lineas.length}`);
  comprobar(porNombre.get("Atraxa, Praetors' Voice")?.tablero === "commander", "la sección Commander no se aplica");
  comprobar(porNombre.get("Sol Ring")?.tablero === "main", "Deck no marca mainboard");
  comprobar(porNombre.get("Forest")?.cantidad === 10, "la cantidad 10 se pierde");
  comprobar(porNombre.get("Command Beacon")?.numero === "C15-56", "el número C15-56 no se separa");
  comprobar(porNombre.get("Delver of Secrets // Insectile Aberration")?.nombre.includes("//"), "la doble cara pierde el nombre");
  comprobar(porNombre.get("Delver of Secrets // Insectile Aberration")?.set === "ISD", "la doble cara no toma el set");
  comprobar(porNombre.get("Arcane Signet")?.cantidad === 1, "1x no se entiende");
  comprobar(porNombre.get("Rest in Peace")?.tablero === "side", "SB: no marca banquillo");
  comprobar(porNombre.get("Orim's Chant")?.numero === "PLS-11", "el número PLS-11 no se separa");
  comprobar(r.avisos.length === 0, `avisos inesperados: ${r.avisos.join(" · ")}`);
}
{
  const r = parsearExport("");
  comprobar(r.lineas.length === 0 && r.avisos.length === 1, "un texto vacío tiene que avisar");
}
{
  const r = parsearExport("1 Carta (SET)");
  comprobar(r.lineas[0]?.nombre === "Carta (SET)" && !r.lineas[0]?.set, "un paréntesis sin número no es un set");
}

// ── 2. Roles ────────────────────────────────────────────────────────────────
titulo("Roles por texto Oracle");
const carta = (name, type_line, oracle_text, extra = {}) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  type_line,
  oracle_text,
  mana_cost: "{1}",
  cmc: 1,
  color_identity: [],
  legalities: { commander: "legal" },
  prices: { eur: "1.00", usd: "1.00" },
  ...extra,
});
const CASOS_ROL = [
  ["Sol Ring", "Artifact", "{T}: Add {C}{C}.", ["rampa"]],
  ["Cultivate", "Sorcery", "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.", ["rampa"]],
  ["Rampant Growth", "Sorcery", "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.", ["rampa"]],
  ["Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}.", ["rampa"]],
  ["Rhystic Study", "Enchantment", "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.", ["robo"]],
  ["Brainstorm", "Instant", "Draw three cards, then put two cards from your hand on top of your library in any order.", ["robo"]],
  ["Swords to Plowshares", "Instant", "Exile target creature. Its controller gains life equal to its power.", ["removal", "vida"]],
  ["Wrath of God", "Sorcery", "Destroy all creatures. They can't be regenerated.", ["barrido"]],
  ["Armageddon", "Sorcery", "Destroy all lands.", ["barrido", "negacionTierras"]],
  ["Counterspell", "Instant", "Counter target spell.", ["contrahechizo"]],
  ["Demonic Tutor", "Sorcery", "Search your library for a card, put that card into your hand, then shuffle.", ["tutor"]],
  ["Regrowth", "Sorcery", "Return target card from your graveyard to your hand.", ["recursion"]],
  ["Heroic Intervention", "Instant", "Permanents you control gain hexproof and indestructible until end of turn.", ["proteccion"]],
  ["Thassa's Oracle", "Creature — Merfolk Wizard", "When Thassa's Oracle enters the battlefield, look at the top X cards of your library. If X is greater than or equal to the number of cards in your library, you win the game.", ["wincon"]],
  ["Time Warp", "Sorcery", "Target player takes an extra turn after this one.", ["turnoExtra"]],
  ["Forest", "Basic Land — Forest", "({T}: Add {G}.)", []],
];
for (const [nombre, tipo, texto, esperados] of CASOS_ROL) {
  const roles = rolesDe(carta(nombre, tipo, texto)).sort();
  comprobar(
    JSON.stringify(roles) === JSON.stringify(esperados.sort()),
    `«${nombre}»: esperaba [${esperados.join(", ")}] y da [${roles.join(", ")}]`,
  );
}

// ── 3. Análisis ─────────────────────────────────────────────────────────────
titulo("Análisis, legalidad y bracket");
function mazoDe(cartas, comandante) {
  return {
    id: "prueba",
    nombre: "Prueba",
    creado: "2026-01-01T00:00:00.000Z",
    fuente: "export",
    comandantes: comandante ? [{ cantidad: 1, carta: comandante, tablero: "commander", linea: { cantidad: 1, nombre: comandante.name, tablero: "commander" } }] : [],
    cartas: cartas.map(([c, cantidad]) => ({
      cantidad,
      carta: c,
      tablero: "main",
      linea: { cantidad, nombre: c.name, tablero: "main" },
    })),
    noEncontradas: [],
  };
}
const comandante = carta("Comandante Verde", "Legendary Creature — Human", "At the beginning of your upkeep, draw a card.", {
  color_identity: ["G"],
  cmc: 3,
});
const bosque = carta("Forest", "Basic Land — Forest", "({T}: Add {G}.)", { color_identity: ["G"], cmc: 0, prices: { eur: "0.10", usd: "0.10" } });
const rampa = (n) => carta(`Rampa ${n}`, "Sorcery", "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.", { color_identity: ["G"], cmc: 2 });
const cartasBase = [];
for (let i = 1; i <= 63; i++) cartasBase.push([rampa(i), 1]);
const base = mazoDe([[bosque, 36], ...cartasBase], comandante);
{
  const a = analizarMazo(base);
  comprobar(a.total === 100, `total ${a.total}`);
  comprobar(a.tierras === 36, `tierras ${a.tierras}`);
  comprobar(a.legalidad.ok, `legalidad: ${a.legalidad.problemas.join(" · ")}`);
  comprobar(a.bracket.etiqueta === "Bracket 1-2", `bracket ${a.bracket.etiqueta}`);
  comprobar(Math.abs(a.media - 129 / 64) < 1e-9, `media ${a.media}`);
  comprobar(a.roles.find((r) => r.id === "rampa")?.n === 63, "no cuenta la rampa");
}
{
  const m = mazoDe([[bosque, 35], [rampa(1), 2], ...cartasBase.slice(1)], comandante);
  const a = analizarMazo(m);
  comprobar(!a.legalidad.ok && a.legalidad.problemas.some((p) => p.includes("Rampa 1")), "no detecta el duplicado");
}
{
  const azul = carta("Carta Azul", "Instant", "Draw a card.", { color_identity: ["U"], cmc: 1 });
  const m = mazoDe([[bosque, 36], [azul, 1], ...cartasBase.slice(1)], comandante);
  const a = analizarMazo(m);
  comprobar(!a.legalidad.ok && a.legalidad.problemas.some((p) => p.includes("colores")), "no detecta la identidad de color");
}
{
  const gc = carta("Game Changer", "Artifact", "Add {C}.", { game_changer: true, cmc: 0 });
  const m = mazoDe([[bosque, 36], [gc, 1], ...cartasBase.slice(1)], comandante);
  const a = analizarMazo(m);
  comprobar(a.bracket.etiqueta === "Bracket 3", `un GC tiene que dar Bracket 3 y da ${a.bracket.etiqueta}`);
}
{
  const mld = carta("Tierra Rota", "Sorcery", "Destroy all lands.", { cmc: 4 });
  const m = mazoDe([[bosque, 36], [mld, 1], ...cartasBase.slice(1)], comandante);
  const a = analizarMazo(m);
  comprobar(a.bracket.etiqueta === "Bracket 4-5", `MLD tiene que dar Bracket 4-5 y da ${a.bracket.etiqueta}`);
}
{
  const gcs = [1, 2, 3, 4].map((n) => carta(`GC ${n}`, "Artifact", "Add {C}.", { game_changer: true, cmc: 0 }));
  const m = mazoDe([[bosque, 36], ...gcs.map((c) => [c, 1]), ...cartasBase.slice(4)], comandante);
  const a = analizarMazo(m);
  comprobar(a.bracket.etiqueta === "Bracket 4-5", `cuatro GC dan ${a.bracket.etiqueta}`);
}

// ── 4. Resolver ─────────────────────────────────────────────────────────────
titulo("Resolver por lotes, sin red");
const cartaJson = (name, set = "tst", cn = "1") => ({
  ...carta(name, "Artifact", "Add {C}.", { set, collector_number: cn }),
});
{
  const lineas = Array.from({ length: 80 }, (_, i) => ({
    cantidad: 1,
    nombre: `Carta ${i}`,
    tablero: "main",
  }));
  const cuerpos = [];
  const fakeFetch = async (_url, opciones) => {
    const cuerpo = JSON.parse(opciones.body);
    cuerpos.push(cuerpo.identifiers.length);
    return new Response(JSON.stringify({ data: cuerpo.identifiers.map((id) => cartaJson(id.name)) }), { status: 200 });
  };
  const esperas = [];
  const r = await resolverCartas(lineas, {
    fetchImpl: fakeFetch,
    esperar: async (ms) => esperas.push(ms),
  });
  comprobar(r.peticiones === 2, `peticiones ${r.peticiones}`);
  comprobar(cuerpos.join(",") === "75,5", `lotes ${cuerpos.join(",")}`);
  comprobar(esperas.includes(500), "no espera entre lotes");
  comprobar(r.cartas.length === 80, `resueltas ${r.cartas.length}`);
  comprobar(r.noEncontradas.length === 0, `faltan ${r.noEncontradas.length}`);
}
{
  const lineas = [{ cantidad: 1, nombre: "Perdida", tablero: "main" }];
  const fakeFetch = async () => new Response(JSON.stringify({ data: [], not_found: [{ name: "Perdida" }] }), { status: 200 });
  const r = await resolverCartas(lineas, { fetchImpl: fakeFetch, esperar: async () => {} });
  comprobar(r.noEncontradas.length === 1 && r.cartas.length === 0, "no informa de la carta perdida");
}
{
  // Primera pasada por impresión (sin resultados), segunda por nombre.
  const lineas = [{ cantidad: 1, nombre: "Vieja Impresión", set: "OLD", numero: "99", tablero: "main" }];
  let llamadas = 0;
  const fakeFetch = async (_url, opciones) => {
    llamadas += 1;
    const ids = JSON.parse(opciones.body).identifiers;
    const data = llamadas === 1 ? [] : ids.map((id) => cartaJson(id.name, "nuevo", "1"));
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
  const r = await resolverCartas(lineas, { fetchImpl: fakeFetch, esperar: async () => {} });
  comprobar(llamadas === 2, `llamadas ${llamadas}`);
  comprobar(r.cartas.length === 1, "no recupera la carta por nombre");
}
{
  const lineas = [{ cantidad: 1, nombre: "Con Calma", tablero: "main" }];
  let llamadas = 0;
  const fakeFetch = async () => {
    llamadas += 1;
    if (llamadas === 1) return new Response("{}", { status: 429 });
    return new Response(JSON.stringify({ data: [cartaJson("Con Calma")] }), { status: 200 });
  };
  const r = await resolverCartas(lineas, { fetchImpl: fakeFetch, esperar: async () => {} });
  comprobar(llamadas === 2 && r.cartas.length === 1, "no reintenta el 429");
}

// ── 5. Consejo ──────────────────────────────────────────────────────────────
titulo("Consejo determinista");
{
  const a = analizarMazo(base);
  const c = consejoDe(base, a);
  const texto = c.secciones.map((s) => s.parrafos.join(" ")).join(" ");
  comprobar(c.titular.includes("100 cartas"), `titular: ${c.titular}`);
  comprobar(texto.includes("Rampa: 63"), "no cita el recuento de rampa");
  comprobar(texto.includes("Bracket 1-2"), "no cita el bracket");
  comprobar(/Rampa 1/.test(texto) || /Rampa 2/.test(texto), "no cita una carta del mazo");
  comprobar(!texto.includes("undefined"), "el texto tiene un undefined");
  const prompt = promptDe(base, a);
  comprobar(prompt.includes("Comandante Verde"), "el prompt no nombra al comandante");
  comprobar(prompt.includes("Rampa 1"), "el prompt no incluye la lista del mazo");
  comprobar(prompt.includes("Bracket"), "el prompt no incluye el bracket");
  comprobar(prompt.includes("Empieza directamente"), "el prompt no pide ir al grano");
  comprobar(prompt.includes("Markdown"), "el prompt no pide Markdown");
  comprobar(!prompt.includes("idea del mazo"), "el prompt sigue pidiendo la introducción");
}

// ── IA: techo de tokens y errores ──────────────────────────────────────────
titulo("IA: techo de tokens y errores");
{
  const a = analizarMazo(base);
  const cuerpos = [];
  const fake = async (_url, opciones) => {
    cuerpos.push(JSON.parse(opciones.body).generationConfig);
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "Plan completo." }] }, finishReason: "STOP" }] }),
      { status: 200 },
    );
  };
  const texto = await analizarConIA(base, a, "clave", fake);
  comprobar(texto === "Plan completo.", `texto: ${texto}`);
  comprobar(cuerpos[0]?.thinkingConfig?.thinkingBudget === 0, "no apaga el pensamiento");
  comprobar(cuerpos[0]?.maxOutputTokens === 4096, "no pide margen de salida");
}
{
  const a = analizarMazo(base);
  let llamadas = 0;
  const techos = [];
  const fake = async (_url, opciones) => {
    llamadas += 1;
    techos.push(JSON.parse(opciones.body).generationConfig.maxOutputTokens);
    const finish = llamadas === 1 ? "MAX_TOKENS" : "STOP";
    const texto = llamadas === 1 ? "Se corta a medias" : "Plan entero";
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] }, finishReason: finish }] }),
      { status: 200 },
    );
  };
  const texto = await analizarConIA(base, a, "clave", fake);
  comprobar(llamadas === 2, `llamadas: ${llamadas}`);
  comprobar(texto === "Plan entero", `texto tras reintento: ${texto}`);
  comprobar(techos[1] === 8192, `techo del reintento: ${techos[1]}`);
}
{
  const a = analizarMazo(base);
  const fake = async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "a" }] }, finishReason: "MAX_TOKENS" }] }),
      { status: 200 },
    );
  let error = "";
  try {
    await analizarConIA(base, a, "clave", fake);
  } catch (e) {
    error = String(e);
  }
  comprobar(error.includes("cortado"), `sin error de corte: ${error || "no lanzó"}`);
}
{
  const a = analizarMazo(base);
  const fake = async () =>
    new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 });
  let error = "";
  try {
    await analizarConIA(base, a, "clave", fake);
  } catch (e) {
    error = String(e);
  }
  comprobar(error.includes("bloqueado"), `sin error de bloqueo: ${error || "no lanzó"}`);
}
{
  const a = analizarMazo(base);
  const fake = async () => new Response("{}", { status: 429 });
  let error = "";
  try {
    await analizarConIA(base, a, "clave", fake);
  } catch (e) {
    error = String(e);
  }
  comprobar(error.includes("cuota"), `sin error de cuota: ${error || "no lanzó"}`);
}

// ── Presentación de la respuesta ───────────────────────────────────────────
titulo("Markdown y recorte de la introducción");
{
  const html = markdownDe("## Plan por turnos\n\n### 1-3\n\n- **Sol Ring**\n- Arcane Signet\n\nTexto");
  comprobar(html.includes("<h2>Plan por turnos</h2>"), "no convierte el h2");
  comprobar(html.includes("<h3>1-3</h3>"), "no convierte el h3");
  comprobar(html.includes("<ul>") && html.includes("<strong>Sol Ring</strong>"), "no convierte lista y negrita");
  const crudo = markdownDe("<script>alert(1)</script>");
  comprobar(!crudo.includes("<script>"), "markdown-it deja pasar HTML crudo");
}
{
  const saludo = sinIntroduccion("¡Excelente elección de comandante!\n\n## Plan\n\n- x");
  comprobar(saludo.startsWith("## Plan") && !saludo.includes("Excelente"), `saludo: ${saludo.slice(0, 40)}`);
  const resumen = sinIntroduccion("Este mazo es un potente arquetipo de Equipment.\n\n## Plan\n\n- x");
  comprobar(resumen.startsWith("## Plan"), `resumen: ${resumen.slice(0, 40)}`);
  const directo = "## Plan\n\n- x";
  comprobar(sinIntroduccion(directo) === directo, "toca una respuesta que ya va al grano");
  const conLista = "- uno\n- dos\n\n## Plan";
  comprobar(sinIntroduccion(conLista) === conLista, "se come una respuesta que empieza por lista");
}

// ── Resultado ───────────────────────────────────────────────────────────────
console.log("");
if (fallos.length) {
  for (const f of fallos) console.log(`✗ ${f}`);
  console.log(`\n${comprobados - fallos.length}/${comprobados} comprobaciones correctas`);
  process.exit(1);
}
console.log(`✓ Parser, roles, análisis, bracket, resolver, consejo e IA: ${comprobados} comprobaciones correctas.`);
