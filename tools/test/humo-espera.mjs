/**
 * Comprueba que las pestañas del humo esperan a que la página cargue y se cierran.
 *
 * El humo abría cada página con una espera fija de 800 ms y no cerraba ninguna
 * pestaña: al final de la pasada quedaban 37 documentos vivos en el mismo perfil
 * de Chrome y el render se retrasaba lo justo para que los 800 ms no bastaran.
 * La comprobación de la tarjeta social leía entonces el `<head>` vacío —canónica,
 * `og:url` y `og:image` en blanco— y pedía la imagen a una ruta sin la base del
 * sitio (404), así que el SEO del sitio daba rojo espurio al azar, con el `dist/`
 * correcto y con el mismo servidor.
 *
 * Lo que se vigila aquí es la estrategia, sin abrir Chrome: `Pestanas` espera al
 * evento de carga de CDP con el `document.readyState` de remate, la pestaña que
 * sobra se cierra por el endpoint de CDP, y al terminar no queda ninguna abierta.
 * Los dobles imitan lo que hace Chrome —`Page.navigate` dispara el evento y
 * `Runtime.evaluate` devuelve el `readyState`—, así que un `abrir()` que se fíe
 * del reloj no consulta el estado ni una vez y esta puerta lo canta.
 *
 * Uso: node tools/test/humo-espera.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "../verify/comun.mjs";
import { Pestanas, nuevaPestana } from "./cdp.mjs";

const resultados = [];
const comprobar = (nombre, condicion, detalle = "") => {
  if (condicion) resultados.push({ ok: true, nombre });
  else resultados.push({ ok: false, nombre, detalle: String(detalle) });
};

/**
 * Pestaña falsa: imita el mando que devuelve `nuevaPestana`.
 *
 * Nace en `about:blank`, que ya está «complete», como la pestaña de verdad.
 * `Page.navigate` la lleva a la URL pedida, que tarda `consultasHastaCargar`
 * consultas en completarse. `Runtime.evaluate` contesta el estado del documento
 * —ruta, `readyState` y si lleva la marca del documento anterior—, que es lo que
 * mira la espera. Con `carga: false` la página pedida no se completa nunca, que
 * es el caso en el que el humo tiene que rendirse.
 */
function paginaFalsa({ consultasHastaCargar = 3, carga = true } = {}) {
  let href = "about:blank";
  let viejo = false;
  let consultas = 0;
  let consultasTrasNavegar = 0;
  let cerrada = 0;
  const ordenes = [];
  return {
    id: "falsa",
    ordenes,
    get href() {
      return href;
    },
    get consultas() {
      return consultas;
    },
    get consultasTrasNavegar() {
      return consultasTrasNavegar;
    },
    get cerrada() {
      return cerrada;
    },
    async enviar(metodo, params = {}) {
      ordenes.push(metodo);
      if (metodo === "Page.navigate") {
        href = params.url;
        viejo = false;
        consultasTrasNavegar = 0;
        return {};
      }
      if (metodo === "Runtime.evaluate") {
        if (String(params.expression).includes("__humoDocumento = 1")) {
          viejo = true;
          return { result: { result: { value: 1 } } };
        }
        consultas += 1;
        if (href !== "about:blank") consultasTrasNavegar += 1;
        const listo =
          href === "about:blank" || (carga && consultasTrasNavegar >= consultasHastaCargar) ? "complete" : "loading";
        return { result: { result: { value: { href, listo, viejo } } } };
      }
      return {};
    },
    cerrar() {
      cerrada += 1;
      return Promise.resolve();
    },
  };
}

/** `Pestanas` con pestañas falsas y sin red. */
function pestanasFalsas(opciones = {}) {
  const hechas = [];
  const pestanas = new Pestanas({
    maxVivas: 2,
    techoMs: 600,
    ...opciones,
    conectar: async () => {
      const pag = paginaFalsa(opciones.falsa);
      hechas.push(pag);
      return pag;
    },
  });
  return { pestanas, hechas };
}

