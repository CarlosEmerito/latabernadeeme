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

// La cabecera de la tabla tiene que cuadrar con sus celdas: la primera columna es
// el nombre y el primer campo de cada tipo (VD, nivel, tipo, categoría) conserva
// la suya. Sin esto, el nombre ocupaba la celda del primer campo y su valor
// desaparecía del listado sin que nadie lo notara.
const LISTADOS = [
  { ruta: "/5e/monstruos/", campo: "VD", valor: /^(\d+\/\d+|\d+)$/ },
  { ruta: "/5e/conjuros/", campo: "Nivel", valor: /^(truco|\d+)$/ },
  { ruta: "/5e/objetos/", campo: "Tipo", valor: /^\S/ },
  { ruta: "/5e/equipo/", campo: "Categoría", valor: /^\S/ },
];
for (const caso of LISTADOS) {
  try {
    const p = await abrir(`${BASE}${caso.ruta}`);
    const d = await evaluar(
      p,
      `(() => {
        const cabeceras = [...document.querySelectorAll('#tabla thead th')].map((th) => th.textContent.trim());
        const primera = document.querySelector('#cuerpo tr');
        const celdas = [...primera.children].map((td) => td.textContent.trim());
        const enlace = primera.querySelector('td:first-child a');
        return { cabeceras, celdas, href: enlace?.getAttribute('href') ?? '' };
      })()`,
    );
    const cabecerasOk = d.cabeceras[0] === "Nombre" && d.cabeceras[1] === caso.campo;
    const celdasOk =
      d.celdas.length === d.cabeceras.length &&
      d.celdas[1] !== d.celdas[0] &&
      caso.valor.test(d.celdas[1]) &&
      d.href.length > 1;
    if (cabecerasOk && celdasOk) bien(`${caso.ruta}: «Nombre» y «${caso.campo}» con su valor (${d.celdas[1]})`);
    else fallo(`columnas ${caso.ruta}`, JSON.stringify(d));
  } catch (e) {
    fallo(`columnas ${caso.ruta}`, String(e));
  }
}

