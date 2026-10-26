/**
 * Pruebas de humo contra el sitio compilado.
 *
 * Abre Chrome en modo headless con CDP, navega por las páginas clave, ejecuta
 * las herramientas de la sección «Mesa» y pasa axe-core a las plantillas
 * principales. No sustituye a una revisión manual con lector de pantalla, pero
 * detecta lo que se rompe al tocar plantillas.
 *
 * Las pestañas las lleva `tools/test/cdp.mjs`: cada página se abre esperando a
 * `Page.loadEventFired` —no a un reloj— y las que sobran se cierran, porque la
 * espera fija de 800 ms leía el `<head>` vacío en cuanto el perfil acumulaba
 * documentos abiertos.
 *
 * Uso: node tools/test/humo.mjs [urlBase]
 */
import fs from "node:fs";
import { load as parseYaml } from "js-yaml";
import { panelesDe } from "../../src/lib/pantalla.ts";
import { Pestanas, evaluar } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://localhost:8099/latabernadeeme";

/**
 * Cuántas reglas tiene que publicar la pantalla del DM según `data/`.
 *
 * La pantalla compilaba con 28 de las 174 reglas del 5.2.1 y el humo la daba
 * por buena porque solo miraba que hubiera unos cuantos paneles. El número
 * sale del catálogo con el mismo módulo que usa la plantilla, así que una
 * lista que se quede corta ya no pasa.
 */