// 1. La pestaña se crea y se cierra por el endpoint de Chrome, no solo soltando el WebSocket.
try {
  const pedidas = [];
  let socket = null;
  const transporte = {
    fetch: async (url, opciones = {}) => {
      pedidas.push({ url, metodo: opciones.method ?? "GET" });
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "P7", webSocketDebuggerUrl: "ws://falso/7" }),
      };
    },
    WebSocket: class {
      constructor(url) {
        this.url = url;
        this.cerrada = false;
        socket = this;
        setTimeout(() => this.onopen?.(), 0);
      }
      send(datos) {
        const msg = JSON.parse(datos);
        setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id: msg.id, result: {} }) }), 0);
      }
      close() {
        this.cerrada = true;
      }
    },
  };
  const pag = await nuevaPestana("http://localhost:9223", "about:blank", transporte);
  await pag.cerrar();
  const nueva = pedidas.find((p) => p.url.includes("/json/new?"));
  comprobar(
    "nuevaPestana abre la pestaña con PUT /json/new",
    Boolean(nueva) && nueva.metodo === "PUT",
    JSON.stringify(pedidas),
  );
  comprobar(
    "nuevaPestana cierra la pestaña por /json/close/<id>",
    pedidas.some((p) => p.url === "http://localhost:9223/json/close/P7"),
    JSON.stringify(pedidas),
  );
  comprobar("nuevaPestana suelta el WebSocket al cerrar", socket?.cerrada === true, String(socket?.cerrada));
} catch (error) {
  comprobar("nuevaPestana: alta y cierre por CDP", false, error);
}

// 2. `abrir` espera a que el documento pedido esté cargado, no a la pestaña en blanco ni a un reloj.
try {
  const { pestanas, hechas } = pestanasFalsas({ falsa: { consultasHastaCargar: 3 } });
  const url = "http://sitio/latabernadeeme/5.5/conjuros/bola-de-fuego/";
  const pag = await pestanas.abrir(url);
  comprobar(
    "abrir consulta el documento hasta «complete» (no espera a un reloj)",
    pag.cargada === true && hechas[0].consultasTrasNavegar >= 3,
    JSON.stringify({ cargada: pag.cargada, consultas: hechas[0].consultasTrasNavegar }),
  );
  comprobar(
    "abrir no se conforma con el about:blank que ya está cargado",
    hechas[0].href === url,
    JSON.stringify({ href: hechas[0].href }),
  );
  comprobar(
    "abrir navega antes de dar la página por cargada",
    hechas[0].ordenes.indexOf("Page.navigate") >= 0 && hechas[0].ordenes.indexOf("Page.navigate") <= 1,
    JSON.stringify(hechas[0].ordenes),
  );
} catch (error) {
  comprobar("abrir espera a la carga", false, error);
}

// 3. Recargar la misma página también espera al documento nuevo, no al viejo.
try {
  const { pestanas, hechas } = pestanasFalsas({ falsa: { consultasHastaCargar: 2 } });
  const url = "http://sitio/latabernadeeme/mesa/";
  const pag = await pestanas.abrir(url);
  await pestanas.ir(pag, url);
  const navegaciones = hechas[0].ordenes.filter((m) => m === "Page.navigate").length;
  comprobar(
    "ir espera al documento nuevo al recargar la misma ruta",
    pag.cargada === true && navegaciones === 2 && hechas[0].consultasTrasNavegar >= 2,
    JSON.stringify({ cargada: pag.cargada, navegaciones, consultas: hechas[0].consultasTrasNavegar }),
  );
} catch (error) {
  comprobar("ir espera al documento nuevo", false, error);
}

