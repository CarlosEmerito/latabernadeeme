/**
 * La puerta de la herramienta de Commander, sin navegador y sin red.
 *
 * Comprueba las cuatro piezas que pueden fallar en silencio:
 *
 *   1. El parser del export: secciones, cantidades, sets con números raros
 *      (`C15-56`), acabados y comentarios. Y el mensaje de estado de la
 *      importación, que tiene que decir qué se ha quedado fuera.
 *   2. Los roles: una carta concreta tiene que caer en el rol que toca.
 *   3. El análisis: 100 cartas, singleton, identidad, banlist y bracket.
 *   4. El resolver: lotes de 75, espera entre lotes, reintento por nombre y 429.
 *
 * Los datos de las cartas son de mentira pero con la forma de Scryfall; el
 * parser y los roles se prueban con textos reales de cartas conocidas.
 *
 * Uso: node tools/test/commander.mjs
 */
import { mensajeDeImportacion, parsearExport } from "../../src/lib/commander/export.ts";
import { TIPOS_FILTRO, esTierra, rolesDe, tipoDeCarta } from "../../src/lib/commander/roles.ts";
import { analizarMazo, contarPorTipo, cuentaDeCartas } from "../../src/lib/commander/analisis.ts";
import { consejoDe } from "../../src/lib/commander/consejo.ts";
import { analizarConIA, promptDe } from "../../src/lib/commander/ia.ts";
import { markdownDe, sinIntroduccion } from "../../src/lib/commander/markdown.ts";
import { resolverCartas } from "../../src/lib/commander/scryfall.ts";
import { costeDe } from "../../src/lib/commander/tipos.ts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

