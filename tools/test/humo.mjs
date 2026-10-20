/**
 * Pruebas de humo contra el sitio compilado.
 *
 * Abre Chrome en modo headless con CDP, navega por las páginas clave, ejecuta
 * las herramientas de la sección «Mesa» y pasa axe-core a las plantillas
 * principales. No sustituye a una revisión manual con lector de pantalla, pero
 * detecta lo que se rompe al tocar plantillas.
 *
 * Uso: node tools/test/humo.mjs [urlBase]
 */
import fs from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:8099/latabernadeeme";
const CDP = "http://localhost:9223";
const axe = fs.readFileSync(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");

const resultados = [];
const fallo = (nombre, detalle) => resultados.push({ ok: false, nombre, detalle });
const bien = (nombre) => resultados.push({ ok: true, nombre });

async function nuevaPestana(url) {
  const r = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pendientes = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pendientes.has(msg.id)) {
      pendientes.get(msg.id)(msg);
      pendientes.delete(msg.id);
    }
  };
  const enviar = (method, params = {}) =>
    new Promise((res) => {
      const n = ++id;
      pendientes.set(n, res);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await enviar("Page.enable");
  await enviar("Runtime.enable");
  return { ws, enviar, id: t.id };
}

async function evaluar(pag, expresion) {
  const r = await pag.enviar("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}

async function ir(pag, url) {
  await pag.enviar("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 700));
}

async function abrir(url) {
  const pag = await nuevaPestana(url);
  await new Promise((r) => setTimeout(r, 800));
  return pag;
}

async function axeEn(pag, etiqueta) {
  await evaluar(pag, axe);
  const res = await evaluar(
    pag,
    `axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice'] }).then(r => r.violations.map(v => ({id:v.id, impact:v.impact, nodes:v.nodes.length})))`,
  );
  if (!res || res.length === 0) bien(`axe ${etiqueta}: sin violaciones`);
  else fallo(`axe ${etiqueta}`, JSON.stringify(res));
}

const portada = await abrir(`${BASE}/`);
try {
  const d = await evaluar(portada, `({h1: document.querySelectorAll('h1').length, ediciones: document.querySelectorAll('.edicion-carta').length, titulo: document.title})`);
  if (d.h1 === 1 && d.ediciones === 2) bien("portada: un h1 y dos ediciones");
  else fallo("portada", JSON.stringify(d));
  await axeEn(portada, "portada");
} catch (e) {
  fallo("portada", String(e));
}

const conjuro = await abrir(`${BASE}/5e/conjuros/bola-de-fuego/`);
try {
  const d = await evaluar(
    conjuro,
    `({h1: document.querySelector('h1')?.textContent, filas: document.querySelectorAll('.lanzamiento > div').length, parrafos: document.querySelectorAll('.prosa p').length, enlacesBase: [...document.querySelectorAll('a[href^="/"]')].every(a => a.getAttribute('href').startsWith('/latabernadeeme'))})`,
  );
  if (d.h1 === "Bola de fuego" && d.filas >= 4 && d.parrafos >= 2 && d.enlacesBase) bien("conjuro: ficha completa y enlaces con prefijo");
  else fallo("conjuro", JSON.stringify(d));
  await axeEn(conjuro, "conjuro");
} catch (e) {
  fallo("conjuro", String(e));
}

const monstruo = await abrir(`${BASE}/5.5/monstruos/guerrero-goblin/`);
try {
  const d = await evaluar(
    monstruo,
    `({h1: document.querySelector('h1')?.textContent, celdas: document.querySelectorAll('.habilidades > div').length, filas: document.querySelectorAll('.perfil__datos div').length})`,
  );
  if (d.celdas === 6 && d.filas >= 6) bien(`monstruo: ${d.h1} con seis características`);
  else fallo("monstruo", JSON.stringify(d));
  await axeEn(monstruo, "monstruo");
} catch (e) {
  fallo("monstruo", String(e));
}

const listado = await abrir(`${BASE}/5e/conjuros/`);
try {
  const antes = await evaluar(listado, `document.querySelectorAll('#cuerpo tr:not([hidden])').length`);
  await evaluar(
    listado,
    `(() => { const c = [...document.querySelectorAll('[data-faceta="nivel"]')].find(x => x.value === '3'); c.checked = true; c.dispatchEvent(new Event('change', {bubbles:true})); })()`,
  );
  await new Promise((r) => setTimeout(r, 300));
  const despues = await evaluar(listado, `document.querySelectorAll('#cuerpo tr:not([hidden])').length`);
  const contador = await evaluar(listado, `document.getElementById('cuenta')?.textContent`);
  if (antes > 300 && despues > 20 && despues < antes) bien(`filtro por nivel 3: ${antes} -> ${despues} (${contador})`);
  else fallo("filtro", JSON.stringify({ antes, despues, contador }));
} catch (e) {
  fallo("filtro", String(e));
}

const mesa = await abrir(`${BASE}/mesa/`);
try {
  const dados = await evaluar(
    mesa,
    `(() => { document.getElementById('dad-expresion').value='2d6+3'; document.getElementById('dad-tirar').click(); return document.getElementById('dad-salida').textContent; })()`,
  );
  if (/^\d+ = \[/.test(dados.trim())) bien(`dados: ${dados.trim().slice(0, 40)}`);
  else fallo("dados", dados);

  await evaluar(mesa, `new Promise((res) => { const t = setInterval(() => { if (document.querySelector('#enc-lista option')) { clearInterval(t); res(1); } }, 100); setTimeout(() => { clearInterval(t); res(0); }, 5000); })`);
  const enc = await evaluar(
    mesa,
    `(() => {
       const i = document.getElementById('enc-buscar');
       const o = [...document.querySelectorAll('#enc-lista option')].find(x => /Goblin/.test(x.value)) || document.querySelector('#enc-lista option');
       i.value = o.value;
       i.dispatchEvent(new Event('change', {bubbles: true}));
       return document.getElementById('enc-salida').textContent;
     })()`,
  );
  if (/PX ajustados/.test(enc) && !/^0 PX/.test(enc.trim())) bien(`encuentros: ${enc.trim().replace(/\s+/g, " ").slice(0, 70)}`);
  else fallo("encuentros", enc);

  const ini = await evaluar(
    mesa,
    `(() => {
       const n=document.getElementById('ini-nombre'), v=document.getElementById('ini-valor');
       n.value='A'; v.value='12'; document.getElementById('ini-anadir').click();
       n.value='B'; v.value='18'; document.getElementById('ini-anadir').click();
       const orden=[...document.querySelectorAll('#ini-lista li')].map(li=>li.textContent.trim());
       return orden;
     })()`,
  );
  if (Array.isArray(ini) && ini[0].startsWith("B")) bien(`iniciativa: ${ini.join(" | ")}`);
  else fallo("iniciativa", JSON.stringify(ini));

  const pnj = await evaluar(mesa, `(() => { document.getElementById('pnj-generar').click(); return document.getElementById('pnj-salida').textContent; })()`);
  if (pnj && pnj.includes(",")) bien(`pnj: ${pnj.slice(0, 40)}`);
  else fallo("pnj", pnj);

  await axeEn(mesa, "mesa");
} catch (e) {
  fallo("mesa", String(e));
}

const buscar = await abrir(`${BASE}/buscar/`);
try {
  const d = await evaluar(buscar, `({ui: typeof window.PagefindUI, cargado: !!document.querySelector('.pagefind-ui')})`);
  if (d.ui === "function") bien("buscador: Pagefind cargado");
  else fallo("buscador", JSON.stringify(d));
} catch (e) {
  fallo("buscador", String(e));
}

// --- Funciones nuevas: estado en URL, tarjetas, vista de jugador, cartas ---

try {
  const url = `${BASE}/5.5/conjuros/?nivel=3&escuela=${encodeURIComponent("Evocación")}`;
  const p = await abrir(url);
  const d = await evaluar(
    p,
    `({visibles: document.querySelectorAll('#cuerpo tr:not([hidden])').length,
      marcadas: document.querySelectorAll('[data-faceta="nivel"]:checked').length,
      cuenta: document.getElementById('cuenta')?.textContent,
      url: location.search})`,
  );
  if (d.marcadas === 1 && d.visibles > 0 && d.visibles < 60)
    bien(`estado en URL: ${d.cuenta} (${d.url})`);
  else fallo("estado en URL", JSON.stringify(d));
  await axeEn(p, "listado filtrado");
} catch (e) {
  fallo("estado en URL", String(e));
}

try {
  const p = await abrir(`${BASE}/5.5/monstruos/mago/`);
  const enlaces = await evaluar(p, `document.querySelectorAll('a[data-tarjeta]').length`);
  await evaluar(
    p,
    `(() => { const a = document.querySelector('a[data-tarjeta]');
      a.dispatchEvent(new Event('pointerover', {bubbles: true})); return true; })()`,
  );
  await new Promise((r) => setTimeout(r, 700));
  const tarjeta = await evaluar(
    p,
    `(() => { const t = document.querySelector('.tarjeta-datos');
      return t && !t.hidden ? {texto: t.textContent.replace(/\\s+/g, ' ').slice(0, 70)} : null; })()`,
  );
  if (enlaces > 0 && tarjeta) bien(`tarjeta emergente: ${tarjeta.texto}`);
  else fallo("tarjeta emergente", JSON.stringify({ enlaces, tarjeta }));
} catch (e) {
  fallo("tarjeta emergente", String(e));
}

try {
  const p = await abrir(`${BASE}/mesa/jugadores/`);
  await evaluar(
    p,
    `localStorage.setItem('taberna:iniciativa', JSON.stringify({turno: 0, lista: [{nombre:'Aria', valor:18},{nombre:'Goblin', valor:12}]}))`,
  );
  await evaluar(p, `location.reload()`);
  await new Promise((r) => setTimeout(r, 900));
  const d = await evaluar(p, `({turno: document.getElementById('turno')?.textContent, filas: document.querySelectorAll('.jugadores__lista li').length})`);
  if (d.filas === 2 && /Aria/.test(d.turno)) bien(`vista de jugador: ${d.turno}`);
  else fallo("vista de jugador", JSON.stringify(d));
  await axeEn(p, "vista de jugador");
} catch (e) {
  fallo("vista de jugador", String(e));
}

try {
  const p = await abrir(`${BASE}/5.5/cartas/mago/`);
  const cartas = await evaluar(p, `document.querySelectorAll('.carta').length`);
  if (cartas > 20) bien(`cartas imprimibles: ${cartas}`);
  else fallo("cartas imprimibles", String(cartas));
} catch (e) {
  fallo("cartas imprimibles", String(e));
}

try {
  const p = await abrir(`${BASE}/cambios/`);
  const d = await evaluar(
    p,
    `({bloques: document.querySelectorAll('details.cambios').length, metas: document.querySelectorAll('.cabecera__meta b').length})`,
  );
  if (d.bloques >= 5 && d.metas === 3) bien(`comparador de ediciones: ${d.bloques} secciones`);
  else fallo("comparador de ediciones", JSON.stringify(d));
  await axeEn(p, "cambios");
} catch (e) {
  fallo("comparador de ediciones", String(e));
}

try {
  const p = await abrir(`${BASE}/5e/cartas/`);
  const filas = await evaluar(p, `document.querySelectorAll('#cuerpo tr, .panel-tabla tbody tr').length`);
  if (filas >= 6) bien(`índice de cartas: ${filas} clases`);
  else fallo("índice de cartas", String(filas));
  const q = await abrir(`${BASE}/5e/cartas/mago/`);
  await axeEn(q, "cartas");
} catch (e) {
  fallo("índice de cartas", String(e));
}

try {
  const p = await abrir(`${BASE}/comparar/conjuros/bola-de-fuego/`);
  const d = await evaluar(
    p,
    `({filas: document.querySelectorAll('.comparar__fila').length,
      porcentaje: document.querySelector('.cabecera__meta b')?.textContent,
      iguales: document.querySelectorAll('.comparar__fila--igual').length})`,
  );
  if (d.filas > 2) bien(`comparador: ${d.filas} bloques, ${d.porcentaje} igual`);
  else fallo("comparador", JSON.stringify(d));
  await axeEn(p, "comparador");
} catch (e) {
  fallo("comparador", String(e));
}

try {
  const p = await abrir(`${BASE}/5e/reglas/indice/`);
  const d = await evaluar(
    p,
    `({temas: document.querySelectorAll('.tema').length, enlaces: document.querySelectorAll('.tema__lista a').length})`,
  );
  if (d.temas >= 5 && d.enlaces >= 40) bien(`índice de reglas: ${d.temas} temas, ${d.enlaces} enlaces`);
  else fallo("índice de reglas", JSON.stringify(d));
  await axeEn(p, "índice de reglas");
} catch (e) {
  fallo("índice de reglas", String(e));
}

try {
  const p = await abrir(`${BASE}/mesa/pantalla/`);
  await evaluar(p, `localStorage.removeItem('taberna:pantalla'); location.reload(); 1`);
  await new Promise((r) => setTimeout(r, 800));
  const antes = await evaluar(p, `document.querySelectorAll('.pantalla__panel:not([hidden])').length`);
  await evaluar(p, `(() => { const c = document.querySelector('#config input[data-panel]'); c.checked = false; c.dispatchEvent(new Event('change', {bubbles:true})); return 1; })()`);
  const despues = await evaluar(p, `document.querySelectorAll('.pantalla__panel:not([hidden])').length`);
  if (antes >= 4 && despues === antes - 1) bien(`pantalla del DM: ${antes} paneles, ocultar funciona`);
  else fallo("pantalla del DM", JSON.stringify({ antes, despues }));
  await axeEn(p, "pantalla del DM");
} catch (e) {
  fallo("pantalla del DM", String(e));
}

try {
  const p = await abrir(`${BASE}/mesa/`);
  await evaluar(p, `new Promise((res) => { const t = setInterval(() => { if (document.querySelector('#enc-lista option')) { clearInterval(t); res(1); } }, 100); setTimeout(() => { clearInterval(t); res(0); }, 6000); })`);
  const d = await evaluar(
    p,
    `(() => {
       const i = document.getElementById('aj-criatura');
       const o = [...document.querySelectorAll('#enc-lista option')].find(x => /Guerrero goblin/.test(x.value)) || document.querySelector('#enc-lista option');
       i.value = o.value;
       document.getElementById('aj-objetivo').value = '5';
       document.getElementById('aj-calcular').click();
       const aj = document.getElementById('aj-salida').textContent.replace(/\s+/g, ' ');
       document.getElementById('vd-estimar').click();
       const vd = document.getElementById('vd-salida').textContent.replace(/\s+/g, ' ');
       return {aj: aj.slice(0, 90), vd: vd.slice(0, 90)};
     })()`,
  );
  if (/VD 5/.test(d.aj) && /VD/.test(d.vd)) bien(`ajustar y estimar VD: ${d.vd.slice(0, 50)}`);
  else fallo("ajustar VD", JSON.stringify(d));
} catch (e) {
  fallo("ajustar VD", String(e));
}

try {
  const p = await abrir(`${BASE}/5.5/conjuros/bola-de-fuego/`);
  const d = await evaluar(
    p,
    `({titulo: document.title,
      marcas: !!document.querySelector('.pie') && /marcas registradas de Wizards/.test(document.querySelector('.pie').textContent),
      noAfiliado: /no está afiliado/.test(document.body.textContent),
      ld: (() => { try { return !!JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@context']; } catch { return false; } })()})`,
  );
  if (/D&D 5\.5e/.test(d.titulo) && d.marcas && d.noAfiliado && d.ld) bien(`marcas y avisos: «${d.titulo.slice(0, 40)}»`);
  else fallo("marcas y avisos", JSON.stringify(d));
} catch (e) {
  fallo("marcas y avisos", String(e));
}

// Enlaces internos roos: se comprueban sobre el HTML compilado, no en el navegador.
const malos = resultados.filter((r) => !r.ok);
console.log("");
for (const r of resultados) console.log(`${r.ok ? "✓" : "✗"} ${r.nombre}${r.detalle ? ` — ${r.detalle}` : ""}`);
console.log(`\n${resultados.length - malos.length}/${resultados.length} comprobaciones correctas`);
process.exit(malos.length ? 1 : 0);
