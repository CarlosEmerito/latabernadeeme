/**
 * Pestañas de Chrome por CDP para las pruebas de humo.
 *
 * Abre cada página esperando a que cargue de verdad y cierra las que ya no se
 * usan. Antes el humo navegaba y esperaba 800 ms de reloj, y no cerraba ninguna
 * pestaña: una pasada dejaba 37 documentos vivos en el mismo perfil. Con 60
 * pestañas abiertas de antemano la página siguiente se renderiza más tarde, los
 * 800 ms no bastan y la comprobación de la tarjeta social lee el `<head>` vacío
 * —canónica, `og:url` y `og:image` en blanco, y un 404 al pedir la imagen a una
 * ruta sin la base del sitio— aunque el sitio esté bien. Medido con la espera
 * fija: 2 de 4 intentos leían el `<head>` vacío; con la espera por carga, 0 de 25.
 *
 * La espera no es solo el evento de carga: la pestaña nace en `about:blank` y su
 * `load` puede llegar cuando ya estamos escuchando, así que una espera por evento
 * se conforma con el documento en blanco —ya cargado— y devuelve el mando con la
 * página a medio arrancar: el HTML está pintado (lo sirve el servidor) y el
 * `<script type="module">` que engancha los filtros todavía no ha corrido. Por
 * eso se sondea el documento hasta que su ruta es la pedida **y** el
 * `readyState` es `complete`, con un techo: una página que no carga se rinde y lo
 * dice en lugar de colgar la pasada. El cierre va por `/json/close/<id>`.
 *
 * Uso desde el humo:
 *
 *   const pestanas = new Pestanas({ cdp: CDP });
 *   const pag = await pestanas.abrir(url);
 *   ...
 *   await pestanas.cerrarTodas();
 */
const dormir = (ms) => new Promise((hecho) => setTimeout(hecho, ms));

/**
 * Ruta del documento, sin barra final y con las barras repetidas colapsadas:
 * `about:blank` da `blank` y la página pedida, su ruta. Es lo que distingue el
 * documento en blanco de la pestaña nueva del que se acaba de navegar.
 */
function rutaDe(url) {
  try {
    return new URL(url).pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  } catch {
    return String(url);
  }
}

/**
 * Abre una pestaña en el Chrome que escucha en `cdp` y devuelve el mando de esa
 * pestaña: `enviar(método, params)`, `cerrar()` e `id`. `transporte` permite
 * sustituir `fetch` y `WebSocket` en las pruebas.
 */