function pantallaEsperada() {
  const dir = new URL("../../data/ed52/reglas/", import.meta.url);
  const reglas = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const crudo = fs.readFileSync(new URL(f, dir), "utf8");
      const fin = crudo.indexOf("\n---\n", 4);
      const fm = crudo.startsWith("---") && fin > 0 ? crudo.slice(4, fin) : "";
      return { slug: f.replace(/\.md$/, ""), data: (fm && parseYaml(fm)) || {} };
    });
  const paneles = panelesDe(reglas);
  return {
    total: reglas.length,
    publicadas: paneles.reduce((n, p) => n + p.entradas.length, 0),
    paneles: paneles.length,
  };
}
const CDP = "http://localhost:9223";
const axe = fs.readFileSync(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");

/**
 * Las pestañas de la pasada. `abrir()` espera a que la página cargue y las que
 * sobran se cierran solas: la espera fija de 800 ms y las 37 pestañas abiertas
 * hacían que la última comprobación —la tarjeta social— leyera el `<head>`
 * vacío de vez en cuando.
 */
const pestanas = new Pestanas({ cdp: CDP });

const resultados = [];
const fallo = (nombre, detalle) => resultados.push({ ok: false, nombre, detalle });
const bien = (nombre) => resultados.push({ ok: true, nombre });

const abrir = (url) => pestanas.abrir(url);

const ir = (pag, url) => pestanas.ir(pag, url);

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

  // El panel Explorar sumaba las dos ediciones en cada fila y enlazaba solo a
  // 5.5: anunciaba 658 conjuros y el listado que abría decía 339. Cada edición
  // lleva su columna, así que la cifra de la celda tiene que ser la del listado
  // que abre y la suma de todas las celdas, el total del encabezado.
  const panel = await evaluar(
    portada,
    `(() => {
      const fila = [...document.querySelectorAll('.portada__tabla tbody tr')].find(
        (tr) => tr.querySelector('th')?.textContent.trim() === 'Conjuros',
      );
      if (!fila) return null;
      const cabecera = document.querySelector('.portada__panel-cab')?.textContent ?? '';
      return {
        celdas: [...fila.querySelectorAll('td a')].map((a) => ({ n: Number(a.textContent.trim()), href: a.getAttribute('href') })),
        suma: [...document.querySelectorAll('.portada__tabla tbody td a')].reduce((n, a) => n + Number(a.textContent.trim()), 0),
        total: Number(cabecera.match(/[0-9]+/)?.[0]),
      };
    })()`,
  );
  if (!panel || panel.celdas.length !== 2) {
    fallo("portada: panel Explorar", JSON.stringify(panel));
  } else {
    const anunciados = [];
    for (const celda of panel.celdas) {
      const pagina = await abrir(new URL(celda.href, new URL(BASE).origin).href);
      anunciados.push(await evaluar(pagina, `Number(document.querySelector('.cabecera__meta b')?.textContent)`));
    }
    if (panel.celdas.every((c, i) => c.n === anunciados[i]) && panel.suma === panel.total) {
      bien(`portada: el panel Explorar cuadra con sus listados (${anunciados.join(" / ")}, ${panel.suma} en total)`);
    } else {
      fallo("portada: panel Explorar", JSON.stringify({ celdas: panel.celdas, anunciados, suma: panel.suma, total: panel.total }));
    }
  }

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

// El botón «Copiar Markdown» tiene que seguir registrado y tiene que generar
// el Markdown con el PX con su unidad una sola vez. El texto se arma en un
// módulo aparte (`src/lib/markdown.ts`), así que el script de la ficha ahora
// es un bundle: si el import no llegara al navegador, el botón se quedaría
// sin registrar y el aviso saldría vacío. Se comprueba lo que el navegador
// genera, no el código.
for (const [ed, ruta, xpEsperado] of [
  ["5.5", "aboleth", "5900 PX o 7200 en la guarida; BC +4"],
  ["5e", "goblin", "50 PX"],
]) {
  try {
    const p = await abrir(`${BASE}/${ed}/monstruos/${ruta}/`);
    const d = await evaluar(
      p,
      `(() => {
        const boton = document.getElementById("copiar-md");
        if (!boton) return { boton: false };
        let copiado = null;
        const portapapeles = navigator.clipboard ?? {};
        const original = portapapeles.writeText?.bind(portapapeles);
        portapapeles.writeText = async (t) => { copiado = t; if (!original) return; return original(t).catch(() => {}); };
        boton.click();
        const linea = (copiado ?? "").split("\\n").find((l) => l.startsWith("- **VD:**"));
        return { boton: true, linea, aviso: document.getElementById("aviso-copia")?.textContent ?? "" };
      })()`,
    );
    const ok =
      d.boton &&
      d.linea &&
      d.linea.includes(xpEsperado) &&
      !/PX\\s+PX/i.test(d.linea) &&
      !/BC\\s*\\+\\d+\\s*PX/i.test(d.linea);
    if (ok) bien(`markdown ${ed}/${ruta}: «${d.linea}»`);
    else fallo(`markdown ${ed}/${ruta}`, JSON.stringify(d));
  } catch (e) {
    fallo(`markdown ${ed}/${ruta}`, String(e));
  }
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

// El filtro Tamaño ofrece una casilla por tamaño, no una por grafía: el SRD
// trae «Mediano» y «Mediana» según la concordancia de la línea, y partirlas
// dejaba 39 de las 126 criaturas medianas de 5.2.1 fuera de la casilla que se
// marca. Se comprueba con el recuento que anuncia la propia casilla y con las
// filas que quedan a la vista al marcarla.
for (const ed of ["5.5", "5e"]) {
  try {
    const p = await abrir(`${BASE}/${ed}/monstruos/`);
    const d = await evaluar(
      p,
      `(() => {
        const casillas = [...document.querySelectorAll('[data-faceta="tamano"]')];
        const femeninas = casillas.filter((c) => /^(Diminuta|Peque\u00f1a|Mediana|Gargantuesca)$/.test(c.value)).map((c) => c.value);
        const mediano = casillas.find((c) => c.value === "Mediano");
        if (!mediano) return { casillas: casillas.length, femeninas, anunciado: null, visibles: null };
        const anunciado = Number(mediano.closest("label").querySelector(".faceta__n").textContent);
        mediano.checked = true;
        mediano.dispatchEvent(new Event("change", { bubbles: true }));
        return { casillas: casillas.length, femeninas, anunciado, visibles: document.querySelectorAll("#cuerpo tr:not([hidden])").length };
      })()`,
    );
    if (d.casillas >= 1 && d.casillas <= 7 && d.femeninas.length === 0 && d.anunciado === d.visibles && d.visibles > 100)
      bien(`filtro tamaño ${ed}: ${d.casillas} casillas, «Mediano» anuncia ${d.anunciado} y enseña ${d.visibles}`);
    else fallo(`filtro tamaño ${ed}`, JSON.stringify(d));
  } catch (e) {
    fallo(`filtro tamaño ${ed}`, String(e));
  }
}

// El filtro de texto tiene que plegar tildes y mayúsculas: «dragon», «Dragón»
// y «DRAGON» son la misma búsqueda, y antes dejaban la tabla vacía aunque
// hubiera 43 dragones. Se teclea de verdad con `Input.insertText`; un evento
// `input` sintético no pasaría por el mismo camino que el usuario.
try {
  const medir = (pag) =>
    evaluar(
      pag,
      `({visibles: document.querySelectorAll('#cuerpo tr:not([hidden])').length,
        total: document.querySelectorAll('#cuerpo tr').length,
        aviso: !document.getElementById('sin-resultados').hidden,
        cuenta: document.getElementById('cuenta')?.textContent})`,
    );
  const teclear = async (termino) => {
    const pag = await abrir(`${BASE}/5.5/monstruos/`);
    await evaluar(pag, `document.getElementById('f-texto').focus()`);
    await pag.enviar("Input.insertText", { text: termino });
    await new Promise((r) => setTimeout(r, 400));
    return medir(pag);
  };

  const porParametro = await medir(await abrir(`${BASE}/5.5/monstruos/?q=dragon`));
  const sinTilde = await teclear("dragon");
  const conTilde = await teclear("dragón");
  const mayusculas = await teclear("DRAGON");

  const cifras = [porParametro, sinTilde, conTilde, mayusculas].map((d) => d.visibles);
  if (cifras.every((n) => n > 0 && n === cifras[0]) && cifras[0] < porParametro.total && !porParametro.aviso) {
    bien(`filtro de texto: dragon, dragón y DRAGON dan ${cifras[0]} de ${porParametro.total} (${sinTilde.cuenta})`);
  } else {
    fallo("filtro de texto con tildes", JSON.stringify({ porParametro, sinTilde, conTilde, mayusculas }));
  }
} catch (e) {
  fallo("filtro de texto con tildes", String(e));
}

// El filtro del listado tiene que encontrar la entrada por su nombre inglés: la
// ficha publica «En inglés: …» y /buscar/ lo indexa, así que quien conoce el
// conjuro como «thunderwave» no puede encontrarse el listado en cero mientras la
// ficha de al lado sí lo llama así (T-0267). Se comprueba en las dos ediciones y
// que el nombre español siga encontrando la misma fila.
try {
  const filtrarConjuros = async (ed, termino) => {
    const pag = await abrir(`${BASE}/${ed}/conjuros/`);
    await evaluar(pag, `document.getElementById('f-texto').focus()`);
    await pag.enviar("Input.insertText", { text: termino });
    await new Promise((r) => setTimeout(r, 400));
    return evaluar(
      pag,
      `({total: document.querySelectorAll('#cuerpo tr').length,
        nombres: [...document.querySelectorAll('#cuerpo tr:not([hidden]) td.col-nombre a')].map((a) => a.textContent.trim()),
        cuenta: document.getElementById('cuenta')?.textContent})`,
    );
  };

  const ingles = await filtrarConjuros("5.5", "thunderwave");
  const espanol = await filtrarConjuros("5.5", "ola atronadora");
  const otraEdicion = await filtrarConjuros("5e", "true seeing");

  const soloUna = (d, nombre) =>
    d.nombres.length === 1 && d.nombres[0] === nombre && d.total > 100 && d.cuenta?.startsWith("1 ");
  if (soloUna(ingles, "Ola atronadora") && soloUna(espanol, "Ola atronadora") && soloUna(otraEdicion, "Visión veraz")) {
    bien(`filtro por nombre inglés: thunderwave y ola atronadora dan «Ola atronadora» (${ingles.cuenta}), true seeing da «Visión veraz» en 5e`);
  } else {
    fallo("filtro por nombre inglés", JSON.stringify({ ingles, espanol, otraEdicion }));
  }
} catch (e) {
  fallo("filtro por nombre inglés", String(e));
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

// Precio mezcla monedas y Peso mezcla unidades, así que la columna no puede
// ordenar por el número bruto del texto: «5 pp» (medio oro) pesaba más que
// «1 po» y «40 000 po» se leía 40 —la Aeronave caía al puesto 152 de 188—,
// mientras que el Dardo (125 g) se ordenaba como 125 kg y bajaba al 185. Se
// comprueban los dos extremos del orden en las dos ediciones y que el bloque de
// gramos quede entero por delante de los kilos.
// Los precios conocidos de cada edición en orden ascendente: los que mezclan
// monedas, dos con separador de millar y el más caro —Aeronave en 5.2, Galera
// en 5.1—, que tiene que quedar el último (y el primero al revés).
const ORDEN_EQUIPO = [
  {
    ruta: "/5.5/equipo/",
    caros: ["5 pc", "5 pp", "1 po", "1000 po", "3000 po", "10 000 po", "25 000 po", "30 000 po", "40 000 po"],
  },
  {
    ruta: "/5e/equipo/",
    caros: ["5 pc", "5 pp", "1 po", "1000 po", "3000 po", "10 000 po", "25 000 po", "30 000 po"],
  },
];
for (const caso of ORDEN_EQUIPO) {
  try {
    const p = await abrir(`${BASE}${caso.ruta}`);
    const clic = async (clave) =>
      evaluar(
        p,
        `(() => {
          const th = [...document.querySelectorAll('#tabla thead th')].find((t) => t.dataset.orden === '${clave}');
          th.querySelector('button').click();
          return th.getAttribute('aria-sort');
        })()`,
      );
    const columna = async (i) =>
      evaluar(
        p,
        `[...document.querySelectorAll('#cuerpo tr')].map((tr) => tr.children[${i}].textContent.trim())`,
      );
    // Con repetidos («5 pp» sale siete veces) vale la primera aparición, que es
    // la que fija el bloque de esa moneda en el orden.
    const pos = (lista, valor) => lista.indexOf(valor);
    const enOrden = (lista, valores) => {
      const puestos = valores.map((v) => pos(lista, v));
      if (puestos.some((i) => i < 0)) return false;
      return puestos.every((i, k) => k === 0 || puestos[k - 1] < i);
    };

    const caro = caso.caros[caso.caros.length - 1];
    await clic("precio");
    const precios = await columna(2);
    await clic("precio");
    const preciosDesc = await columna(2);
    const ascOk = precios[precios.length - 1] === caro && enOrden(precios, caso.caros);
    const descOk = preciosDesc[0] === caro && enOrden(preciosDesc, [...caso.caros].reverse());

    await clic("peso");
    const pesos = await columna(3);
    await clic("peso");
    const pesosDesc = await columna(3);
    const primerGramo = pesos.findIndex((v) => v.endsWith(" g"));
    const ultimoGramo = pesos.findLastIndex((v) => v.endsWith(" g"));
    const gramosOk =
      primerGramo > 0 &&
      ultimoGramo > primerGramo &&
      ultimoGramo < pesos.length - 1 &&
      pesos.slice(0, primerGramo).every((v) => v === "—") &&
      pesos.slice(primerGramo, ultimoGramo + 1).every((v) => v.endsWith(" g")) &&
      pesos.slice(ultimoGramo + 1).every((v) => v.endsWith("kg")) &&
      pesos.findLastIndex((v) => v === "125 g") < pesos.findIndex((v) => v === "250 g");
    const primerGramoDesc = pesosDesc.findIndex((v) => v.endsWith(" g"));
    const ultimoGramoDesc = pesosDesc.findLastIndex((v) => v.endsWith(" g"));
    const gramosDescOk =
      pesosDesc[0].endsWith("kg") &&
      ultimoGramoDesc > primerGramoDesc &&
      pesosDesc.slice(primerGramoDesc, ultimoGramoDesc + 1).every((v) => v.endsWith(" g")) &&
      pesosDesc.slice(ultimoGramoDesc + 1).every((v) => v === "—") &&
      pesosDesc.findIndex((v) => v === "125 g") > pesosDesc.findLastIndex((v) => v === "250 g");

    if (ascOk && descOk && gramosOk && gramosDescOk)
      bien(`orden por Precio y Peso ${caso.ruta}: ${caro} al final y al principio, gramos antes que kilos`);
    else
      fallo(
        `orden por Precio y Peso ${caso.ruta}`,
        JSON.stringify({
          ascOk,
          descOk,
          gramosOk,
          gramosDescOk,
          precios: precios.slice(0, 5),
          ultimosPrecios: precios.slice(-3),
          preciosDesc: preciosDesc.slice(0, 3),
          pesos: pesos.slice(0, 3),
          pesosGramos: pesos.slice(primerGramo, primerGramo + 4),
          pesosDesc: pesosDesc.slice(0, 3),
        }),
      );
  } catch (e) {
    fallo(`orden por Precio y Peso ${caso.ruta}`, String(e));
  }
}

const mesa = await abrir(`${BASE}/mesa/`);
try {
  const dados = await evaluar(
    mesa,
    `(() => { document.getElementById('dad-expresion').value='2d6+3'; document.getElementById('dad-tirar').click(); return document.getElementById('dad-salida').textContent; })()`,
  );
  if (/^\d+ = \[/.test(dados.trim())) bien(`dados: ${dados.trim().slice(0, 40)}`);
  else fallo("dados", dados);

  // La ventaja tira dos d20 y suma el mayor, pero la salida pintaba la lista de
  // dados con el primero solo y «la otra» con el menor: cuando el segundo dado
  // era el que sumaba, la tirada se anunciaba con el mismo número dos veces y
  // el que había contado no aparecía. Se fuerza el azar para que la tirada sea
  // reproducible: 0,1 y 0,9 son un 3 y un 19.
  const ventaja = await evaluar(
    mesa,
    `(() => {
      const azar = Math.random;
      const cola = [0.1, 0.9];
      Math.random = () => (cola.length ? cola.shift() : azar());
      const expresion = document.getElementById('dad-expresion');
      const casilla = document.getElementById('dad-ventaja');
      expresion.value = '1d20+0';
      casilla.checked = true;
      document.getElementById('dad-tirar').click();
      const salida = document.getElementById('dad-salida').textContent;
      casilla.checked = false;
      Math.random = azar;
      return salida;
    })()`,
  );
  const totalVentaja = Number((/^(\d+)/.exec(ventaja.trim()) ?? [])[1]);
  const dadosVentaja = (ventaja.match(/\d+/g) ?? []).map(Number).slice(1);
  if (totalVentaja !== 19) fallo("dados con ventaja", `el total no es el dado mayor: ${ventaja}`);
  else if (!dadosVentaja.includes(19) || !dadosVentaja.includes(3))
    fallo("dados con ventaja", `no enseña los dos d20 tirados: ${ventaja}`);
  else bien(`dados con ventaja: ${ventaja.trim()}`);

  // Los dos dados iguales: la salida lo dice y no repite el número como si
  // fueran dos dados distintos (antes se leía «19 = [19] (la otra: 19)»).
  const ventajaIguales = await evaluar(
    mesa,
    `(() => {
      const azar = Math.random;
      Math.random = () => 0.9;
      const expresion = document.getElementById('dad-expresion');
      const casilla = document.getElementById('dad-ventaja');
      expresion.value = '1d20+0';
      casilla.checked = true;
      document.getElementById('dad-tirar').click();
      const salida = document.getElementById('dad-salida').textContent;
      casilla.checked = false;
      Math.random = azar;
      return salida;
    })()`,
  );
  const numerosIguales = (ventajaIguales.match(/\d+/g) ?? []).map(Number);
  if (numerosIguales[0] !== 19)
    fallo("dados con ventaja y los dos iguales", `el total no es 19: ${ventajaIguales}`);
  else if (!/iguales/.test(ventajaIguales))
    fallo("dados con ventaja y los dos iguales", `no dice que los dados han salido iguales: ${ventajaIguales}`);
  else if (numerosIguales.some((valor) => valor !== 19))
    fallo("dados con ventaja y los dos iguales", `enseña un número que no ha salido: ${ventajaIguales}`);
  else bien(`dados con ventaja y los dos iguales: ${ventajaIguales.trim()}`);

  // Con ventaja y modificador el total es el mayor más el modificador (3 y 19
  // con +5 son 24) y lo que se pinta cuadra con ese total.
  const ventajaMod = await evaluar(
    mesa,
    `(() => {
      const azar = Math.random;
      const cola = [0.1, 0.9];
      Math.random = () => (cola.length ? cola.shift() : azar());
      const expresion = document.getElementById('dad-expresion');
      const casilla = document.getElementById('dad-ventaja');
      expresion.value = '1d20+5';
      casilla.checked = true;
      document.getElementById('dad-tirar').click();
      const salida = document.getElementById('dad-salida').textContent;
      casilla.checked = false;
      Math.random = azar;
      return salida;
    })()`,
  );
  const totalMod = Number((/^(\d+)/.exec(ventajaMod.trim()) ?? [])[1]);
  const dadosMod = (ventajaMod.match(/\d+/g) ?? []).map(Number).slice(1);
  if (totalMod !== 24)
    fallo("dados con ventaja y modificador", `el total no es el dado mayor más 5: ${ventajaMod}`);
  else if (!dadosMod.includes(19) || !dadosMod.includes(3))
    fallo("dados con ventaja y modificador", `no enseña los dos d20 tirados: ${ventajaMod}`);
  else if (!/[+] 5/.test(ventajaMod))
    fallo("dados con ventaja y modificador", `no enseña el modificador: ${ventajaMod}`);
  else bien(`dados con ventaja y modificador: ${ventajaMod.trim()}`);

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

  // El combate se guardaba en localStorage pero no se restauraba al cargar:
  // recargar /mesa/ dejaba la lista vacía —«Siguiente turno» no hacía nada— y el
  // primer «Añadir» borraba el orden que la vista de jugador seguía pintando. Se
  // comprueba el ciclo entero: añadir dos, pasar turno, recargar y que el orden y
  // el turno activo sigan donde estaban; añadir una tercera sin perder las otras.
  const campos = `const n=document.getElementById('ini-nombre'), v=document.getElementById('ini-valor');`;
  const leerCombate = () =>
    evaluar(
      mesa,
      `(() => {
         const filas = [...document.querySelectorAll('#ini-lista li')];
         return {
           orden: filas.map((li) => [...li.children].map((s) => s.textContent.trim())),
           activa: filas.findIndex((li) => li.classList.contains('activo')),
           guardado: JSON.parse(localStorage.getItem('taberna:iniciativa') || 'null'),
         };
       })()`,
    );

  const ini = await evaluar(
    mesa,
    `(() => {
       ${campos}
       n.value='A'; v.value='12'; document.getElementById('ini-anadir').click();
       n.value='B'; v.value='18'; document.getElementById('ini-anadir').click();
       const orden=[...document.querySelectorAll('#ini-lista li')].map(li=>li.textContent.trim());
       return orden;
     })()`,
  );
  if (Array.isArray(ini) && ini[0].startsWith("B")) bien(`iniciativa: ${ini.join(" | ")}`);
  else fallo("iniciativa", JSON.stringify(ini));

  // Se pasa el turno con un clic y se recarga: el orden y la fila activa tienen
  // que seguir donde estaban. El avance se mide respecto a donde estaba el
  // puntero —añadir B (18) por delante de A (12) ya no lo mueve, así que la
  // partida arranca en A, la segunda fila— y no con un índice fijo, que era la
  // suposición vieja de que añadir devolvía el turno al primer puesto.
  const antesDePasar = await leerCombate();
  await evaluar(mesa, `document.getElementById('ini-siguiente').click()`);
  const antes = await leerCombate();
  await ir(mesa, `${BASE}/mesa/`);
  await evaluar(
    mesa,
    `new Promise((res) => { const t = setInterval(() => { if (document.querySelector('#ini-lista')) { clearInterval(t); res(1); } }, 50); setTimeout(() => { clearInterval(t); res(0); }, 4000); })`,
  );
  const despues = await leerCombate();
  const nombresDe = (x) => (x?.orden ?? []).map((f) => f[0]).join(",");
  const recargaOk =
    antes.activa === (antesDePasar.activa + 1) % antes.orden.length &&
    despues.activa === antes.activa &&
    nombresDe(antes) === "B,A" &&
    nombresDe(despues) === "B,A";
  if (recargaOk) bien(`iniciativa tras recargar: ${nombresDe(despues)} con el turno de ${despues.orden[despues.activa][0]}`);
  else fallo("iniciativa tras recargar", JSON.stringify({ antes, despues }));

  const trasAnadir = await evaluar(
    mesa,
    `(() => {
       ${campos}
       n.value='C'; v.value='15'; document.getElementById('ini-anadir').click();
       return [...document.querySelectorAll('#ini-lista li')].map((li) => [...li.children].map((s) => s.textContent.trim()));
     })()`,
  );
  if (trasAnadir.length === 3 && nombresDe({ orden: trasAnadir }) === "B,C,A")
    bien(`iniciativa tras recargar y añadir: ${nombresDe({ orden: trasAnadir })}`);
  else fallo("iniciativa tras recargar y añadir", JSON.stringify(trasAnadir));

  // La vista de jugador lee la misma clave, así que abierta sin tocar /mesa/ tiene
  // que enseñar el mismo combate (3 filas, turno del primero) y no otro.
  const vista = await abrir(`${BASE}/mesa/jugadores/`);
  const jugador = await evaluar(
    vista,
    `({ turno: document.getElementById('turno')?.textContent, filas: document.querySelectorAll('.jugadores__lista li').length, activa: [...document.querySelectorAll('.jugadores__lista li')].findIndex((li) => li.classList.contains('activo')) })`,
  );
  if (jugador.filas === 3 && jugador.activa === 0 && jugador.turno === "Turno de B")
    bien(`vista de jugador comparte el combate: ${jugador.turno}`);
  else fallo("vista de jugador comparte el combate", JSON.stringify(jugador));

  // Una clave rota no puede llevarse por delante la página entera: la iniciativa
  // vive en el mismo script que el resto de herramientas de la mesa.
  await evaluar(mesa, `localStorage.setItem('taberna:iniciativa', '{roto')`);
  await ir(mesa, `${BASE}/mesa/`);
  const roto = await evaluar(
    mesa,
    `(() => {
       document.getElementById('dad-expresion').value='1d20';
       document.getElementById('dad-tirar').click();
       return { filas: document.querySelectorAll('#ini-lista li').length, dados: document.getElementById('dad-salida').textContent.trim(), aviso: document.getElementById('ini-lista').textContent.trim() };
     })()`,
  );
  if (roto.filas === 0 && roto.aviso === "" && /^[0-9]+ = /.test(roto.dados)) bien("iniciativa con la clave rota: sin combate y la mesa sigue viva");
  else fallo("iniciativa con la clave rota", JSON.stringify(roto));

  // Añadir un combatiente con el combate ya empezado no puede mover el turno: el
  // DM está en una criatura y la que llega a mitad del asalto se coloca en su
  // sitio sin que el puntero salte. Antes el manejador ponía `turno = 0`, así que
  // el refuerzo devolvía el turno al primer puesto de la lista —y el guardado
  // también— justo en mitad de la partida.
  await evaluar(mesa, `localStorage.removeItem('taberna:iniciativa')`);
  await ir(mesa, `${BASE}/mesa/`);
  await evaluar(
    mesa,
    `(() => {
       ${campos}
       n.value='Aria'; v.value='18'; document.getElementById('ini-anadir').click();
       n.value='Brumo'; v.value='12'; document.getElementById('ini-anadir').click();
       document.getElementById('ini-siguiente').click();
       return 1;
     })()`,
  );
  const antesDeAnadir = await leerCombate();
  await evaluar(
    mesa,
    `(() => {
       ${campos}
       n.value='Lobo'; v.value='15'; document.getElementById('ini-anadir').click();
       return 1;
     })()`,
  );
  const trasAnadirMitad = await leerCombate();
  const activoDe = (c) => (c && c.activa >= 0 ? c.orden[c.activa][0] : null);
  const guardadoDe = (c) => (c?.guardado ? (c.guardado.lista?.[c.guardado.turno]?.nombre ?? null) : null);
  const activoAntes = activoDe(antesDeAnadir);
  const activoMitad = activoDe(trasAnadirMitad);
  if (activoAntes === "Brumo" && activoMitad === activoAntes && guardadoDe(trasAnadirMitad) === activoAntes)
    bien(`iniciativa: añadir no mueve el turno (sigue ${activoMitad})`);
  else
    fallo(
      "iniciativa: añadir mueve el turno",
      JSON.stringify({ activoAntes, activoMitad, guardado: guardadoDe(trasAnadirMitad), orden: trasAnadirMitad?.orden }),
    );

  // Y tampoco cuando el que llega entra por delante de todos: el activo sigue
  // siendo el mismo combatiente, aunque ya no esté en el primer puesto.
  await evaluar(
    mesa,
    `(() => {
       ${campos}
       n.value='Z'; v.value='30'; document.getElementById('ini-anadir').click();
       return 1;
     })()`,
  );
  const conRefuerzoPrimero = await leerCombate();
  const activoConRefuerzo = activoDe(conRefuerzoPrimero);
  if (activoConRefuerzo === activoAntes && nombresDe(conRefuerzoPrimero) === "Z,Aria,Lobo,Brumo")
    bien(`iniciativa: un refuerzo con más iniciativa no roba el turno (sigue ${activoConRefuerzo})`);
  else
    fallo(
      "iniciativa: un refuerzo con más iniciativa roba el turno",
      JSON.stringify({ activoAntes, activoConRefuerzo, orden: conRefuerzoPrimero?.orden }),
    );

  // El combate de la partida anterior se queda pegado a la mesa: el panel de
  // Iniciativa no tiene forma de quitar un combatiente ni de vaciar la lista, y
  // como se restaura de localStorage, la única salida es abrir las herramientas
  // del navegador. Se comprueba el recorrido entero: vaciar deja la mesa y el
  // guardado sin combate —y la vista de jugador en «Sin combate»—, y quitar una
  // fila quita esa y no otra, sin descolocar el turno.
  const seccionIniciativa = `[...document.querySelectorAll('section.mesa-panel')].find((s) => /Iniciativa/.test(s.querySelector('h2')?.textContent || ''))`;
  const botonesDeIniciativa = () =>
    evaluar(
      mesa,
      `(() => {
         const sec = ${seccionIniciativa};
         return sec ? [...sec.querySelectorAll('button')].map((b) => ({ id: b.id, nombre: (b.getAttribute('aria-label') || b.textContent || '').trim() })) : null;
       })()`,
    );
  const vaciarCombate = () =>
    evaluar(
      mesa,
      `(() => {
         const sec = ${seccionIniciativa};
         if (!sec) return null;
         const b = [...sec.querySelectorAll('button')].find((x) => /vaciar|limpiar|reiniciar|nuevo combate/i.test((x.getAttribute('aria-label') || '') + ' ' + x.textContent));
         if (!b) return null;
         b.click();
         return b.id || (b.getAttribute('aria-label') || b.textContent).trim();
       })()`,
    );
  const quitarCombatiente = (nombre) =>
    evaluar(
      mesa,
      `(() => {
         const fila = [...document.querySelectorAll('#ini-lista li')].find((li) => li.textContent.trim().startsWith(${JSON.stringify(nombre)}));
         if (!fila) return { error: 'no hay fila para ' + ${JSON.stringify(nombre)} };
         const b = [...fila.querySelectorAll('button')].find((x) => /quitar|eliminar|borrar/i.test((x.getAttribute('aria-label') || '') + ' ' + x.textContent));
         if (!b) return { error: 'la fila no tiene botón de quitar' };
         b.click();
         return { ok: true };
       })()`,
    );

  // Vaciar: se parte de un combate de tres, se vacía y se mira la mesa, lo
  // guardado y la ventana de los jugadores.
  await evaluar(mesa, `localStorage.removeItem('taberna:iniciativa')`);
  await ir(mesa, `${BASE}/mesa/`);
  await evaluar(
    mesa,
    `(() => {
       ${campos}
       n.value='Aria'; v.value='18'; document.getElementById('ini-anadir').click();
       n.value='Brumo'; v.value='12'; document.getElementById('ini-anadir').click();
       n.value='Lobo'; v.value='15'; document.getElementById('ini-anadir').click();
       return 1;
     })()`,
  );
  const antesDeVaciar = await leerCombate();
  const vaciado = await vaciarCombate();
  const trasVaciar = await leerCombate();
  const guardadoVacio = trasVaciar.guardado === null || (trasVaciar.guardado.lista ?? []).length === 0;
  if (vaciado && trasVaciar.orden.length === 0 && guardadoVacio)
    bien(`iniciativa: «${vaciado}» deja la mesa y el guardado sin combate`);
  else
    fallo(
      "iniciativa: no hay forma de vaciar el combate",
      JSON.stringify({ vaciado, antesDeVaciar, trasVaciar, botones: await botonesDeIniciativa() }),
    );

  const vistaVacia = await abrir(`${BASE}/mesa/jugadores/`);
  const jugadorVacio = await evaluar(
    vistaVacia,
    `({ turno: document.getElementById('turno')?.textContent?.trim() ?? '', filas: document.querySelectorAll('.jugadores__lista li').length })`,
  );
  if (jugadorVacio.filas === 0 && jugadorVacio.turno === "Sin combate")
    bien("iniciativa: la vista de jugador dice «Sin combate» tras vaciar");
  else fallo("iniciativa: la vista de jugador sigue con el combate viejo tras vaciar", JSON.stringify(jugadorVacio));

  // Vaciar con la lista ya vacía no puede romper nada, y lo vaciado tiene que
  // seguir vacío al recargar: si la clave se quedara con el combate anterior, el
  // botón serviría de adorno.
  const vaciadoOtraVez = await vaciarCombate();
  const trasVaciarOtraVez = await leerCombate();
  await ir(mesa, `${BASE}/mesa/`);
  await evaluar(
    mesa,
    `new Promise((res) => { const t = setInterval(() => { if (document.querySelector('#ini-lista')) { clearInterval(t); res(1); } }, 50); setTimeout(() => { clearInterval(t); res(0); }, 4000); })`,
  );
  const trasRecargarVacio = await leerCombate();
  if (vaciadoOtraVez && trasVaciarOtraVez.orden.length === 0 && trasRecargarVacio.orden.length === 0)
    bien("iniciativa: vaciar con la lista ya vacía no rompe nada y el combate no vuelve al recargar");
  else
    fallo(
      "iniciativa: vaciar con la lista ya vacía",
      JSON.stringify({ vaciadoOtraVez, trasVaciarOtraVez, trasRecargarVacio }),
    );

  // Quitar una fila: primero una que no tiene el turno, después la que lo tiene.
  // Se parte de una lista limpia por localStorage, no de lo que haya dejado el
  // caso anterior: los dos escenarios se prueban por separado.
  await evaluar(mesa, `localStorage.removeItem('taberna:iniciativa')`);
  await ir(mesa, `${BASE}/mesa/`);
  await evaluar(
    mesa,
    `(() => {
       ${campos}
       n.value='Aria'; v.value='18'; document.getElementById('ini-anadir').click();
       n.value='Brumo'; v.value='12'; document.getElementById('ini-anadir').click();
       n.value='Lobo'; v.value='15'; document.getElementById('ini-anadir').click();
       document.getElementById('ini-siguiente').click();
       document.getElementById('ini-siguiente').click();
       return 1;
     })()`,
  );
  const antesDeQuitar = await leerCombate();
  const quitadoOtro = await quitarCombatiente("Lobo");
  const trasQuitarOtro = await leerCombate();
  const okOtro =
    quitadoOtro?.ok &&
    nombresDe(trasQuitarOtro) === "Aria,Brumo" &&
    activoDe(trasQuitarOtro) === activoDe(antesDeQuitar);
  if (okOtro) bien(`iniciativa: quitar «Lobo» deja el turno en ${activoDe(trasQuitarOtro)}`);
  else
    fallo(
      "iniciativa: quitar un combatiente que no tiene el turno",
      JSON.stringify({ quitadoOtro, antes: antesDeQuitar, despues: trasQuitarOtro }),
    );

  const quitadoActivo = await quitarCombatiente("Brumo");
  const trasQuitarActivo = await leerCombate();
  const activoFinal = activoDe(trasQuitarActivo);
  if (quitadoActivo?.ok && trasQuitarActivo.orden.length === 1 && activoFinal === "Aria")
    bien("iniciativa: quitar el combatiente activo deja el turno en el siguiente sin salirse de la lista");
  else
    fallo(
      "iniciativa: quitar el combatiente activo",
      JSON.stringify({ quitadoActivo, despues: trasQuitarActivo, activoFinal }),
    );

  const pnj = await evaluar(mesa, `(() => { document.getElementById('pnj-generar').click(); return document.getElementById('pnj-salida').textContent; })()`);
  if (pnj && pnj.includes(",")) bien(`pnj: ${pnj.slice(0, 40)}`);
  else fallo("pnj", pnj);

  await axeEn(mesa, "mesa");
} catch (e) {
  fallo("mesa", String(e));
}

// El campo «Añadir criatura» solo escuchaba `change`, que el datalist dispara al
// elegir una sugerencia: escribir el nombre y pulsar Intro dejaba el texto en el
// campo sin añadir nada, que es justo el gesto natural sobre el primer campo de la
// herramienta. Se teclea y se pulsa Intro con el teclado de verdad (CDP
// `Input.insertText` + `Input.dispatchKeyEvent`): un `KeyboardEvent` sintético no
// recorre el mismo camino que el usuario.
try {
  const p = await abrir(`${BASE}/mesa/`);
  await evaluar(p, `new Promise((res) => { const t = setInterval(() => { if (document.querySelector('#enc-lista option')) { clearInterval(t); res(1); } }, 100); setTimeout(() => { clearInterval(t); res(0); }, 6000); })`);
  const leer = () =>
    evaluar(
      p,
      `(() => {
         const campo = document.getElementById('enc-buscar');
         const aviso = document.getElementById('enc-aviso');
         const plano = (s) => s.split(String.fromCharCode(10)).join(' ').replace(/[ ]{2,}/g, ' ').trim();
         return {
           anadidas: document.querySelectorAll('#enc-anadidas li').length,
           campo: campo.value,
           foco: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '',
           salida: plano(document.getElementById('enc-salida').textContent),
           aviso: aviso && !aviso.hidden ? plano(aviso.textContent) : '',
         };
       })()`,
    );
  const teclear = async (texto) => {
    await evaluar(p, `(() => { const c = document.getElementById('enc-buscar'); c.value = ''; c.focus(); return 1; })()`);
    await p.enviar("Input.insertText", { text: texto });
  };
  const intro = async () => {
    for (const tipo of ["keyDown", "keyUp"])
      await p.enviar("Input.dispatchKeyEvent", {
        type: tipo,
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
    await new Promise((r) => setTimeout(r, 300));
  };

  await teclear("Guerrero goblin");
  await intro();
  const exacto = await leer();
  await teclear("Zarabanda de prueba");
  await intro();
  const ausente = await leer();

  const okExacto =
    exacto.anadidas === 1 &&
    exacto.campo === "" &&
    exacto.foco === "enc-buscar" &&
    exacto.aviso === "" &&
    /PX ajustados/.test(exacto.salida);
  const okAusente =
    ausente.anadidas === 1 &&
    ausente.campo === "Zarabanda de prueba" &&
    /Zarabanda de prueba/.test(ausente.aviso);
  if (okExacto && okAusente)
    bien(`Introducir criatura: «Guerrero goblin» añadida con Intro y aviso al escribir un nombre que no existe`);
  else fallo("Introducir criatura", JSON.stringify({ exacto, ausente }));
} catch (e) {
  fallo("Introducir criatura", String(e));
}

// El catálogo de criaturas se pide con `fetch` y el panel daba por hecho que
// siempre contesta: con el JSON caído se quedaba mudo —cero sugerencias y ningún
// aviso— y al escribir un nombre que sí existe contestaba que no hay ninguna
// criatura así, culpando al lector de un fallo de red. Se bloquea la petición de
// verdad con CDP (`Network.setBlockedURLs`, que es lo que se mide), se comprueba
// el aviso y que el reintento recupera el catálogo sin recargar la página.
try {
  const p = await abrir(`${BASE}/mesa/`);
  await p.enviar("Network.enable");
  await p.enviar("Network.setCacheDisabled", { cacheDisabled: true });
  await p.enviar("Network.setBlockedURLs", { urls: ["*datos/5.5.json*"] });
  await pestanas.ir(p, `${BASE}/mesa/`);

  const leer = `(() => {
     const aviso = document.getElementById('enc-aviso');
     const boton = document.getElementById('enc-reintentar');
     const texto = (el) => (el && !el.hidden ? el.textContent.split(String.fromCharCode(10)).join(' ').split(' ').filter(Boolean).join(' ') : '');
     return {
       opciones: document.querySelectorAll('#enc-lista option').length,
       aviso: texto(aviso),
       reintentar: !!boton && !boton.hidden,
       anadidas: document.querySelectorAll('#enc-anadidas li').length,
     };
   })()`;
  const esperarAviso = `new Promise((res) => {
     const t = setInterval(() => {
       const a = document.getElementById('enc-aviso');
       if (a && !a.hidden) { clearInterval(t); res(1); }
     }, 100);
     setTimeout(() => { clearInterval(t); res(0); }, 6000);
  })`;
  const esperarCatalogo = `new Promise((res) => {
     const t = setInterval(() => {
       if (document.querySelectorAll('#enc-lista option').length > 300) { clearInterval(t); res(1); }
     }, 100);
     setTimeout(() => { clearInterval(t); res(0); }, 8000);
  })`;
  const teclear = async (texto) => {
    await evaluar(p, `(() => { const c = document.getElementById('enc-buscar'); c.value = ''; c.focus(); return 1; })()`);
    await p.enviar("Input.insertText", { text: texto });
    for (const tipo of ["keyDown", "keyUp"])
      await p.enviar("Input.dispatchKeyEvent", {
        type: tipo,
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
    await new Promise((r) => setTimeout(r, 300));
  };

  await evaluar(p, esperarAviso);
  const caido = await evaluar(p, leer);

  await teclear("Goblin");
  const sinCatalogo = await evaluar(p, leer);

  await p.enviar("Network.setBlockedURLs", { urls: [] });
  await evaluar(p, `(() => { const b = document.getElementById('enc-reintentar'); if (b) b.click(); return 1; })()`);
  await evaluar(p, esperarCatalogo);
  const recuperado = await evaluar(p, leer);

  await teclear("Guerrero goblin");
  const anadida = await evaluar(p, leer);

  const okCaido = caido.opciones === 0 && caido.aviso.includes("catálogo del 5.2.1") && caido.reintentar;
  const okNombre =
    sinCatalogo.anadidas === 0 &&
    sinCatalogo.aviso.includes("catálogo") &&
    !sinCatalogo.aviso.toLowerCase().includes("ninguna criatura que se llame");
  const okRecuperado = recuperado.opciones > 300 && recuperado.aviso === "" && !recuperado.reintentar;
  const okAnadida = anadida.anadidas === 1 && anadida.aviso === "";
  if (okCaido && okNombre && okRecuperado && okAnadida)
    bien(
      `Catálogo caído: el panel lo dice («${caido.aviso.slice(0, 70)}…»), no culpa al nombre escrito y el reintento recupera las ${recuperado.opciones} criaturas`,
    );
  else fallo("Catálogo caído", JSON.stringify({ caido, sinCatalogo, recuperado, anadida }));
} catch (e) {
  fallo("Catálogo caído", String(e));
}

// El catálogo caído se arregló para el panel de Encuentros y se dejó sin tocar en
// los otros dos que lo usan: «Ajustar una criatura» contestaba «No hay ninguna
// criatura que se llame «Lobo» en este catálogo» —culpando al lector de que el
// JSON no haya llegado— y «Estimar VD» no hacía nada, ni resultado ni aviso, ni
// un error en la consola. Se bloquea la petición con CDP antes de navegar y se
// mira lo que ve el lector en cada panel.
try {
  const p = await abrir("about:blank");
  await p.enviar("Network.enable");
  await p.enviar("Network.setCacheDisabled", { cacheDisabled: true });
  await p.enviar("Network.setBlockedURLs", { urls: ["*datos/5.5.json*"] });
  await pestanas.ir(p, `${BASE}/mesa/`);

  await evaluar(p, `new Promise((res) => {
     const t = setInterval(() => {
       const a = document.getElementById('enc-aviso');
       if (a && !a.hidden) { clearInterval(t); res(1); }
     }, 100);
     setTimeout(() => { clearInterval(t); res(0); }, 6000);
  })`);

  const lee = (id) =>
    `(() => { const e = document.getElementById('${id}'); return e ? e.textContent.split(String.fromCharCode(10)).join(' ').split(' ').filter(Boolean).join(' ') : ''; })()`;

  const encAviso = await evaluar(p, lee("enc-aviso"));
  const d = await evaluar(
    p,
    `(() => {
       const ajustar = document.getElementById('aj-criatura');
       ajustar.value = 'Lobo';
       document.getElementById('aj-objetivo').value = '5';
       document.getElementById('aj-calcular').click();
       const aj = document.getElementById('aj-salida').textContent.split(String.fromCharCode(10)).join(' ').split(' ').filter(Boolean).join(' ');
       document.getElementById('vd-salida').innerHTML = '';
       const pg = document.getElementById('vd-pg');
       const ca = document.getElementById('vd-ca');
       pg.value = '45';
       ca.value = '15';
       document.getElementById('vd-estimar').click();
       const vd = document.getElementById('vd-salida').textContent.split(String.fromCharCode(10)).join(' ').split(' ').filter(Boolean).join(' ');
       return { aj, vd };
     })()`,
  );

  const nombraCatalogo = (texto) =>
    texto.toLowerCase().includes("catálogo") && texto.includes("5.2.1");
  const culpaAlLector = (texto) => texto.toLowerCase().includes("ninguna criatura que se llame");
  const ok =
    encAviso.includes("catálogo del 5.2.1") &&
    nombraCatalogo(d.aj) &&
    !culpaAlLector(d.aj) &&
    nombraCatalogo(d.vd);
  if (ok) bien(`Catálogo caído en Ajustar y Estimar: «${d.aj.slice(0, 60)}…»`);
  else fallo("Catálogo caído en Ajustar y Estimar", JSON.stringify({ encAviso, ...d }));
} catch (e) {
  fallo("Catálogo caído en Ajustar y Estimar", String(e));
}

// La pantalla del DM compilaba y el humo la abría por URL, pero no había ni un
// enlace a ella en todo el sitio: un DM que no supiera la dirección no llegaba.
// Se comprueba el recorrido de verdad, con un clic del ratón sobre la tarjeta de
// /mesa/ (Input.dispatchMouseEvent, no navegar a mano), y que la barra de la
// sección enlaza las tres herramientas y marca la que se está viendo.
try {
  const p = await abrir(`${BASE}/mesa/`);
  const enlace = await evaluar(
    p,
    `(() => {
       const a = document.querySelector('.mesa-grid a[href$="/mesa/pantalla/"]');
       if (!a) return null;
       a.scrollIntoView({ block: 'center' });
       const r = a.getBoundingClientRect();
       return {
         x: Math.round(r.left + r.width / 2),
         y: Math.round(r.top + r.height / 2),
         ancho: Math.round(r.width),
         alto: Math.round(r.height),
         texto: a.textContent.split(String.fromCharCode(10)).join(' ').replace(/[ ]{2,}/g, ' ').trim(),
       };
     })()`,
  );
  if (!enlace || enlace.ancho < 1 || enlace.alto < 1 || !enlace.texto.toLowerCase().includes("pantalla"))
    fallo("enlace a la pantalla del DM", JSON.stringify(enlace));
  else {
    for (const tipo of ["mousePressed", "mouseReleased"])
      await p.enviar("Input.dispatchMouseEvent", {
        type: tipo,
        x: enlace.x,
        y: enlace.y,
        button: "left",
        buttons: tipo === "mousePressed" ? 1 : 0,
        clickCount: 1,
      });
    await new Promise((r) => setTimeout(r, 1000));
    const d = await evaluar(
      p,
      `(() => {
         const h1 = document.querySelector('h1');
         const nav = document.querySelector('.mesa-nav');
         const actual = nav ? nav.querySelector('a[aria-current="page"]') : null;
         return {
           ruta: location.pathname,
           h1: h1 ? h1.textContent : '',
           nav: nav ? nav.querySelectorAll('a').length : 0,
           actual: actual ? actual.textContent.trim() : '',
         };
       })()`,
    );
    if (d.ruta.endsWith("/mesa/pantalla/") && d.h1 === "Pantalla del DM" && d.nav === 3 && d.actual === "Pantalla del DM")
      bien(`pantalla del DM: «${enlace.texto}» (${enlace.ancho}×${enlace.alto} px) lleva a ${d.ruta}`);
    else fallo("enlace a la pantalla del DM", JSON.stringify({ enlace, destino: d }));
  }
} catch (e) {
  fallo("enlace a la pantalla del DM", String(e));
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

// «Ajustar una criatura» comparaba el nombre con `toLowerCase()`, que pasa a
// minúsculas pero no quita tildes: «aguila» no encontraba «Águila» y el panel
// contestaba que el VD no existía, culpando al campo que estaba bien. Se prueba
// en el navegador lo que ve el lector: el nombre sin tilde ajusta igual que con
// ella, y los dos fallos —criatura que no está en el catálogo y VD sin ninguna
// criatura— dan mensajes distintos, porque se arreglan de maneras distintas.
try {
  const p = await abrir(`${BASE}/mesa/`);
  await evaluar(p, `new Promise((res) => { const t = setInterval(() => { if (document.querySelector('#enc-lista option')) { clearInterval(t); res(1); } }, 100); setTimeout(() => { clearInterval(t); res(0); }, 6000); })`);
  const casos = await evaluar(
    p,
    `(() => {
       const leer = () => document.getElementById('aj-salida').textContent.split(String.fromCharCode(10)).join(' ').replace(/[ ]{2,}/g, ' ').trim();
       const probar = (nombre, vd) => {
         document.getElementById('aj-criatura').value = nombre;
         document.getElementById('aj-objetivo').value = vd;
         document.getElementById('aj-calcular').click();
         return leer();
       };
       return {
         sinTilde: probar('aguila', '5'),
         conTilde: probar('Águila', '5'),
         mayusculas: probar('AGUILA', '5'),
         sinCriatura: probar('criatura inventada', '5'),
         sinVd: probar('Águila', '18'),
       };
    })()`,
  );
  const ajusta = (texto) => /antes 0/.test(texto) && /PG [0-9]+ /.test(texto);
  const ok =
    ajusta(casos.sinTilde) &&
    ajusta(casos.conTilde) &&
    ajusta(casos.mayusculas) &&
    /No hay ninguna criatura que se llame .criatura inventada./.test(casos.sinCriatura) &&
    /no tiene ninguna criatura con VD 18/.test(casos.sinVd) &&
    casos.sinCriatura !== casos.sinVd;
  if (ok) bien(`ajustar con y sin tilde: «aguila» -> ${casos.sinTilde.slice(0, 40)}`);
  else fallo("ajustar tildes", JSON.stringify(casos));
} catch (e) {
  fallo("ajustar tildes", String(e));
}

// «Ajustar una criatura» no admite los VD fraccionarios que publica el catálogo
// y su «VD actual» no lo escribe nadie. 78 de las 330 criaturas del 5.2.1 están
// en VD 1/8, 1/4 o 1/2 —Bandido, Lobo, Oso negro: las de una partida de nivel
// bajo—, y el campo era `type=number step=1`, así que «1/2» lo dejaba vacío y
// «0.5» no casaba con la clave «1/2» del perfil: el panel contestaba que el
// catálogo no tenía ninguna criatura con ese VD, culpando al catálogo de un
// fallo del campo. Y el `<output id="aj-vd">` de «VD actual», que existe para
// enseñar el VD del original, se quedaba en «—» para siempre porque ningún
// script lo escribía.
try {
  const p = await abrir(`${BASE}/mesa/`);
  await evaluar(p, `new Promise((res) => { const t = setInterval(() => { if (document.querySelector('#enc-lista option')) { clearInterval(t); res(1); } }, 100); setTimeout(() => { clearInterval(t); res(0); }, 6000); })`);
  const casos = await evaluar(
    p,
    `(() => {
       const leer = () => document.getElementById('aj-salida').textContent.split(String.fromCharCode(10)).join(' ').replace(/[ ]{2,}/g, ' ').trim();
       const disparar = (campo, valor) => {
         campo.value = valor;
         campo.dispatchEvent(new Event('input', {bubbles: true}));
         campo.dispatchEvent(new Event('change', {bubbles: true}));
       };
       const probar = (nombre, vd) => {
         disparar(document.getElementById('aj-criatura'), nombre);
         const objetivo = document.getElementById('aj-objetivo');
         disparar(objetivo, vd);
         const escrito = objetivo.value;
         document.getElementById('aj-calcular').click();
         const actual = document.getElementById('aj-vd').textContent.trim();
         return { escrito, actual, salida: leer() };
       };
       return {
         fraccion: probar('Lobo', '1/2'),
         decimal: probar('Lobo', '0.5'),
         octavo: probar('Bandido', '1/4'),
         sinVd: probar('Lobo', '18'),
       };
     })()`,
  );
  // Lo que ve el lector cuando el ajuste sale: el VD de destino, el de origen y
  // unas cifras nuevas. El aviso de «no hay media» es justo el fallo.
  const escala = (c, desde, hasta) =>
    new RegExp('VD ' + hasta + ' antes ' + desde).test(c.salida) &&
    /PG [0-9]+ → [0-9]+/.test(c.salida) &&
    !/no tiene ninguna criatura con VD/.test(c.salida);
  const ok =
    casos.fraccion.escrito === '1/2' &&
    casos.decimal.escrito === '0.5' &&
    escala(casos.fraccion, '1/4', '1/2') &&
    escala(casos.decimal, '1/4', '1/2') &&
    escala(casos.octavo, '1/8', '1/4') &&
    casos.fraccion.actual === '1/4' &&
    casos.octavo.actual === '1/8' &&
    /no tiene ninguna criatura con VD 18/.test(casos.sinVd.salida);
  if (ok) bien(`ajustar a un VD fraccionario: «${casos.fraccion.salida.slice(0, 64)}»`);
  else fallo("ajustar VD fraccionario", JSON.stringify(casos));
} catch (e) {
  fallo("ajustar VD fraccionario", String(e));
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

// El presupuesto del constructor depende del catálogo, y cada edición mide
// distinto: el 5.2.1 usa la tabla «Presupuesto de PX por personaje» del SRD
// (baja, moderada y alta, sin ajuste por número de criaturas) y el 5.1 la del
// DMG de 2014 (fácil, media, difícil y mortal, con el ajuste). El panel
// aplicaba siempre la de 2014, así que cuatro guerreros goblin (200 PX) salían
// «Por encima (133 % del presupuesto)» con el catálogo de 2024, que los deja en
// un tercio de 600 PX.
try {
  const p = await abrir(`${BASE}/mesa/`);

  /** Espera a que el catálogo pedido esté en la lista de criaturas. */
  const esperarCatalogo = (nombre) =>
    evaluar(
      p,
      `new Promise((res) => { const t = setInterval(() => {
         const o = [...document.querySelectorAll('#enc-lista option')].find((x) => x.value === ${JSON.stringify(nombre)});
         if (o) { clearInterval(t); res(1); }
       }, 100); setTimeout(() => { clearInterval(t); res(0); }, 8000); })`,
    );

  /** El estado del panel: lo que dice la salida, las dificultades y la regla. */
  const ESTADO = `(() => {
     const salida = document.getElementById('enc-salida');
     const dif = document.getElementById('enc-dif');
     const regla = document.getElementById('enc-regla');
     return {
       salida: salida.textContent.split(String.fromCharCode(10)).join(' ').replace(/[ ]{2,}/g, ' ').trim(),
       opciones: [...dif.options].map((o) => o.value),
       etiquetas: [...dif.options].map((o) => o.textContent),
       valor: dif.value,
       regla: regla ? regla.textContent : '',
     };
   })()`;

  /** Ajusta los campos del constructor y añade `veces` criaturas. */
  const montar = (dificultad, criatura, veces) =>
    evaluar(
      p,
      `(() => {
         const pj = document.getElementById('enc-pj');
         const nivel = document.getElementById('enc-nivel');
         const dif = document.getElementById('enc-dif');
         pj.value = '4'; pj.dispatchEvent(new Event('input', {bubbles: true}));
         nivel.value = '3'; nivel.dispatchEvent(new Event('input', {bubbles: true}));
         dif.value = ${JSON.stringify(dificultad)}; dif.dispatchEvent(new Event('input', {bubbles: true}));
         const buscar = document.getElementById('enc-buscar');
         for (let i = 0; i < ${veces}; i++) {
           buscar.value = ${JSON.stringify(criatura)};
           buscar.dispatchEvent(new Event('change', {bubbles: true}));
         }
         return ${ESTADO};
       })()`,
    );

  const cambiarCatalogo = (ed) =>
    evaluar(
      p,
      `(() => { const s = document.getElementById('enc-ed'); s.value = ${JSON.stringify(ed)}; s.dispatchEvent(new Event('change', {bubbles: true})); return 1; })()`,
    );

  await esperarCatalogo("Guerrero goblin");

  // 5.2.1: 4 PJ de nivel 3 en dificultad baja = 150 × 4 = 600 PX, y cuatro
  // guerreros goblin (50 PX cada uno) son 200 PX sin ajuste: un tercio.
  const ed52 = await montar("baja", "Guerrero goblin", 4);
  const presupuestoDe = (t) => Number((/presupuesto ([0-9.]+) PX/.exec(t) ?? ["", "0"])[1].replace(/[^0-9]/g, "")) || 0;

  const fallos52 = [];
  if (JSON.stringify(ed52.opciones) !== JSON.stringify(["baja", "moderada", "alta"]))
    fallos52.push(`las dificultades del 5.2.1 son ${JSON.stringify(ed52.opciones)} y deberían ser baja, moderada y alta`);
  if (JSON.stringify(ed52.etiquetas) !== JSON.stringify(["Baja", "Moderada", "Alta"]))
    fallos52.push(`las etiquetas del 5.2.1 son ${JSON.stringify(ed52.etiquetas)}`);
  if (ed52.valor !== "baja") fallos52.push(`la dificultad elegida es «${ed52.valor}» y debería ser «baja»`);
  if (!/5\.2\.1 \(2024\)/.test(ed52.regla)) fallos52.push(`la regla no dice qué tabla se usa: «${ed52.regla}»`);
  if (!/200 PX ajustados/.test(ed52.salida)) fallos52.push(`el total no es el de 200 PX: «${ed52.salida.slice(0, 80)}»`);
  if (presupuestoDe(ed52.salida) !== 600) fallos52.push(`el presupuesto es ${presupuestoDe(ed52.salida)} PX y deberían ser 600`);
  if (!/Holgado/.test(ed52.salida)) fallos52.push(`el veredicto no es «Holgado»: «${ed52.salida.slice(0, 90)}»`);
  if (!/33 % del presupuesto/.test(ed52.salida)) fallos52.push(`el porcentaje no es el 33 %: «${ed52.salida.slice(0, 90)}»`);
  if (/×/.test(ed52.salida)) fallos52.push(`el 5.2.1 no lleva ajuste por número de criaturas: «${ed52.salida.slice(0, 90)}»`);

  // 5.1: 4 PJ de nivel 3 en dificultad fácil = 75 × 4 = 300 PX, y los mismos
  // cuatro goblin (200 PX) se ajustan por el multiplicador: 400 PX, por encima.
  await cambiarCatalogo("5e");
  await esperarCatalogo("Goblin");
  const ed51 = await montar("facil", "Goblin", 4);

  const fallos51 = [];
  if (JSON.stringify(ed51.opciones) !== JSON.stringify(["facil", "media", "dificil", "mortal"]))
    fallos51.push(`las dificultades del 5.1 son ${JSON.stringify(ed51.opciones)}`);
  if (!/DMG de 2014/.test(ed51.regla)) fallos51.push(`la regla no dice qué tabla se usa: «${ed51.regla}»`);
  if (!/400 PX ajustados/.test(ed51.salida)) fallos51.push(`el total no es el de 400 PX: «${ed51.salida.slice(0, 80)}»`);
  if (presupuestoDe(ed51.salida) !== 300) fallos51.push(`el presupuesto es ${presupuestoDe(ed51.salida)} PX y deberían ser 300`);
  if (!/Por encima/.test(ed51.salida)) fallos51.push(`el veredicto no es «Por encima»: «${ed51.salida.slice(0, 90)}»`);
  if (!/× 2 por 4 criaturas/.test(ed51.salida)) fallos51.push(`falta el ajuste por número de criaturas: «${ed51.salida.slice(0, 90)}»`);

  // La dificultad de la otra edición no puede quedarse marcada: al volver al
  // 5.2.1, «fácil» no existe ahí y el panel tiene que volver a la suya.
  await cambiarCatalogo("5.5");
  await esperarCatalogo("Guerrero goblin");
  const vuelta = await evaluar(p, `(() => {
     const dif = document.getElementById('enc-dif');
     return { valor: dif.value, opciones: [...dif.options].map((o) => o.value) };
   })()`);
  const fallosVuelta = [];
  if (vuelta.valor !== "moderada") fallosVuelta.push(`al volver al 5.2.1 la dificultad es «${vuelta.valor}» y debería ser «moderada»`);
  if (JSON.stringify(vuelta.opciones) !== JSON.stringify(["baja", "moderada", "alta"]))
    fallosVuelta.push(`al volver al 5.2.1 las dificultades son ${JSON.stringify(vuelta.opciones)}`);

  const malos = [...fallos52, ...fallos51, ...fallosVuelta];
  if (!malos.length)
    bien(
      `presupuesto por catálogo: 5.2.1 da 600 PX y 200 ajustados (33 %, holgado, sin ajuste), 5.1 da 300 PX y 400 ajustados (133 %, por encima, × 2)`,
    );
  else fallo("presupuesto por catálogo", JSON.stringify(malos.slice(0, 5)));
} catch (e) {
  fallo("presupuesto por catálogo", String(e));
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

  // El campo del buscador no es del sitio: lo pinta PagefindUI, y salió sin
  // etiqueta (solo con `title`, que repite el placeholder). Un lector de
  // pantalla anunciaba «Bola de fuego, goblin, cota de malla…» como nombre del
  // campo, y /accesibilidad/ promete una etiqueta por campo. La página no estaba
  // en ninguna puerta de axe: por eso la violación llevaba ahí sin verse.
  await axeEn(conParametro, "buscador");

  const limpio = await leerBusqueda(buscar);
  if (limpio.valor === "" && limpio.resultados === 0) bien("buscador: sin parámetro arranca vacío");
  else fallo("buscador sin parámetro", JSON.stringify(limpio));

  // La misma página sin término también, que es la que se ve al llegar desde el menú.
  await axeEn(buscar, "buscador sin término");

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
  await ir(p, `${BASE}/mesa/jugadores/`);
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
  const esperado = pantallaEsperada();
  const p = await abrir(`${BASE}/mesa/pantalla/`);
  await evaluar(p, `localStorage.removeItem('taberna:pantalla'); 1`);
  // Se vuelve a navegar en vez de recargar y contar 800 ms: `ir` espera la carga.
  await ir(p, `${BASE}/mesa/pantalla/`);
  const antes = await evaluar(p, `document.querySelectorAll('.pantalla__panel:not([hidden])').length`);
  const publicado = await evaluar(
    p,
    `(() => { const c = document.querySelector('.pantalla'); return { paneles: document.querySelectorAll('.pantalla__panel').length, reglas: document.querySelectorAll('.pantalla__lista > div').length, enlaces: document.querySelectorAll('.pantalla__lista > div dt a').length, declaradas: Number(c.dataset.publicadas), total: Number(c.dataset.total) }; })()`,
  );
  if (
    publicado.paneles === esperado.paneles &&
    publicado.reglas === esperado.publicadas &&
    publicado.enlaces === esperado.publicadas &&
    publicado.declaradas === esperado.publicadas &&
    publicado.total === esperado.total
  )
    bien(
      `pantalla del DM: ${publicado.reglas} de las ${publicado.total} reglas del 5.2.1 en ${publicado.paneles} paneles`,
    );
  else fallo("pantalla del DM: reglas publicadas", JSON.stringify({ ...publicado, esperado }));
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
       const aj = document.getElementById('aj-salida').textContent.replace(/\\s+/g, ' ');
       const pg = document.getElementById('vd-pg');
       const ca = document.getElementById('vd-ca');
       const boton = document.getElementById('vd-estimar');
       const salida = document.getElementById('vd-salida');
       const estimar = (vpg, vca) => {
         pg.value = vpg;
         ca.value = vca;
         salida.innerHTML = '';
         boton.click();
         return salida.textContent.replace(/\\s+/g, ' ').trim();
       };
       return {
         aj: aj.slice(0, 90),
         conDatos: estimar('45', '15'),
         sinPg: estimar('', '15'),
         sinCa: estimar('45', ''),
       };
     })()`,
  );
  if (
    /VD 5/.test(d.aj) &&
    /VD \d+ probable/.test(d.conDatos) &&
    /PG mayor que 0/.test(d.sinPg) &&
    !/probable/.test(d.sinPg) &&
    /Sin CA/.test(d.sinCa)
  )
    bien(`ajustar y estimar VD: ${d.conDatos.slice(0, 50)}`);
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

// La vista previa al compartir: canónica, og:url y tarjeta. El SVG del sigilo no
// lo pintan las redes sociales, así que la tarjeta es un PNG rasterizado; se
// pide al servidor para comprobar que existe y que es una imagen, no solo que la
// etiqueta esté escrita.
try {
  const malos = [];
  const raiz = BASE.endsWith("/") ? BASE.slice(0, -1) : BASE;
  for (const caso of [
    { ruta: "/5.5/conjuros/bola-de-fuego/", tipo: "article" },
    { ruta: "/5e/conjuros/", tipo: "website" },
  ]) {
    const p = await abrir(`${raiz}${caso.ruta}`);
    const d = await evaluar(
      p,
      `(() => {
         const contenido = (sel) => document.querySelector(sel)?.getAttribute('content') ?? '';
         return {
           ruta: location.pathname,
           canonica: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
           ogUrl: contenido('meta[property="og:url"]'),
           ogType: contenido('meta[property="og:type"]'),
           ogImage: contenido('meta[property="og:image"]'),
           card: contenido('meta[name="twitter:card"]'),
         };
       })()`,
    );
    const origen = d.ogImage.split("/").slice(0, 3).join("/");
    const relativa = d.ogImage.slice(origen.length);
    const respuesta = await fetch(`${new URL(BASE).origin}${relativa}`);
    const mime = respuesta.headers.get("content-type") ?? "";
    const urlOk = origen.startsWith("https://") && d.canonica === `${origen}${d.ruta}` && d.ogUrl === d.canonica;
    const imagenOk = relativa.endsWith(".png") && respuesta.ok && mime.startsWith("image/png");
    if (!urlOk || d.ogType !== caso.tipo || !d.card.startsWith("summary") || !imagenOk)
      malos.push({ ...caso, ...d, estado: respuesta.status, mime });
  }
  if (!malos.length) bien("tarjeta social: canónica y og:url con el mismo PNG en una ficha y un listado");
  else fallo("tarjeta social", JSON.stringify(malos));
} catch (e) {
  fallo("tarjeta social", String(e));
}

// Maqueta en móvil: ninguna página puede pedir scroll horizontal.
//
// Las puertas medían el sitio solo en el ancho de escritorio. A 390 px, diez
// fichas de clase del 5.1 se iban a más de 600 px —la tabla de progresión de
// cinco columnas empujaba la pista `1fr` de la ficha— y la pantalla del DM a
// 734 px, por la línea `white-space: nowrap` de su cabecera: el lector tenía
// que arrastrar la página entera para leer una fila. Se mide el documento, no
// una captura: `scrollWidth - clientWidth` es el desbordamiento real.
try {
  const pag = await abrir(`${BASE}/`);
  const casos = [
    ["/", "portada"],
    ["/5e/clases/mago/", "clase del 5.1"],
    ["/5e/clases/barbaro/", "clase del 5.1 con tabla corta"],
    ["/5.5/clases/mago/", "clase del 5.2.1"],
    ["/5e/conjuros/", "listado del 5.1"],
    ["/5.5/monstruos/", "listado del 5.2.1"],
    ["/mesa/pantalla/", "pantalla del DM"],
    ["/licencias/", "licencias"],
  ];
  const malos = [];
  for (const [ruta, etiqueta] of casos) {
    await ir(pag, `${BASE}${ruta}`);
    for (const ancho of [360, 390]) {
      await pag.enviar("Emulation.setDeviceMetricsOverride", {
        width: ancho,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      });
      const desborde = await evaluar(
        pag,
        "(() => { const d = document.documentElement; return d.scrollWidth - d.clientWidth; })()",
      );
      if (desborde > 1) malos.push(`${etiqueta} a ${ancho} px: ${desborde} px`);
    }
  }
  await pag.enviar("Emulation.clearDeviceMetricsOverride");
  if (!malos.length) bien("maqueta en móvil: ninguna página desborda a 360 ni a 390 px");
  else fallo("maqueta en móvil", malos.join(" · "));
} catch (e) {
  fallo("maqueta en móvil", String(e));
}

// Enlaces internos roos: se comprueban sobre el HTML compilado, no en el navegador.
//
// Las pestañas se cierran antes de leer los resultados: el perfil de Chrome se
// queda sin documentos abiertos y la pasada no deja 37 vivos esperando a que
// muera el proceso.
await pestanas.cerrarTodas();
const malos = resultados.filter((r) => !r.ok);
console.log("");
for (const r of resultados) console.log(`${r.ok ? "✓" : "✗"} ${r.nombre}${r.detalle ? ` — ${r.detalle}` : ""}`);
console.log(`\n${resultados.length - malos.length}/${resultados.length} comprobaciones correctas`);
process.exit(malos.length ? 1 : 0);