// ── 1b. Mensaje de importación ──────────────────────────────────────────────
titulo("Mensaje de importación");
{
  // El export del repro de la ficha: banquillo y maybeboard se descartan, y la
  // página lo callaba.
  const texto = `Commander
1 Atraxa, Praetors' Voice (MUL) 1

Deck
1 Sol Ring (LTC) 284
10 Forest (ZNR) 280

Sideboard
1 Rest in Peace (RTR) 18
1 Toxic Deluge (MMA) 107

Maybeboard
1 Smothering Tithe (RNA) 22
`;
  const { lineas, avisos } = parsearExport(texto);
  const m = mensajeDeImportacion({ total: 100, companions: 0, noEncontradas: [], lineas, avisos });
  const esperado =
    "Listo: 100 cartas y todas resueltas. 2 del banquillo y 1 del maybeboard no cuentan para las 100.";
  comprobar(m === esperado, `mensaje con banquillo y maybeboard: «${m}», esperaba «${esperado}»`);
}
{
  // Sin tableros extra, el mensaje es el de siempre: ni una coletilla.
  const { lineas, avisos } = parsearExport(
    "Deck\n1 Sol Ring (LTC) 284\n\nCompanion\n1 Lutri, the Spellchaser (IKO) 226\n",
  );
  const m = mensajeDeImportacion({ total: 99, companions: 1, noEncontradas: [], lineas, avisos });
  const esperado = "Listo: 99 cartas y 1 companion fuera de las 100 y todas resueltas.";
  comprobar(m === esperado, `mensaje con companion: «${m}», esperaba «${esperado}»`);
}
{
  // Las que no se resuelven y los avisos del parser tampoco cambian de forma.
  const { lineas, avisos } = parsearExport("Deck\n1 Sol Ring (LTC) 284\n1 Carta Inventada (XXX) 1\n");
  const m = mensajeDeImportacion({
    total: 100,
    companions: 0,
    noEncontradas: ["Carta Inventada"],
    lineas,
    avisos,
  });
  const esperado = "Listo: 100 cartas, 1 sin resolver (Carta Inventada).";
  comprobar(m === esperado, `mensaje con una sin resolver: «${m}», esperaba «${esperado}»`);
}
{
  // Se cuentan cartas, no líneas: `4 Rest in Peace` son cuatro, y cada tablero
  // lleva su nombre. El orden es el del export.
  const texto = `Deck
1 Sol Ring (LTC) 284

Sideboard
4 Rest in Peace (RTR) 18

Tokens
2 Soldier (TDM) 1

Attractions
1 Ferris Wheel (UNF) 1
`;
  const { lineas, avisos } = parsearExport(texto);
  const m = mensajeDeImportacion({ total: 100, companions: 0, noEncontradas: [], lineas, avisos });
  const esperado =
    "Listo: 100 cartas y todas resueltas. 4 del banquillo, 2 de las fichas y 1 de las atracciones no cuentan para las 100.";
  comprobar(m === esperado, `mensaje con cantidades: «${m}», esperaba «${esperado}»`);
}
{
  // Una sola carta descartada: el verbo va en singular.
  const { lineas, avisos } = parsearExport("Deck\n1 Sol Ring (LTC) 284\n\nMaybeboard\n1 Smothering Tithe (RNA) 22\n");
  const m = mensajeDeImportacion({ total: 100, companions: 0, noEncontradas: [], lineas, avisos });
  const esperado = "Listo: 100 cartas y todas resueltas. 1 del maybeboard no cuenta para las 100.";
  comprobar(m === esperado, `mensaje con una descartada: «${m}», esperaba «${esperado}»`);
}
{
  // Los avisos del parser se enseñan aunque el resto del export se entienda.
  const { lineas, avisos } = parsearExport("Deck\n1 Sol Ring (LTC) 284\n*F*\n");
  const m = mensajeDeImportacion({ total: 100, companions: 0, noEncontradas: [], lineas, avisos });
  const esperado = "Listo: 100 cartas y todas resueltas. No se entiende la línea: «*F*»";
  comprobar(m === esperado, `mensaje con un aviso: «${m}», esperaba «${esperado}»`);
}
{
  // El companion se anuncia aparte y no entra en el recuento de descartadas.
  const { lineas, avisos } = parsearExport(
    "Deck\n1 Sol Ring (LTC) 284\n\nCompanion\n1 Lutri, the Spellchaser (IKO) 226\n\nSideboard\n1 Rest in Peace (RTR) 18\n",
  );
  const m = mensajeDeImportacion({ total: 100, companions: 1, noEncontradas: [], lineas, avisos });
  const esperado =
    "Listo: 100 cartas y 1 companion fuera de las 100 y todas resueltas. 1 del banquillo no cuenta para las 100.";
  comprobar(m === esperado, `mensaje con companion y banquillo: «${m}», esperaba «${esperado}»`);
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

/*
 * El singleton es por carta, no por línea del export: dos impresiones del mismo
 * objeto son dos líneas con cantidad 1 (`1 Sol Ring (LTC) 284` y
 * `1 Sol Ring (CMM) 951`), así que mirar la cantidad de cada línea deja pasar un
 * mazo con dos copias como legal. Es el dato central de la herramienta —un mazo
 * ilegal enseñado en verde— y el export lo produce tal cual en cuanto el mismo
 * objeto aparece en dos impresiones.
 *
 * Lo que se agrupa es el nombre, y con dos contrapesos para no cambiar un falso
 * negativo por un falso positivo: las básicas de dos impresiones se repiten sin
 * problema y las cartas que permiten repetir lo siguen permitiendo.
 */
{
  const solRing = carta("Sol Ring", "Artifact", "{T}: Add {C}{C}.", { cmc: 1, set: "LTC", collector_number: "284" });
  const solRingCmm = { ...solRing, id: "sol-ring-cmm", set: "CMM", collector_number: "951" };
  const a = analizarMazo(mazoDe([[bosque, 36], [solRing, 1], [solRingCmm, 1], ...cartasBase.slice(2)], comandante));
  comprobar(a.total === 100, `el mazo de la prueba tiene que dar 100 cartas y da ${a.total}`);
  comprobar(
    !a.legalidad.ok && a.legalidad.problemas.some((p) => p.includes("Sol Ring")),
    `dos impresiones de la misma carta son dos copias y el mazo sale legal: ${JSON.stringify(a.legalidad.problemas)}`,
  );
  const menciones = a.legalidad.problemas.filter((p) => p.includes("Sol Ring")).length;
  comprobar(
    menciones === 1,
    `el duplicado se avisa ${menciones} veces: tiene que nombrar la carta una vez, con el total de copias`,
  );
}
{
  const znr = { ...bosque, id: "forest-znr", set: "ZNR", collector_number: "280" };
  const mid = { ...bosque, id: "forest-mid", set: "MID", collector_number: "293" };
  const a = analizarMazo(mazoDe([[znr, 18], [mid, 18], ...cartasBase], comandante));
  comprobar(a.basicas === 36, `las básicas de dos impresiones son ${a.basicas} y tienen que ser 36`);
  comprobar(
    a.legalidad.ok,
    `las básicas de dos impresiones tienen que seguir siendo legales: ${a.legalidad.problemas.join(" · ")}`,
  );
}
{
  const ratas = carta("Relentless Rats", "Creature — Rat", "A deck can have any number of cards named Relentless Rats.", {
    cmc: 3,
  });
  const ratas2 = { ...ratas, id: "relentless-rats-2" };
  const a = analizarMazo(mazoDe([[bosque, 36], [ratas, 1], [ratas2, 1], ...cartasBase.slice(2)], comandante));
  comprobar(
    a.legalidad.ok,
    `Relentless Rats se repite entre impresiones y el mazo sale ilegal: ${a.legalidad.problemas.join(" · ")}`,
  );
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
/*
 * El companion de un export de Moxfield va en su propia sección y en Commander
 * no cuenta para las 100: es una carta del banquillo que se declara al empezar.
 * El parser ya lo marca con su tablero, así que un mazo legal de 1 comandante +
 * 99 cartas + 1 companion no puede salir «101 cartas» ni quedarse ilegal.
 */
{
  const comp = carta(
    "Jegantha, el Manantial",
    "Legendary Creature — Elemental Elk",
    "Companion — Each permanent card in your starting deck has at most one of each mana symbol in its mana cost.",
    { color_identity: ["G"], cmc: 5 },
  );
  const m = mazoDe([[bosque, 36], ...cartasBase], comandante);
  m.cartas.push({ cantidad: 1, carta: comp, tablero: "companion", linea: { cantidad: 1, nombre: comp.name, tablero: "companion" } });
  const a = analizarMazo(m);
  comprobar(a.total === 100, `un mazo de 100 con companion tiene que dar 100 cartas y da ${a.total}`);
  comprobar(a.legalidad.ok, `un mazo legal con companion sale ilegal: ${a.legalidad.problemas.join(" · ")}`);
  comprobar(!a.roles.some((r) => r.cartas.includes(comp.name)), "el companion no cuenta como una carta más del mazo en los roles");
}
{
  // Fuera de las 100, pero su identidad de color sí es exigible: un companion
  // con un color que el comandante no tiene sigue siendo un problema.
  const azul = carta(
    "Companion Azul",
    "Legendary Creature — Elemental",
    "Companion — Your starting deck contains only cards with odd mana values.",
    { color_identity: ["U"], cmc: 5 },
  );
  const m = mazoDe([[bosque, 36], ...cartasBase], comandante);
  m.cartas.push({ cantidad: 1, carta: azul, tablero: "companion", linea: { cantidad: 1, nombre: azul.name, tablero: "companion" } });
  const a = analizarMazo(m);
  comprobar(a.total === 100, `el companion no suma a las 100 y da ${a.total}`);
  comprobar(
    !a.legalidad.ok && a.legalidad.problemas.some((p) => p.includes("colores")),
    "la identidad de color del companion tiene que seguir comprobándose",
  );
}

{
  // El companion se ve en el análisis pero no suma en tierras, curva, media ni
  // precio: si sumara, un mazo legal saldría más caro y con otra media de valor.
  const caro = carta(
    "Companion Caro",
    "Legendary Creature — Elemental",
    "Companion — Your starting deck contains only cards with odd mana values.",
    { color_identity: ["G"], cmc: 6, prices: { eur: "250.00", usd: "250.00" } },
  );
  const sin = analizarMazo(mazoDe([[bosque, 36], ...cartasBase], comandante));
  const m = mazoDe([[bosque, 36], ...cartasBase], comandante);
  m.cartas.push({ cantidad: 1, carta: caro, tablero: "companion", linea: { cantidad: 1, nombre: caro.name, tablero: "companion" } });
  const a = analizarMazo(m);
  comprobar(
    a.companion.length === 1 && a.companion[0] === caro.name,
    `el análisis no nombra el companion: [${a.companion.join(", ")}]`,
  );
  comprobar(a.total === sin.total, `el companion cambia el total: ${sin.total} → ${a.total}`);
  comprobar(a.tierras === sin.tierras, `el companion cambia las tierras: ${sin.tierras} → ${a.tierras}`);
  comprobar(Math.abs(a.media - sin.media) < 1e-9, `el companion cambia la media: ${sin.media} → ${a.media}`);
  comprobar(
    a.curva.length === sin.curva.length && a.curva.every((c, i) => c.mv === sin.curva[i].mv && c.n === sin.curva[i].n),
    "el companion cambia la curva",
  );
  comprobar(
    Math.abs(a.precio.total - sin.precio.total) < 1e-9,
    `el companion suma al precio: ${sin.precio.total} → ${a.precio.total}`,
  );
}

/*
 * Una carta modal de doble cara cuyo dorso es una tierra se juega por su cara
 * frontal, así que es un hechizo. Scryfall publica `type_line` con las dos caras
 * y el valor de la frontal («Sorcery // Land», cmc 3), y el `mana_cost` va en
 * cada cara. Tomando ese `type_line` entero la carta pasaba por tierra para
 * todo: fuera de la curva y de la media, sin ningún rol —una recursión que no
 * cuenta como recursión— y, encima, contada en dos tipos a la vez.
 */
{
  const dobleCara = {
    id: "mdfc-bala-ged",
    name: "Bala Ged Recovery // Bala Ged Sanctuary",
    cmc: 3,
    type_line: "Sorcery // Land",
    color_identity: ["G"],
    legalities: { commander: "legal" },
    card_faces: [
      {
        name: "Bala Ged Recovery",
        mana_cost: "{2}{G}",
        type_line: "Sorcery",
        oracle_text: "Return target card from your graveyard to your hand.",
      },
      {
        name: "Bala Ged Sanctuary",
        type_line: "Land",
        oracle_text: "Bala Ged Sanctuary enters the battlefield tapped.",
      },
    ],
  };
  comprobar(
    !esTierra(dobleCara),
    "una carta con dorso de tierra no es una tierra: manda la cara frontal",
  );
  comprobar(
    rolesDe(dobleCara).includes("recursion"),
    `la cara frontal es recursión y los roles dicen ${rolesDe(dobleCara).join(", ") || "nada"}`,
  );

  const hechizos = cartasBase.slice(0, 62).map(([c]) => c);
  const m = mazoDe([[bosque, 36], [dobleCara, 1], ...hechizos.map((c) => [c, 1])], comandante);
  const a = analizarMazo(m);
  comprobar(a.total === 100, `el mazo de la prueba tiene que dar 100 cartas y da ${a.total}`);
  comprobar(a.tierras === 36, `tierras ${a.tierras}: la doble cara no es una tierra más`);
  comprobar(
    a.curva.some((t) => t.mv === 3 && t.n === 2),
    `la curva del tramo 3 tiene que sumar 2 (comandante y doble cara): ${JSON.stringify(a.curva)}`,
  );
  comprobar(
    Math.abs(a.media - 130 / 64) < 1e-9,
    `la media tiene que contar los dos hechizos de valor 3 y da ${a.media}`,
  );
  const suma = a.tipos.reduce((n, t) => n + t.n, 0);
  comprobar(suma === a.total, `los tipos suman ${suma} sobre ${a.total} cartas: la doble cara va contada dos veces`);
  comprobar(
    a.tipos.every((t) => t.tipo !== "Land" || t.n === 36),
    `las tierras del reparto por tipo son ${a.tipos.find((t) => t.tipo === "Land")?.n} y no 36`,
  );
}

/*
 * Las básicas de nieve también son básicas y se pueden repetir sin límite.
 *
 * Scryfall escribe su línea de tipo «Basic Snow Land — Forest» (comprobado en
 * su API: /cards/named?exact=Snow-Covered+Forest), así que el supertipo «Snow»
 * va en medio y un patrón de «basic land» seguido deja la carta fuera. Las
 * básicas de nieve se juegan (mazos de nieve, Into the North, Extraplanar Lens)
 * y no son una tierra cualquiera: un mazo legal de 100 con 36 de ellas salía
 * con «aparece 36 veces y no es tierra básica», el bracket en «Sin bracket» y
 * `basicas` a 0, que es lo que enseñan la ficha y el informe de consejo.
 */
{
  const nieve = carta("Snow-Covered Forest", "Basic Snow Land — Forest", "({T}: Add {G}.)", {
    color_identity: ["G"],
    cmc: 0,
    prices: { eur: "0.30", usd: "0.30" },
  });
  const m = mazoDe([[nieve, 36], ...cartasBase], comandante);
  const a = analizarMazo(m);
  comprobar(a.total === 100, `el mazo de la prueba tiene que dar 100 cartas y da ${a.total}`);
  comprobar(a.tierras === 36, `tierras con básicas de nieve: ${a.tierras}`);
  comprobar(a.basicas === 36, `las básicas de nieve cuentan como básicas y son ${a.basicas}`);
  comprobar(
    a.legalidad.ok,
    `un mazo legal con básicas de nieve sale ilegal: ${a.legalidad.problemas.join(" · ")}`,
  );
  comprobar(
    !a.legalidad.problemas.some((p) => p.includes("Snow-Covered Forest")),
    `las básicas de nieve se pueden repetir y salen como problema: ${a.legalidad.problemas.join(" · ")}`,
  );
  comprobar(
    a.bracket.etiqueta === "Bracket 1-2",
    `un mazo sin Game Changers con básicas de nieve tiene que dar Bracket 1-2 y da ${a.bracket.etiqueta}`,
  );
  // El resto de básicas de nieve, una por color: mismo supertipo, otro subtipo.
  for (const [nombre, subtipo] of [
    ["Snow-Covered Plains", "Plains"],
    ["Snow-Covered Island", "Island"],
    ["Snow-Covered Swamp", "Swamp"],
    ["Snow-Covered Mountain", "Mountain"],
  ]) {
    const otra = carta(nombre, `Basic Snow Land — ${subtipo}`, "({T}: Add {G}.)", { color_identity: ["G"], cmc: 0 });
    const suyo = analizarMazo(mazoDe([[otra, 36], ...cartasBase], comandante));
    comprobar(
      suyo.basicas === 36 && suyo.legalidad.ok,
      `${nombre} tiene que contar como básica (basicas ${suyo.basicas}) y salir legal: ${suyo.legalidad.problemas.join(" · ")}`,
    );
  }
}

/*
 * Y el permiso de repetir es de la básica, no de cualquier tierra: aflojar el
 * patrón hasta «cualquier tierra se repite» cambiaría un falso positivo por un
 * falso negativo, que es peor.
 */
{
  const torre = carta("Command Tower", "Land", "{T}: Add one mana of any color in your commander's color identity.", {
    color_identity: ["G"],
    cmc: 0,
  });
  const a = analizarMazo(mazoDe([[torre, 36], ...cartasBase], comandante));
  comprobar(
    !a.legalidad.ok && a.legalidad.problemas.some((p) => p.includes("Command Tower")),
    "una tierra no básica repetida tiene que seguir siendo un problema de legalidad",
  );
}

// La lista de mazos guardados anuncia cartas, no líneas del export: el export de
// Moxfield agrupa las básicas (`10 Forest (ZNR) 280`), así que un mazo de 100
// llegaba a la etiqueta como 91. La cifra tiene que coincidir con la de la ficha.
titulo("Cuenta de cartas de un mazo guardado");
{
  const sueltas = [];
  for (let i = 1; i <= 89; i++) sueltas.push([rampa(i), 1]);
  const m = mazoDe([[bosque, 10], ...sueltas], comandante);
  const guardado = [...m.comandantes, ...m.cartas];
  const a = analizarMazo(m);
  comprobar(guardado.length === 91, `el export tiene ${guardado.length} líneas y esperaba 91`);
  comprobar(a.total === 100, `la ficha dice ${a.total} cartas y esperaba 100`);
  comprobar(
    cuentaDeCartas(guardado) === 100,
    `la lista de guardados anuncia ${cuentaDeCartas(guardado)} cartas y el mazo tiene 100`,
  );
  comprobar(
    cuentaDeCartas(guardado) === a.total,
    `la lista dice ${cuentaDeCartas(guardado)} y la ficha ${a.total} para el mismo mazo`,
  );

  const solitario = [{ cantidad: 1, carta: rampa(1), tablero: "main", linea: { cantidad: 1, nombre: "Rampa 1", tablero: "main" } }];
  comprobar(cuentaDeCartas(solitario) === 1, `una sola carta se anuncia como ${cuentaDeCartas(solitario)}`);

  const companero = carta("Companero", "Legendary Creature — Cat", "Companion — Your starting deck contains only permanents.", { cmc: 3 });
  const conCompanion = mazoDe([[bosque, 10], ...sueltas], comandante);
  conCompanion.cartas.push({ cantidad: 1, carta: companero, tablero: "companion", linea: { cantidad: 1, nombre: "Companero", tablero: "companion" } });
  comprobar(
    cuentaDeCartas([...conCompanion.comandantes, ...conCompanion.cartas]) === 100,
    "el companion no suma a las 100",
  );
  comprobar(analizarMazo(conCompanion).companion.length === 1, "el companion se pierde del análisis");
}

// ── 4. Tipo de cada carta y recuento del desplegable ────────────────────────
/*
 * El desplegable «Tipo» de la rejilla anuncia un número al lado de cada tipo y
 * el filtro devuelve cartas. Cuando el número sale del desglose por tipos —que
 * cuenta cada carta una vez por cada tipo que lleva— y el filtro se queda con el
 * primero que casa, para toda carta de tipo múltiple el desplegable promete más
 * cartas de las que enseña, y el lector ve las dos cifras en el mismo sitio.
 *
 * El caso es corriente en Commander: `Baleful Strix` es `Artifact Creature`,
 * `Dryad Arbor` es `Land Creature` y los equipos son `Artifact`. En el mazo de
 * abajo el desplegable anunciaba 4 criaturas y 3 artefactos, y el filtro
 * devolvía 3 y 2.
 */
titulo("Tipo de cada carta y recuento del desplegable");
{
  const strix = carta("Baleful Strix", "Artifact Creature — Bird", "Flying", { cmc: 2 });
  const arbor = carta("Dryad Arbor", "Land Creature — Forest Dryad", "", { cmc: 0 });
  const equipo = carta("Espada de prueba", "Artifact — Equipment", "Equipped creature gets +1/+1.", { cmc: 1 });
  const sol = carta("Sol Ring", "Artifact", "{T}: Add {C}{C}.", { cmc: 1 });
  const elfo = carta("Elfo de prueba", "Creature — Elf", "", { cmc: 1 });
  const sueltas = [];
  for (let i = 1; i <= 59; i++) sueltas.push([rampa(100 + i), 1]);
  const m = mazoDe([[strix, 1], [arbor, 1], [equipo, 1], [sol, 1], [elfo, 1], [bosque, 35], ...sueltas], comandante);
  const entradas = [...m.comandantes, ...m.cartas];
  const anunciado = new Map(contarPorTipo(entradas).map((t) => [t.tipo, t.n]));
  const devueltas = (tipo) =>
    entradas.filter((e) => tipoDeCarta(e.carta) === tipo).reduce((n, e) => n + e.cantidad, 0);

  // La clasificación: una sola respuesta por carta, y las tierras mandan.
  comprobar(tipoDeCarta(arbor) === "Land", `Dryad Arbor se clasifica como ${tipoDeCarta(arbor)} y no como Land`);
  comprobar(tipoDeCarta(strix) === "Creature", `Baleful Strix se clasifica como ${tipoDeCarta(strix)} y no como Creature`);
  comprobar(tipoDeCarta(equipo) === "Artifact", `un equipo se clasifica como ${tipoDeCarta(equipo)} y no como Artifact`);
  comprobar(tipoDeCarta(bosque) === "Land", `una tierra básica se clasifica como ${tipoDeCarta(bosque)}`);

  // El número de cada opción es el de las cartas que ese tipo devuelve.
  for (const tipo of TIPOS_FILTRO) {
    const n = anunciado.get(tipo);
    if (!n) continue;
    comprobar(
      n === devueltas(tipo),
      `${tipo}: el desplegable anuncia ${n} y el filtro devuelve ${devueltas(tipo)}`,
    );
  }
  comprobar(anunciado.get("Creature") === 3, `Creature anuncia ${anunciado.get("Creature")} y el filtro devuelve 3`);
  comprobar(anunciado.get("Artifact") === 2, `Artifact anuncia ${anunciado.get("Artifact")} y el filtro devuelve 2`);

  // Lo que anuncian las opciones no puede pasar de las cartas del mazo.
  const suma = [...anunciado.values()].reduce((a, b) => a + b, 0);
  comprobar(suma === cuentaDeCartas(entradas), `las opciones suman ${suma} cartas y el mazo tiene ${cuentaDeCartas(entradas)}`);

  // El desglose del lateral sigue contando los tipos múltiples: es un desglose.
  const a = analizarMazo(m);
  comprobar(a.tipos.find((t) => t.tipo === "Creature")?.n === 4, `el desglose cuenta ${a.tipos.find((t) => t.tipo === "Creature")?.n} criaturas y son 4`);
  comprobar(a.tipos.find((t) => t.tipo === "Artifact")?.n === 3, `el desglose cuenta ${a.tipos.find((t) => t.tipo === "Artifact")?.n} artefactos y son 3`);
}

// ── 5. Resolver ─────────────────────────────────────────────────────────────
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
/*
 * Una red que acepta la conexión y no contesta no rechaza nunca: sin plazo, la
 * promesa se queda colgada y la página no sale de «Resolviendo N líneas con
 * Scryfall…». El plazo tiene que llegarle al `fetch` como señal de aborto y, al
 * vencer, la función tiene que fallar con un mensaje que lo diga.
 *
 * El doble rechaza cuando le llega la señal; si la petición no lleva ninguna, no
 * hay plazo que esperar y contesta en el acto, que es el rojo de este bloque.
 */
{
  const lineas = [{ cantidad: 1, nombre: "Sol Ring", tablero: "main" }];
  let init = null;
  const colgada = (_url, opciones = {}) => {
    init = opciones;
    if (!opciones.signal) return Promise.reject(new Error("la petición no lleva plazo"));
    return new Promise((_, rechazar) => {
      opciones.signal.addEventListener("abort", () => rechazar(new Error("abortada por el plazo")));
    });
  };
  let error = null;
  try {
    await resolverCartas(lineas, { fetchImpl: colgada, plazoMs: 30 });
  } catch (e) {
    error = e;
  }
  comprobar(!!init?.signal, "la petición a Scryfall no lleva señal de plazo");
  comprobar(
    /no ha contestado|tardado|demasiado/i.test(String(error)),
    `una petición colgada tiene que vencer con un mensaje que diga que no ha contestado a tiempo y dio: ${error}`,
  );
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
/*
 * El companion no está en las 100: se declara al empezar la partida y vive
 * fuera del mazo. El análisis ya lo deja fuera de total, tierras, curva y
 * media, pero el consejo recorría `mazo.cartas` sin filtro y lo metía en el
 * plan: «Lo más barato que tienes es <companion>», una carta que el lector no
 * tiene en la mano inicial. El plan tiene que leer las mismas cartas que
 * cuenta el análisis.
 */
{
  const companion = carta(
    "Companion Barato",
    "Legendary Creature — Elemental",
    "Companion — Your starting deck contains only cards with odd mana values.",
    { color_identity: ["G"], cmc: 0 },
  );
  const m = mazoDe([[bosque, 36], ...cartasBase], comandante);
  m.cartas.push({
    cantidad: 1,
    carta: companion,
    tablero: "companion",
    linea: { cantidad: 1, nombre: companion.name, tablero: "companion" },
  });
  const a = analizarMazo(m);
  comprobar(a.total === 100, `el mazo de la prueba tiene que dar 100 cartas y da ${a.total}`);
  const c = consejoDe(m, a);
  const plan = c.secciones.find((s) => s.titulo === "Plan de juego")?.parrafos.join(" ") ?? "";
  const todo = c.secciones.map((s) => s.parrafos.join(" ")).join(" ");
  comprobar(
    !todo.includes(companion.name),
    `el consejo cita el companion, que no está en las 100: «${plan}»`,
  );
  comprobar(
    plan.includes("Rampa 1"),
    `el plan de juego tiene que seguir citando cartas del mazo: «${plan}»`,
  );
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
/*
 * Un proveedor que acepta la conexión y no contesta deja la llamada colgada
 * igual que Scryfall: la clave se pega a mano y el estado se queda en
 * «Analizando el mazo con Gemini…» para siempre. El plazo se pasa como quinto
 * argumento para que la pasada dure milisegundos.
 */
{
  const a = analizarMazo(base);
  let init = null;
  const colgada = (_url, opciones = {}) => {
    init = opciones;
    if (!opciones.signal) return Promise.reject(new Error("la petición a Gemini no lleva plazo"));
    return new Promise((_, rechazar) => {
      opciones.signal.addEventListener("abort", () => rechazar(new Error("abortada por el plazo")));
    });
  };
  let error = null;
  try {
    await analizarConIA(base, a, "clave", colgada, 30);
  } catch (e) {
    error = e;
  }
  comprobar(!!init?.signal, "la petición a Gemini no lleva señal de plazo");
  comprobar(
    /no ha contestado|tardado|demasiado/i.test(String(error)),
    `una petición colgada a Gemini tiene que vencer con un mensaje que diga que no ha contestado a tiempo y dio: ${error}`,
  );
  comprobar(/Gemini/.test(String(error)), `el mensaje tiene que nombrar la fuente y dio: ${error}`);
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

// ── Dos comandantes y su habilitación ───────────────────────────────────────
/*
 * En Commander se pueden llevar dos comandantes solo si la carta lo permite:
 * `Partner` (o `Partner with …`), `Friends forever`, o `Choose a Background` con
 * un Background como segundo comandante. Hoy lo único que se mira es que no haya
 * más de dos, así que dos legendarias cualesquiera —Krenko y Zada— salen
 * «Legal en Commander» y con Bracket 1-2: un mazo ilegal enseñado en verde.
 *
 * Los contrapesos son la otra mitad y no se pueden dejar fuera: una pareja de
 * partner de verdad y un `Choose a Background` con su Background son legales
 * (Scryfall da los dos como `legal` en commander y sus `keywords` lo dicen), y un
 * mazo de un solo comandante no tiene que pasar por esta regla.
 */
titulo("Dos comandantes y su habilitación");
{
  const comandante = (nombre, tipo = "Legendary Creature — Goblin", texto = "", extra = {}) => ({
    cantidad: 1,
    carta: { ...carta(nombre, tipo, texto), color_identity: [], cmc: 3, ...extra },
    tablero: "commander",
    linea: { cantidad: 1, nombre, tablero: "commander" },
  });
  const partner = (nombre) =>
    comandante(nombre, "Legendary Creature — Human", "Partner (You can have two commanders if both have partner.)", {
      keywords: ["Partner"],
    });
  const relleno = (n) =>
    Array.from({ length: n }, (_, i) => ({
      cantidad: 1,
      carta: carta(`Relleno ${i}`, "Creature — Goblin", "", { color_identity: [], cmc: 2 }),
      tablero: "main",
      linea: { cantidad: 1, nombre: `Relleno ${i}`, tablero: "main" },
    }));
  const mazoCon = (comandantes) => ({
    id: "prueba",
    nombre: "Prueba",
    creado: "2026-01-01T00:00:00.000Z",
    fuente: "export",
    comandantes,
    cartas: relleno(100 - comandantes.length),
    noEncontradas: [],
  });
  const problemas = (a) => a.legalidad.problemas.join(" · ");

  const sinHabilitacion = analizarMazo(mazoCon([comandante("Krenko, Mob Boss"), comandante("Zada, Hedron Grinder")]));
  comprobar(
    !sinHabilitacion.legalidad.ok,
    `dos comandantes sin partner son ilegales y el mazo sale legal: ${problemas(sinHabilitacion) || "sin problemas"}`,
  );
  comprobar(
    /partner/i.test(problemas(sinHabilitacion)),
    `el problema tiene que nombrar el partner y dice: ${problemas(sinHabilitacion) || "nada"}`,
  );
  comprobar(
    sinHabilitacion.bracket.etiqueta === "Sin bracket",
    `un mazo ilegal no tiene bracket y anuncia «${sinHabilitacion.bracket.etiqueta}»`,
  );

  const conPartner = analizarMazo(mazoCon([partner("Tymna the Weaver"), partner("Thrasios, Triton Hero")]));
  comprobar(
    conPartner.legalidad.ok,
    `una pareja de partner es legal y sale ilegal: ${problemas(conPartner) || "sin problemas"}`,
  );

  // `Partner with …` es la misma puerta con el nombre de la pareja.
  const conPartnerWith = analizarMazo(
    mazoCon([
      comandante("Kediss, Emberclaw Familiar", "Legendary Creature — Lizard", "Partner with Akiri, Line-Slinger", {
        keywords: ["Partner"],
      }),
      comandante("Akiri, Line-Slinger", "Legendary Creature — Kor Warrior", "Partner with Kediss, Emberclaw Familiar", {
        keywords: ["Partner"],
      }),
    ]),
  );
  comprobar(
    conPartnerWith.legalidad.ok,
    `una pareja de «Partner with» es legal y sale ilegal: ${problemas(conPartnerWith) || "sin problemas"}`,
  );

  const conBackground = analizarMazo(
    mazoCon([
      comandante("Burakos, Party Leader", "Legendary Creature — Orc Warrior", "Choose a Background (You can have a Background as a second commander.)", {
        keywords: ["Choose a background"],
      }),
      comandante("Folk Hero", "Legendary Enchantment — Background", "Commander creatures you own have …", {}),
    ]),
  );
  comprobar(
    conBackground.legalidad.ok,
    `un «Choose a Background» con su Background es legal y sale ilegal: ${problemas(conBackground) || "sin problemas"}`,
  );

  const unoSolo = analizarMazo(mazoCon([comandante("Krenko, Mob Boss")]));
  comprobar(
    unoSolo.legalidad.ok,
    `un mazo de un solo comandante no tiene que pasar por la regla del partner y sale ilegal: ${problemas(unoSolo) || "sin problemas"}`,
  );
}

// ── «Partner with» empareja solo con la carta que nombra ────────────────────
/*
 * «Partner with <nombre>» no es un partner libre: la carta se puede emparejar
 * solo con la que nombra (regla 702.124e). El análisis lo trata como partner a
 * secas —`habilitacionDe` busca la palabra «partner» en `keywords` y en el
 * texto, y el nombre que va detrás se pierde—, así que Brallin, Skyshark Rider
 * con Tymna the Weaver sale «Legal en Commander» y con Bracket 1-2, y ese mazo
 * no se puede jugar.
 *
 * Los datos son los de Scryfall: Brallin trae `keywords: ["Partner with",
 * "Partner"]` y «Partner with Shabraz, the Skyshark (When this creature
 * enters…)», Shabraz los mismos con el nombre al revés, y Tymna
 * `["Lifelink", "Partner"]` con «Partner (You can have two commanders if both
 * have partner.)». Ojo con el atajo: las cartas de «Partner with» también
 * declaran «Partner» en `keywords`, así que no vale decidir por esa lista; lo
 * que distingue el caso es el nombre que va detrás de «Partner with».
 *
 * Los contrapesos son la otra mitad: la pareja que sí se nombra (Brallin con
 * Shabraz) y dos partner libres (Tymna con Thrasios) siguen siendo legales, y
 * un arreglo que las tumbe cambia un falso positivo por un falso negativo.
 */
titulo("«Partner with» empareja solo con la carta que nombra");
{
  const comandante = (nombre, tipo, texto, extra = {}) => ({
    cantidad: 1,
    carta: {
      ...carta(nombre, tipo, texto),
      color_identity: [],
      cmc: 3,
      legalities: { commander: "legal" },
      ...extra,
    },
    tablero: "commander",
    linea: { cantidad: 1, nombre, tablero: "commander" },
  });
  const brallin = comandante(
    "Brallin, Skyshark Rider",
    "Legendary Creature — Human Shaman",
    "Partner with Shabraz, the Skyshark (When this creature enters, target player may put Shabraz into their hand from their library, then shuffle.)\nWhenever you discard a card, put a +1/+1 counter on Brallin.",
    { keywords: ["Partner with", "Partner"] },
  );
  const shabraz = comandante(
    "Shabraz, the Skyshark",
    "Legendary Creature — Shark Bird",
    "Partner with Brallin, Skyshark Rider\nFlying",
    { keywords: ["Flying", "Partner with", "Partner"] },
  );
  const tymna = comandante(
    "Tymna the Weaver",
    "Legendary Creature — Human Cleric",
    "Lifelink\nAt the beginning of each of your postcombat main phases, you may pay X life, where X is the number of opponents that were dealt combat damage this turn. If you do, draw X cards.\nPartner (You can have two commanders if both have partner.)",
    { keywords: ["Lifelink", "Partner"] },
  );
  const thrasios = comandante(
    "Thrasios, Triton Hero",
    "Legendary Creature — Merfolk Wizard",
    "{4}: Scry 1, then reveal the top card of your library. If it's a land card, put it onto the battlefield tapped. Otherwise, draw a card.\nPartner (You can have two commanders if both have partner.)",
    { keywords: ["Partner"] },
  );
  const relleno = (n) =>
    Array.from({ length: n }, (_, i) => ({
      cantidad: 1,
      carta: carta(`Relleno ${i}`, "Creature — Goblin", "", { color_identity: [], cmc: 2 }),
      tablero: "main",
      linea: { cantidad: 1, nombre: `Relleno ${i}`, tablero: "main" },
    }));
  const mazoCon = (comandantes) => ({
    id: "prueba",
    nombre: "Prueba",
    creado: "2026-01-01T00:00:00.000Z",
    fuente: "export",
    comandantes,
    cartas: relleno(100 - comandantes.length),
    noEncontradas: [],
  });
  const problemas = (a) => a.legalidad.problemas.join(" · ");

  // Brallin solo puede ir con Shabraz: con Tymna el mazo no se puede jugar.
  const conOtraPartner = analizarMazo(mazoCon([brallin, tymna]));
  comprobar(
    !conOtraPartner.legalidad.ok,
    `una carta de «Partner with» con otra partner cualquiera es ilegal y el mazo sale legal: ${problemas(conOtraPartner) || "sin problemas"}`,
  );
  comprobar(
    /partner/i.test(problemas(conOtraPartner)),
    `el problema tiene que nombrar el partner restringido y dice: ${problemas(conOtraPartner) || "nada"}`,
  );
  comprobar(
    conOtraPartner.bracket.etiqueta === "Sin bracket",
    `un mazo ilegal no tiene bracket y anuncia «${conOtraPartner.bracket.etiqueta}»`,
  );

  // Contrapeso: la pareja que se nombra en las dos cartas sí es legal.
  const conSuPareja = analizarMazo(mazoCon([brallin, shabraz]));
  comprobar(
    conSuPareja.legalidad.ok,
    `«Partner with» con la carta que nombra es legal y sale ilegal: ${problemas(conSuPareja) || "sin problemas"}`,
  );

  // Contrapeso: dos partner libres siguen emparejándose con cualquiera.
  const dosPartner = analizarMazo(mazoCon([tymna, thrasios]));
  comprobar(
    dosPartner.legalidad.ok,
    `dos partner libres son legales y salen ilegales: ${problemas(dosPartner) || "sin problemas"}`,
  );
}

// ── Coste de maná de las cartas de dos caras ────────────────────────────────
/*
 * En las cartas de aventura y en las partidas el `mana_cost` de nivel superior
 * ya trae los dos costes separados por «//» (`"{2}{R} // {1}{R}"` en
 * Bonecrusher Giant, comprobado con Scryfall), y cada cara trae el suyo. Unir
 * las tres cosas deja cada coste tres veces —`"{2}{R} // {1}{R} {2}{R}
 * {1}{R}"`—, que es lo que acaba pintando la rejilla en el coste de la carta y
 * lo que hincha los símbolos de color del mazo: cuatro por carta en vez de uno.
 *
 * Los símbolos se cuentan de la cara frontal, que es la convención del resto del
 * módulo (`tipoFrontal`, `esTierra`, `tipoDeCarta`) y el coste con el que se
 * juega la carta. Los contrapesos: las cartas de una cara no cambian y las de
 * doble cara cuyo dorso es tierra (Shatterskull, Bala Ged) siguen igual, porque
 * su dorso no tiene coste.
 */
titulo("Coste de maná de las cartas de dos caras");
{
  const dobleCara = (nombre, coste, type_line, caras, extra = {}) => ({
    ...carta(nombre, type_line, ""),
    mana_cost: coste,
    cmc: 3,
    color_identity: ["R"],
    card_faces: caras,
    ...extra,
  });
  const bone = dobleCara("Bonecrusher Giant // Stomp", "{2}{R} // {1}{R}", "Creature — Giant // Instant — Adventure", [
    { name: "Bonecrusher Giant", mana_cost: "{2}{R}", type_line: "Creature — Giant" },
    { name: "Stomp", mana_cost: "{1}{R}", type_line: "Instant — Adventure" },
  ]);
  comprobar(costeDe(bone) === "{2}{R} // {1}{R}", `el coste de una aventura se pinta «${costeDe(bone)}»`);
  comprobar(
    !/\{2\}\{R\}.*\{2\}\{R\}/.test(costeDe(bone)),
    `el coste de la aventura repite el mismo grupo de símbolos: «${costeDe(bone)}»`,
  );

  const fireIce = dobleCara("Fire // Ice", "{1}{R} // {1}{U}", "Instant // Instant", [
    { name: "Fire", mana_cost: "{1}{R}", type_line: "Instant" },
    { name: "Ice", mana_cost: "{1}{U}", type_line: "Instant" },
  ]);
  comprobar(costeDe(fireIce) === "{1}{R} // {1}{U}", `el coste de una partida se pinta «${costeDe(fireIce)}»`);

  const brazen = dobleCara("Brazen Borrower // Petty Theft", "{1}{U}{U} // {1}{U}", "Creature — Faerie Rogue // Instant — Adventure", [
    { name: "Brazen Borrower", mana_cost: "{1}{U}{U}", type_line: "Creature — Faerie Rogue" },
    { name: "Petty Theft", mana_cost: "{1}{U}", type_line: "Instant — Adventure" },
  ]);
  comprobar(
    costeDe(brazen) === "{1}{U}{U} // {1}{U}",
    `el coste de Brazen Borrower se pinta «${costeDe(brazen)}»`,
  );

  // Doble cara sin coste arriba y con el dorso sin coste: tiene que quedar solo
  // el de la frontal, sin separadores sueltos.
  const shatterskull = dobleCara("Shatterskull Smashing // Shatterskull, the Hammer Pass", undefined, "Sorcery // Land", [
    { name: "Shatterskull Smashing", mana_cost: "{X}{R}{R}", type_line: "Sorcery" },
    { name: "Shatterskull, the Hammer Pass", mana_cost: "", type_line: "Land" },
  ]);
  comprobar(
    costeDe(shatterskull) === "{X}{R}{R}",
    `el coste de una doble cara con dorso de tierra se pinta «${costeDe(shatterskull)}»`,
  );

  // Doble cara sin coste arriba y con coste en las dos caras.
  const dosCostes = dobleCara("Andar // Correr", undefined, "Instant // Sorcery", [
    { name: "Andar", mana_cost: "{2}{R}", type_line: "Instant" },
    { name: "Correr", mana_cost: "{1}{U}", type_line: "Sorcery" },
  ]);
  comprobar(
    costeDe(dosCostes) === "{2}{R} // {1}{U}",
    `sin coste de nivel superior, los de las caras se unen una vez: «${costeDe(dosCostes)}»`,
  );

  comprobar(costeDe(carta("Sol Ring", "Artifact", "{T}: Add {C}{C}.")) === "{1}", "una carta de una cara cambia de coste");

  // Los símbolos de color: un comandante {1}{R} y una aventura {2}{R} son dos
  // símbolos rojos, no cinco.
  const comandanteRojo = carta("Cmd", "Legendary Creature — Human", "", { mana_cost: "{1}{R}", color_identity: ["R"], cmc: 2 });
  const uno = analizarMazo(mazoDe([[bone, 1]], comandanteRojo));
  comprobar(uno.pips.R === 2, `un comandante {1}{R} y una aventura {2}{R} tienen que dar 2 símbolos rojos y dan ${uno.pips.R}`);
  // Dos líneas del export (dos impresiones, una copia cada una) sí suman: lo que
  // no puede pasar es que una sola carta cuente sus caras de más.
  const otraImpresion = { ...bone, id: "bonecrusher-mid", set: "MID", collector_number: "128" };
  const dos = analizarMazo(mazoDe([[bone, 1], [otraImpresion, 1]], comandanteRojo));
  comprobar(dos.pips.R === 3, `con dos líneas de la aventura son 3 símbolos rojos y dan ${dos.pips.R}`);
  const tierraDorso = analizarMazo(mazoDe([[shatterskull, 1]], comandanteRojo));
  comprobar(
    tierraDorso.pips.R === 3,
    `el comandante {1}{R} y Shatterskull {X}{R}{R} son 3 símbolos rojos y dan ${tierraDorso.pips.R}`,
  );
}

// ── Comandante con tipo compuesto ───────────────────────────────────────────
/*
 * Los dioses de Theros y Hope of Ghirapur son comandantes legales, y su línea de
 * tipo mete un tipo de permanente entre «legendary» y «creature»: «Legendary
 * Enchantment Creature — God» (lo dice Scryfall, que además las da como `legal`
 * en commander). Buscar la cadena «legendary creature» de corrido las rechaza, y
 * con ellas el mazo entero: «Sin bracket» y el consejo diciendo que hay cosas que
 * arreglar antes de jugarlo. Lo que hay que mirar son los tipos por separado
 * —`Legendary` y `Creature`— sobre la cara frontal, como ya hace `esBasica` con
 * las básicas de nieve.
 *
 * Los contrapesos van en el mismo bloque: una legendaria que no es criatura, una
 * criatura que no es legendaria y un planeswalker con «can be your commander»
 * tienen que seguir como están.
 */
titulo("Comandante con tipo compuesto");
{
  const comandanteconTipo = (nombre, tipo, texto = "", extra = {}) => ({
    ...carta(nombre, tipo, texto),
    color_identity: ["R"],
    cmc: 3,
    ...extra,
  });
  const deComandante = (c) => ({
    cantidad: 1,
    carta: c,
    tablero: "commander",
    linea: { cantidad: 1, nombre: c.name, tablero: "commander" },
  });
  const relleno = (n) =>
    Array.from({ length: n }, (_, i) => ({
      cantidad: 1,
      carta: carta(`Relleno ${i}`, "Creature — Goblin", "", { color_identity: ["R"], cmc: 2 }),
      tablero: "main",
      linea: { cantidad: 1, nombre: `Relleno ${i}`, tablero: "main" },
    }));
  const unComandante = (c) => ({
    id: "prueba",
    nombre: "Prueba",
    creado: "2026-01-01T00:00:00.000Z",
    fuente: "export",
    comandantes: [deComandante(c)],
    cartas: relleno(99),
    noEncontradas: [],
  });
  const problemas = (a) => a.legalidad.problemas.join(" · ");

  const dios = analizarMazo(unComandante(comandanteconTipo("Purphoros, God of the Forge", "Legendary Enchantment Creature — God")));
  comprobar(
    dios.legalidad.ok,
    `un comandante «Legendary Enchantment Creature — God» es legal y sale ilegal: ${problemas(dios)}`,
  );
  comprobar(
    dios.bracket.etiqueta === "Bracket 1-2",
    `con un comandante legal el bracket tiene que ser Bracket 1-2 y es «${dios.bracket.etiqueta}»`,
  );

  const artefacto = analizarMazo(unComandante(comandanteconTipo("Hope of Ghirapur", "Legendary Artifact Creature — Thopter")));
  comprobar(
    artefacto.legalidad.ok,
    `un comandante «Legendary Artifact Creature — Thopter» es legal y sale ilegal: ${problemas(artefacto)}`,
  );

  const nieve = analizarMazo(unComandante(comandanteconTipo("Jorn, God of Winter", "Legendary Snow Creature — God")));
  comprobar(nieve.legalidad.ok, `un comandante «Legendary Snow Creature» es legal y sale ilegal: ${problemas(nieve)}`);

  const simple = analizarMazo(unComandante(comandanteconTipo("Ragavan, Nimble Pilferer", "Legendary Creature — Monkey Pirate")));
  comprobar(simple.legalidad.ok, `un comandante «Legendary Creature» a secas es legal y sale ilegal: ${problemas(simple)}`);

  // Doble cara con el dorso de tierra: lo que se mira es la cara frontal.
  const dobleCara = analizarMazo(
    unComandante(comandanteconTipo("Tamiyo, Compleated Sage", "Legendary Creature — Human Wizard // Legendary Planeswalker — Tamiyo")),
  );
  comprobar(dobleCara.legalidad.ok, `un comandante de doble cara con la frontal de criatura es legal y sale ilegal: ${problemas(dobleCara)}`);

  const equipo = analizarMazo(unComandante(comandanteconTipo("Espada Legendaria", "Legendary Artifact — Equipment")));
  comprobar(
    !equipo.legalidad.ok && /no puede ser comandante/.test(problemas(equipo)),
    `una legendaria que no es criatura no puede ser comandante y sale legal: ${problemas(equipo)}`,
  );

  const noLegendaria = analizarMazo(unComandante(comandanteconTipo("Goblin Cualquiera", "Creature — Goblin")));
  comprobar(
    !noLegendaria.legalidad.ok && /no puede ser comandante/.test(problemas(noLegendaria)),
    `una criatura que no es legendaria no puede ser comandante y sale legal: ${problemas(noLegendaria)}`,
  );

  const planeswalker = analizarMazo(
    unComandante(
      comandanteconTipo("Teferi, Temporal Archmage", "Legendary Planeswalker — Teferi", "Teferi, Temporal Archmage can be your commander."),
    ),
  );
  comprobar(
    planeswalker.legalidad.ok,
    `un planeswalker que dice «can be your commander» es comandante legal y sale ilegal: ${problemas(planeswalker)}`,
  );
}

// ── Un solo predicado de comandante ─────────────────────────────────────────
/*
 * El arreglo de T-0314 se quedó a medias: la librería ya reconocía al comandante
 * de tipo compuesto, pero la página conservaba su copia literal del patrón
 * (`/legendary creature/i`). Cuando el export no trae sección «Commander», la
 * página busca candidatos con esa copia: Ephara (`Legendary Enchantment
 * Creature — God`) no casa, `candidatos` sale vacío y el mazo se guarda sin
 * comandante —«No hay comandante: el export tiene que traerlo en la sección
 * Commander» y «Sin bracket»— sin ofrecer el selector. El mismo dato daba dos
 * veredictos según por dónde entrara.
 *
 * La puerta son las dos mitades: que el predicado de la librería acierte con
 * los tipos compuestos (y siga rechazando lo que no es comandante) y que la
 * página lo use en vez de su copia. La segunda se mira en el fuente porque la
 * lógica vive en el `<script>` de una página Astro, que se publica como bundle
 * con hash: no hay costura para llamarla desde aquí, y el patrón copiado es
 * justo lo que hay que ver desaparecer.
 */
titulo("Un solo predicado de comandante");
{
  const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const pagina = fs.readFileSync(path.join(RAIZ, "src/pages/mtgcommander/index.astro"), "utf8");
  comprobar(
    !/legendary creature/i.test(pagina),
    "src/pages/mtgcommander/index.astro conserva su copia de /legendary creature/i: con ella un comandante de tipo compuesto no se ofrece como candidato",
  );
  comprobar(
    /import\s*\{[^}]*\besComandante\b[^}]*\}\s*from\s*["'][^"']*commander\/analisis(?:\.ts)?["']/.test(pagina),
    "la página no importa esComandante de src/lib/commander/analisis.ts: mantiene su propio predicado",
  );
  comprobar(
    /\besComandante\(/.test(pagina),
    "la página no llama a esComandante: la búsqueda de candidatos sigue con el patrón viejo",
  );

  const analisis = await import("../../src/lib/commander/analisis.ts");
  comprobar(
    typeof analisis.esComandante === "function",
    "esComandante no se exporta desde src/lib/commander/analisis.ts: la página no tiene a qué llamar",
  );
  if (typeof analisis.esComandante === "function") {
    const puede = (c) => analisis.esComandante(c);
    const caso = (nombre, tipo, esperado, texto = "") =>
      comprobar(
        puede(carta(nombre, tipo, texto)) === esperado,
        `«${nombre}» (${tipo}) ${esperado ? "tiene" : "no tiene"} que ser comandante y el predicado dice ${puede(
          carta(nombre, tipo, texto),
        )}`,
      );

    caso("Ephara, God of the Polis", "Legendary Enchantment Creature — God", true);
    caso("Hope of Ghirapur", "Legendary Artifact Creature — Thopter", true);
    caso("Jorn, God of Winter", "Legendary Snow Creature — God", true);
    caso("Ragavan, Nimble Pilferer", "Legendary Creature — Monkey Pirate", true);
    caso("Goblin Cualquiera", "Creature — Goblin", false);
    caso("Espada Legendaria", "Legendary Artifact — Equipment", false);
    caso(
      "Teferi, Temporal Archmage",
      "Legendary Planeswalker — Teferi",
      true,
      "Teferi, Temporal Archmage can be your commander.",
    );
    // Doble cara: manda la cara frontal, que es lo que se juega.
    caso(
      "Tamiyo, Compleated Sage",
      "Legendary Creature — Human Wizard // Legendary Planeswalker — Tamiyo",
      true,
    );
    caso("Delver of Secrets", "Creature — Human // Legendary Creature — Insect", false);

    const sinTipo = { name: "Sin tipo", oracle_text: "" };
    comprobar(puede(sinTipo) === false, "una carta sin type_line no puede ser comandante y el predicado no lo rechaza");
  }
}

// ── Resultado ───────────────────────────────────────────────────────────────
console.log("");
if (fallos.length) {
  for (const f of fallos) console.log(`✗ ${f}`);
  console.log(`\n${comprobados - fallos.length}/${comprobados} comprobaciones correctas`);
  process.exit(1);
}
console.log(`✓ Parser, roles, análisis, bracket, resolver, consejo e IA: ${comprobados} comprobaciones correctas.`);