export async function nuevaPestana(cdp, url, transporte = {}) {
  const pedir = transporte.fetch ?? globalThis.fetch;
  const WebSocketCdp = transporte.WebSocket ?? globalThis.WebSocket;
  const r = await pedir(`${cdp}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!r.ok) throw new Error(`Chrome no abre una pestaña (${r.status} ${cdp}/json/new)`);
  const t = await r.json();
  const ws = new WebSocketCdp(t.webSocketDebuggerUrl);
  await new Promise((resolver, rechazar) => {
    ws.onopen = resolver;
    ws.onerror = rechazar;
  });
  let id = 0;
  const pendientes = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pendientes.has(msg.id)) {
      const responder = pendientes.get(msg.id);
      pendientes.delete(msg.id);
      responder(msg);
    }
  };
  const enviar = (metodo, params = {}) =>
    new Promise((resolver) => {
      const n = ++id;
      pendientes.set(n, resolver);
      ws.send(JSON.stringify({ id: n, method: metodo, params }));
    });
  await enviar("Page.enable");
  await enviar("Runtime.enable");
  return {
    id: t.id,
    enviar,
    async cerrar() {
      try {
        ws.close();
      } catch {
        // ya estaba cerrada
      }
      try {
        await pedir(`${cdp}/json/close/${t.id}`);
      } catch {
        // Chrome pudo apagarse antes que la pestaña
      }
    },
  };
}

/** Evalúa una expresión en la página y devuelve su valor. */
export async function evaluar(pag, expresion) {
  const r = await pag.enviar("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r?.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r?.result?.result?.value;
}

/** Deja una marca en el documento actual: la navegación se la lleva por delante. */
async function marcar(pag) {
  try {
    await evaluar(pag, `(window.__humoDocumento = 1, 1)`);
  } catch {
    // el documento viejo puede estar en mitad de una navegación
  }
}

/**
 * Espera a que la pestaña tenga cargada la página de `url`: el documento tiene
 * que ser uno nuevo —sin la marca del anterior—, de la ruta pedida y completo.
 * Las tres cosas hacen falta: la pestaña nace en `about:blank`, ya cargado, y en
 * una recarga la ruta no distingue el documento viejo del nuevo. Devuelve si lo
 * consiguió dentro del techo; durante la navegación la consulta puede fallar o
 * llevársela por delante otra navegación, así que se reintenta.
 */
export async function esperarDocumento(pag, url, techoMs = 15000) {
  const objetivo = rutaDe(url);
  const limite = Date.now() + techoMs;
  while (Date.now() < limite) {
    try {
      const estado = await evaluar(
        pag,
        `({href: location.href, listo: document.readyState, viejo: window.__humoDocumento === 1})`,
      );
      if (estado && !estado.viejo && estado.listo === "complete" && rutaDe(estado.href) === objetivo) return true;
    } catch {
      // el contexto de la página aún no está: la navegación va por la mitad
    }
    await dormir(50);
  }
  return false;
}

/**
 * Las pestañas de una pasada del humo: navega esperando la carga y cierra las
 * que sobran. Se conservan como mucho `maxVivas`, y se descarta la que lleva más
 * tiempo sin usarse —cada orden a CDP la marca como reciente—, así que la
 * pestaña que está trabajando nunca se cierra por el camino.
 */
export class Pestanas {
  constructor({ cdp = "http://localhost:9223", maxVivas = 8, techoMs = 15000, conectar } = {}) {
    this.cdp = cdp;
    this.maxVivas = maxVivas;
    this.techoMs = techoMs;
    this.conectar = conectar ?? (() => nuevaPestana(cdp, "about:blank"));
    this.vivas = [];
    this.abiertas = 0;
  }

  /** Marca la pestaña como la más reciente. */
  tocar(pag) {
    const i = this.vivas.indexOf(pag);
    if (i >= 0) this.vivas.splice(i, 1);
    this.vivas.push(pag);
  }

  /** Abre `url` y espera a que cargue. La pestaña vuelve con `cargada`. */
  async abrir(url) {
    const pag = await this.conectar("about:blank");
    this.vivas.push(pag);
    this.abiertas += 1;
    const enviar = pag.enviar;
    pag.enviar = (metodo, params) => {
      this.tocar(pag);
      return enviar(metodo, params);
    };
    pag.cargada = false;
    // Se descarta la pestaña que sobra antes de cargar esta: así el perfil no
    // pasa nunca de `maxVivas` documentos abiertos.
    await this.purgar();
    try {
      pag.cargada = await this.navegar(pag, url);
    } catch (error) {
      pag.error = error;
    }
    if (!pag.cargada) process.stderr.write(`⚠ ${url} no ha cargado en ${this.techoMs} ms\n`);
    return pag;
  }

  /** Navega una pestaña que ya existe, esperando también a la carga. */
  async ir(pag, url) {
    pag.cargada = await this.navegar(pag, url);
    return pag;
  }

  /** Marca el documento que se va y espera al nuevo: vale para abrir y para recargar. */
  async navegar(pag, url) {
    this.tocar(pag);
    await marcar(pag);
    await pag.enviar("Page.navigate", { url });
    return esperarDocumento(pag, url, this.techoMs);
  }

  async purgar() {
    while (this.vivas.length > this.maxVivas) await this.cerrar(this.vivas[0]);
  }

  async cerrar(pag) {
    const i = this.vivas.indexOf(pag);
    if (i >= 0) this.vivas.splice(i, 1);
    try {
      await pag.cerrar();
    } catch {
      // la pestaña ya no estaba
    }
  }

  async cerrarTodas() {
    while (this.vivas.length) await this.cerrar(this.vivas[0]);
  }
}
