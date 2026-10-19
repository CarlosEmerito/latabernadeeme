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
  const d = await evaluar(portada, `({h1: document.querySelectorAll('h1').length, ediciones: document.querySelectorAll('.edicion-bloque').length, titulo: document.title})`);
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
    `({h1: document.querySelector('h1')?.textContent, filas: document.querySelectorAll('.aside dd').length, parrafos: document.querySelectorAll('.prosa p').length, enlacesBase: [...document.querySelectorAll('a[href^="/"]')].every(a => a.getAttribute('href').startsWith('/latabernadeeme'))})`,
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
    `(() => { const s = document.querySelector('[data-faceta="nivel"]'); s.value='3'; s.dispatchEvent(new Event('change', {bubbles:true})); })()`,
  );
  await new Promise((r) => setTimeout(r, 300));
  const despues = await evaluar(listado, `document.querySelectorAll('#cuerpo tr:not([hidden])').length`);
  const contador = await evaluar(listado, `document.getElementById('contador')?.textContent`);
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

  const enc = await evaluar(
    mesa,
    `(() => { document.getElementById('enc-calcular').click(); return document.getElementById('enc-salida').textContent; })()`,
  );
  if (/PX/.test(enc)) bien(`encuentros: ${enc.trim().slice(0, 60)}`);
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

// Enlaces internos roos: se comprueban sobre el HTML compilado, no en el navegador.
const malos = resultados.filter((r) => !r.ok);
console.log("");
for (const r of resultados) console.log(`${r.ok ? "✓" : "✗"} ${r.nombre}${r.detalle ? ` — ${r.detalle}` : ""}`);
console.log(`\n${resultados.length - malos.length}/${resultados.length} comprobaciones correctas`);
process.exit(malos.length ? 1 : 0);