// 4. Si la carga no llega, se rinde con el techo y lo dice: no se cuelga la pasada.
try {
  const { pestanas } = pestanasFalsas({ techoMs: 120, falsa: { carga: false } });
  const comienzo = Date.now();
  const pag = await pestanas.abrir("http://sitio/latabernadeeme/5e/conjuros/");
  const tardado = Date.now() - comienzo;
  comprobar(
    "abrir se rinde con el techo si la página no carga",
    pag.cargada === false && tardado >= 100 && tardado < 1500,
    JSON.stringify({ cargada: pag.cargada, tardado }),
  );
} catch (error) {
  comprobar("abrir con la página que no carga", false, error);
}

// 5. Las pestañas que sobran se cierran: el humo ya no acumula 37 documentos.
try {
  const { pestanas, hechas } = pestanasFalsas({ maxVivas: 2 });
  for (const sufijo of ["uno", "dos", "tres", "cuatro"]) await pestanas.abrir(`http://sitio/${sufijo}/`);
  const cerradas = hechas.filter((p) => p.cerrada === 1).length;
  comprobar(
    "se cierran las pestañas que sobran (quedan como mucho maxVivas)",
    cerradas === 2 && pestanas.vivas.length === 2,
    JSON.stringify({ cerradas, vivas: pestanas.vivas.length }),
  );
  const enOrden = hechas.slice(0, 2).every((p) => p.cerrada === 1) && hechas.slice(2).every((p) => p.cerrada === 0);
  comprobar(
    "se cierran las más viejas, no las que se están usando",
    enOrden,
    JSON.stringify(hechas.map((p) => p.cerrada)),
  );
} catch (error) {
  comprobar("cierre de las pestañas que sobran", false, error);
}

// 6. La pestaña que se usa se conserva aunque sea la primera que se abrió.
try {
  const { pestanas, hechas } = pestanasFalsas({ maxVivas: 2 });
  const primera = await pestanas.abrir("http://sitio/mesa/");
  await pestanas.abrir("http://sitio/dos/");
  await primera.enviar("Runtime.evaluate", { expression: "document.readyState" });
  await pestanas.abrir("http://sitio/tres/");
  comprobar(
    "la pestaña que se acaba de usar no se cierra",
    primera.cerrada === 0 && hechas[1].cerrada === 1,
    JSON.stringify(hechas.map((p) => p.cerrada)),
  );
} catch (error) {
  comprobar("conservar la pestaña en uso", false, error);
}

// 7. Al terminar la pasada no queda ninguna pestaña abierta en el perfil.
try {
  const { pestanas, hechas } = pestanasFalsas({ maxVivas: 5 });
  for (const sufijo of ["uno", "dos", "tres"]) await pestanas.abrir(`http://sitio/${sufijo}/`);
  await pestanas.cerrarTodas();
  comprobar(
    "cerrarTodas deja el perfil sin documentos abiertos",
    pestanas.vivas.length === 0 && hechas.every((p) => p.cerrada === 1),
    JSON.stringify({ vivas: pestanas.vivas.length, cerradas: hechas.map((p) => p.cerrada) }),
  );
} catch (error) {
  comprobar("cerrarTodas", false, error);
}

// 8. El humo usa este módulo: si vuelve a montar su propia espera, la puerta no vigila nada.
try {
  const fuente = fs.readFileSync(path.join(RAIZ, "tools/test/humo.mjs"), "utf8");
  comprobar(
    "humo.mjs espera la carga con Pestanas, no con un plazo fijo",
    /from "\.\/cdp\.mjs"/.test(fuente) && /new Pestanas\(/.test(fuente) && !/setTimeout\(r, 800\)/.test(fuente),
    "humo.mjs no importa tools/test/cdp.mjs o conserva la espera fija de 800 ms",
  );
} catch (error) {
  comprobar("humo.mjs usa el módulo de pestañas", false, error);
}

console.log("");
for (const r of resultados) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.nombre}${r.detalle && !r.ok ? ` — ${r.detalle}` : ""}`);
}
const malos = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - malos}/${resultados.length} comprobaciones correctas`);
process.exit(malos ? 1 : 0);