// El orden numérico tiene que leer el valor, no el principio del texto: los VD
// fraccionarios se quedaban en 1 y el clic no reordenaba nada.
try {
  const p = await abrir(`${BASE}/5e/monstruos/`);
  await evaluar(
    p,
    `(() => {
      const th = [...document.querySelectorAll('#tabla thead th')].find((t) => t.dataset.orden === 'vd');
      th.querySelector('button').click();
      return true;
    })()`,
  );
  const vds = await evaluar(
    p,
    `[...document.querySelectorAll('#cuerpo tr')].map((tr) => tr.children[1].textContent.trim())`,
  );
  const valor = (t) => {
    const f = /^(\d+)\/(\d+)$/.exec(t);
    return f ? Number(f[1]) / Number(f[2]) : Number.parseFloat(t);
  };
  const nums = vds.map(valor);
  const ascendente = nums.every((n, i) => i === 0 || nums[i - 1] <= n);
  const pos = ["1/8", "1/4", "1/2", "1"].map((v) => vds.indexOf(v));
  const fraccionesOk = pos.every((i) => i >= 0) && pos[0] < pos[1] && pos[1] < pos[2] && pos[2] < pos[3];

  // El segundo clic tiene que invertir el orden de verdad: el comparador
  // numérico iba al revés y marcaba `aria-sort` ascendente ordenando al revés.
  const ariaSegundo = await evaluar(
    p,
    `(() => {
      const th = [...document.querySelectorAll('#tabla thead th')].find((t) => t.dataset.orden === 'vd');
      th.querySelector('button').click();
      return th.getAttribute('aria-sort');
    })()`,
  );
  const vdsDesc = await evaluar(
    p,
    `[...document.querySelectorAll('#cuerpo tr')].map((tr) => tr.children[1].textContent.trim())`,
  );
  const numsDesc = vdsDesc.map(valor);
  const descendente = numsDesc.every((n, i) => i === 0 || numsDesc[i - 1] >= n);
  const ariaOk = ariaSegundo === "descending";

  if (ascendente && fraccionesOk && descendente && ariaOk)
    bien(`orden por VD: ${vds.slice(0, 6).join(" · ")} (y al revés)`);
  else
    fallo(
      "orden por VD",
      JSON.stringify({ ascendente, fraccionesOk, descendente, ariaOk, pos, muestra: vds.slice(0, 8) }),
    );
} catch (e) {
  fallo("orden por VD", String(e));
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

// El PX del frontmatter viene con separador de millar y, en las criaturas con
// guarida, con un segundo valor («50 000 PX o 62 000 en la guarida»). Quedarse
// con el primer grupo de dígitos publicaba 18 PX para un Androesfinge de 18 000
// y dejaba el constructor de encuentros sumando calderilla. Se compara ficha a
// ficha el número del JSON con el valor base del texto.
try {
  const malas = [];
  const altos = {};
  let total = 0;
  for (const ed of ["5e", "5.5"]) {
    const j = await (await fetch(`${BASE}/datos/${ed}.json`)).json();
    for (const x of j.entradas.filter((x) => x.t === "monstruos")) {
      total++;
      const esperado = Number(String(x.d.xp ?? "").split(/PX/i)[0].replace(/\D/g, "")) || 0;
      if (x.r.xp !== esperado) malas.push(`${ed} ${x.n}: ${x.r.xp} en vez de ${esperado}`);
      if (x.n === "Androesfinge" || x.n === "Dragón de oro anciano") altos[`${ed} ${x.n}`] = x.r.xp;
    }
  }
  const altosOk = altos["5e Androesfinge"] === 18000 && altos["5e Dragón de oro anciano"] === 62000;
  if (total >= 600 && !malas.length && altosOk)
    bien(`PX del JSON: ${total} monstruos con su valor base (Androesfinge 18 000, dragón anciano 62 000)`);
  else fallo("PX del JSON", JSON.stringify({ total, malas: malas.slice(0, 5), altos }));
} catch (e) {
  fallo("PX del JSON", String(e));
}

// Un VD alto tiene que valer lo que dice el manual en las tres herramientas:
// el datalist con su PX, el total del constructor por encima de cualquier
// presupuesto y la línea de PX de «Ajustar una criatura» distinta de cero.
try {
  const p = await abrir(`${BASE}/mesa/`);
  await evaluar(p, `(() => { const s = document.getElementById('enc-ed'); s.value = '5e'; s.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  const etiqueta = await evaluar(
    p,
    `new Promise((res) => { const t = setInterval(() => {
       const o = [...document.querySelectorAll('#enc-lista option')].find((x) => x.value === 'Dragón de oro anciano');
       if (o) { clearInterval(t); res(o.textContent); }
     }, 100); setTimeout(() => { clearInterval(t); res(''); }, 5000); })`,
  );
  const total = await evaluar(
    p,
    `(() => {
       const i = document.getElementById('enc-buscar');
       i.value = 'Dragón de oro anciano';
       i.dispatchEvent(new Event('change', {bubbles: true}));
       return document.getElementById('enc-salida').textContent;
     })()`,
  );
  const ajuste = await evaluar(
    p,
    `(() => {
       document.getElementById('aj-criatura').value = 'Dragón de oro anciano';
       document.getElementById('aj-objetivo').value = '17';
       document.getElementById('aj-calcular').click();
       return document.getElementById('aj-salida').textContent;
     })()`,
  );
  const pxAjuste = Number((/PX (\d[\d.]*)/.exec(ajuste) ?? [])[1]?.replace(/\./g, ""));
  const ok =
    /62\.000 PX/.test(etiqueta) &&
    /62\.000 PX base/.test(total) &&
    /Por encima/.test(total) &&
    pxAjuste === 18000;
  if (ok) bien(`VD alto: datalist «${etiqueta.trim()}», total «${total.trim().replace(/\s+/g, " ").slice(0, 60)}»`);
  else fallo("VD alto", JSON.stringify({ etiqueta, total, ajuste, pxAjuste }));
} catch (e) {
  fallo("VD alto", String(e));
}

// Los campos del constructor de encuentros se teclean a mano y `type=number` no
// impide 0, 11, -3, un decimal ni dejarlos vacíos. Con «Personajes» vacío el
// presupuesto era 0 y el veredicto salía «Por encima (Infinity % del
// presupuesto)»; con «Nivel» 3.5 no existe UMBRALES[3.5], el listener lanzaba un
// TypeError y el panel se quedaba con el presupuesto anterior. Cualquier entrada
// tiene que pintar un porcentaje finito y un valor fuera de rango tiene que valer
// lo mismo que su extremo.
try {
  const p = await abrir(`${BASE}/mesa/`);
  await evaluar(p, `new Promise((res) => { const t = setInterval(() => { if (document.querySelector('#enc-lista option')) { clearInterval(t); res(1); } }, 100); setTimeout(() => { clearInterval(t); res(0); }, 6000); })`);
  const casos = await evaluar(
    p,
    `(() => {
       const buscar = document.getElementById('enc-buscar');
       const o = [...document.querySelectorAll('#enc-lista option')].find((x) => x.value === 'Guerrero goblin') || document.querySelector('#enc-lista option');
       buscar.value = o.value;
       buscar.dispatchEvent(new Event('change', {bubbles: true}));
       const pj = document.getElementById('enc-pj');
       const nivel = document.getElementById('enc-nivel');
       const leer = () => document.getElementById('enc-salida').textContent.split(String.fromCharCode(10)).join(' ').replace(/[ ]{2,}/g, ' ').trim();
       const casos = {};
       const probar = (campo, etiqueta, valor) => {
         campo.value = valor;
         campo.dispatchEvent(new Event('input', {bubbles: true}));
         casos[etiqueta] = leer();
       };
       probar(nivel, 'nivel=3', '3');
       probar(pj, 'pj vacio', '');
       probar(pj, 'pj=0', '0');
       probar(pj, 'pj negativo', '-3');
       probar(pj, 'pj=1', '1');
       probar(pj, 'pj=10', '10');
       probar(pj, 'pj=11', '11');
       probar(pj, 'pj=4', '4');
       probar(nivel, 'nivel=3.5', '3.5');
       probar(nivel, 'nivel=4', '4');
       probar(nivel, 'nivel vacio', '');
       probar(nivel, 'nivel=0', '0');
       probar(nivel, 'nivel=1', '1');
       probar(nivel, 'nivel=20', '20');
       probar(nivel, 'nivel=25', '25');
       return casos;
     })()`,
  );
  const presupuesto = (t) => Number((t.match(/presupuesto [0-9.]+ PX/) ?? [""])[0].replace(/[^0-9]/g, "")) || 0;
  const porcentaje = (t) => {
    const m = /([0-9]+) % del presupuesto/.exec(t);
    return m ? Number(m[1]) : null;
  };
  const malos = [];
  for (const [nombre, texto] of Object.entries(casos)) {
    if (!/PX ajustados/.test(texto) || /Infinity|NaN/.test(texto) || porcentaje(texto) === null)
      malos.push(`${nombre}: «${texto.slice(0, 70)}»`);
  }
  const equivalencias = [
    ["pj=0", "pj=1"],
    ["pj negativo", "pj=1"],
    ["pj=11", "pj=10"],
    ["pj vacio", "pj=4"],
    ["nivel=3.5", "nivel=4"],
    ["nivel vacio", "nivel=3"],
    ["nivel=0", "nivel=1"],
    ["nivel=25", "nivel=20"],
  ];
  for (const [a, b] of equivalencias) {
    if (presupuesto(casos[a]) !== presupuesto(casos[b]) || !presupuesto(casos[a]))
      malos.push(`${a} (${presupuesto(casos[a])}) no vale lo mismo que ${b} (${presupuesto(casos[b])})`);
  }
  if (!malos.length)
    bien(
      `encuentros acotados: vacío y 0 dan ${porcentaje(casos["pj=0"])} % de un presupuesto de ${presupuesto(casos["pj=0"])} PX, negativo otro tanto, 11 tope 10 y el nivel 3.5 pinta lo mismo que el 4 (${presupuesto(casos["nivel=3.5"])} PX)`,
    );
  else fallo("encuentros acotados", JSON.stringify(malos.slice(0, 4)));
} catch (e) {
  fallo("encuentros acotados", String(e));
}

const buscar = await abrir(`${BASE}/buscar/`);
try {
  const d = await evaluar(buscar, `({ui: typeof window.PagefindUI, cargado: !!document.querySelector('.pagefind-ui')})`);
  if (d.ui === "function") bien("buscador: Pagefind cargado");
  else fallo("buscador", JSON.stringify(d));

  // El término de la dirección (?q=) tiene que llegar al campo y a los resultados:
  // los formularios de la cabecera y de la portada envían GET hasta aquí.
  const leerBusqueda = (pag) =>
    evaluar(
      pag,
      `({valor: document.querySelector('.pagefind-ui__search-input')?.value ?? null,
        resultados: document.querySelectorAll('.pagefind-ui__result').length,
        mensaje: document.querySelector('.pagefind-ui__message')?.textContent ?? null})`,
    );
  const esperarResultados = async (pag, maximo = 4000) => {
    const hasta = Date.now() + maximo;
    let d = await leerBusqueda(pag);
    while (Date.now() < hasta && d.resultados === 0) {
      await new Promise((r) => setTimeout(r, 150));
      d = await leerBusqueda(pag);
    }
    return d;
  };

  const conParametro = await abrir(`${BASE}/buscar/?q=goblin`);
  const q = await esperarResultados(conParametro);
  if (q.valor === "goblin" && q.resultados > 0) bien(`buscador: ?q=goblin deja «${q.valor}» con ${q.resultados} resultados`);
  else fallo("buscador ?q=goblin", JSON.stringify(q));

  const limpio = await leerBusqueda(buscar);
  if (limpio.valor === "" && limpio.resultados === 0) bien("buscador: sin parámetro arranca vacío");
  else fallo("buscador sin parámetro", JSON.stringify(limpio));

  // Teclear el mismo término a mano tiene que dar el mismo número de resultados.
  try {
    await evaluar(buscar, `document.querySelector('.pagefind-ui__search-input').focus()`);
    await buscar.enviar("Input.insertText", { text: "goblin" });
    const tecleado = await esperarResultados(buscar);
    if (tecleado.resultados === q.resultados && tecleado.resultados > 0)
      bien(`buscador: teclear goblin da los mismos ${tecleado.resultados} resultados`);
    else fallo("buscador tecleado", JSON.stringify({ tecleado, parametro: q }));
  } catch (e) {
    fallo("buscador tecleado", String(e));
  }

  // Varias palabras y acentos, que es donde se rompe el paso por la dirección.
  for (const termino of ["bola de fuego", "poción"]) {
    const pag = await abrir(`${BASE}/buscar/?q=${encodeURIComponent(termino)}`);
    const d = await esperarResultados(pag);
    if (d.valor === termino && d.resultados > 0) bien(`buscador: ?q=${termino} con ${d.resultados} resultados`);
    else fallo(`buscador ?q=${termino}`, JSON.stringify(d));
  }
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


try {
  const p = await abrir(`${BASE}/5.5/monstruos/lobo/`);
  const d = await evaluar(
    p,
    `(() => { const s = document.querySelector('.sigilo-entrada'); return s ? {alt: s.alt, src: s.getAttribute('src')} : null; })()`,
  );
  if (d && d.alt && /sigilos/.test(d.src)) bien(`sigilo de ficha: ${d.alt}`);
  else fallo("sigilo", JSON.stringify(d));
} catch (e) {
  fallo("sigilo", String(e));
}

// Enlaces internos roos: se comprueban sobre el HTML compilado, no en el navegador.
const malos = resultados.filter((r) => !r.ok);
console.log("");
for (const r of resultados) console.log(`${r.ok ? "✓" : "✗"} ${r.nombre}${r.detalle ? ` — ${r.detalle}` : ""}`);
console.log(`\n${resultados.length - malos.length}/${resultados.length} comprobaciones correctas`);
process.exit(malos.length ? 1 : 0);
