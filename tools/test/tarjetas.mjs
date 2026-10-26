/**
 * Comprueba que la tarjeta emergente se lleve un índice delgado y que ese índice
 * cubra todas las fichas enlazadas.
 *
 * La tarjeta de `Base.astro` enseña el nombre y tres o cuatro datos del perfil,
 * y para eso descargaba `/datos/<ed>.json` entero: 323 150 B en el 5.2.1 y
 * 302 778 B en el 5.1, el catálogo con todas las entradas y sus facetas. Desde
 * T-0273 pide `/datos/<ed>-tarjetas.json`, que publica solo lo que pinta.
 *
 * Lo que se comprueba, contra el sitio compilado:
 *
 *   1. El presupuesto: cada índice pesa 60 000 B o menos.
 *   2. La forma: `campos` declara la lista de cada tipo empezando por `nombre`,
 *      cada fila tiene tantos valores como campos, ninguno vacío ni nulo y toda
 *      referencia a `textos` apunta a un texto de verdad.
 *   3. El dato: cada valor de cada fila es el que publica `/datos/<ed>.json`
 *      para esa entrada. Un índice que se desalinea con el catálogo pinta una
 *      tarjeta con el dato de otra casilla y nadie se entera.
 *   4. La cobertura: todo `tipo/slug` que aparece en un `data-tarjeta` del HTML
 *      publicado tiene su fila. Una ficha enlazada sin fila se queda sin
 *      tarjeta, que es exactamente lo que el índice venía a evitar.
 *   5. El consumo: el bloque de la página que pinta la tarjeta pide el índice
 *      delgado y no el catálogo entero.
 *
 * Y se autocomprueba perturbando el índice real: quitar una fila, acortar otra,
 * cambiar un nombre, pasarse de bytes o romper una referencia tienen que poner
 * la puerta en rojo, o el verde no significa nada.
 *
 * Uso: node tools/test/tarjetas.mjs [dist]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.argv[2] ?? "dist");

/** El techo de bytes de cada índice: lo que cuesta abrir una tarjeta. */
const PRESUPUESTO = 60000;

/** Las ediciones que publican índice. */
const EDICIONES = ["5.5", "5e"];

/**
 * De dónde sale cada campo de la fila en el catálogo publicado. Es la
 * descripción del contrato escrita otra vez, a mano: si la plantilla pinta una
 * casilla distinta de la que dice este mapa, el dato no cuadra y se ve.
 */
const FUENTES = {
  conjuros: {
    nombre: (e) => e.n,
    nivel: (e) => Number(e.d?.nivel ?? 0),
    escuela: (e) => e.d?.escuela ?? "",
    tiempo: (e) => e.d?.tiempo ?? "",
    alcance: (e) => e.d?.alcance ?? "",
    duracion: (e) => e.d?.duracion ?? "",
  },
  monstruos: {
    nombre: (e) => e.n,
    tamano: (e) => e.d?.tamano ?? "",
    tipo: (e) => e.d?.tipo ?? "",
    vd: (e) => e.d?.vd ?? "",
    ca: (e) => e.d?.ca ?? "",
    pg: (e) => e.d?.pg ?? "",
  },
};

/** Los HTML de `dist/`, en orden estable. */
function paginas(dir) {
  const salida = [];
  const recorrer = (d) => {
    for (const entrada of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const ruta = path.join(d, entrada.name);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (entrada.name.endsWith(".html")) salida.push(ruta);
    }
  };
  if (fs.existsSync(dir)) recorrer(dir);
  return salida;
}

/** Los `data-tarjeta` que publica una página, con la edición de su enlace. */
function enlacesDeTarjeta(html) {
  const salida = [];
  for (const m of html.matchAll(/<a\b[^>]*\bdata-tarjeta="([^"]+)"[^>]*>/g)) {
    const etiqueta = m[0];
    const ed = /\bdata-ed="([^"]+)"/.exec(etiqueta)?.[1] ?? "5.5";
    const [tipo, slug] = m[1].split("/");
    if (tipo && slug) salida.push({ ed, tipo, slug });
  }
  return salida;
}

/** El bloque de la página que pinta la tarjeta emergente, si lo trae. */
function bloqueDeTarjetas(html) {
  for (const m of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) {
    if (m[1].includes("tarjeta-datos")) return m[1];
  }
  return null;
}

/** Los valores de una fila, con las referencias a `textos` resueltas. */
function valoresDe(indice, campos, fila) {
  return campos.map((_, i) => {
    const v = fila[i];
    return typeof v === "number" && v < 0 ? indice.textos?.[-v - 1] : v;
  });
}

/**
 * Los problemas de un índice. Recibe el índice ya leído, el catálogo de su
 * edición (Map `tipo/slug` → entrada) y los enlaces publicados de esa edición.
 */
function revisar({ ed, indice, catalogo, refs, bytes }) {
  const problemas = [];
  if (bytes > PRESUPUESTO) {
    problemas.push(`el índice del ${ed} pesa ${bytes} B (presupuesto ${PRESUPUESTO})`);
  }
  if (!indice || typeof indice !== "object") {
    problemas.push(`el índice del ${ed} no es un objeto`);
    return problemas;
  }
  if (indice.v !== 1) problemas.push(`el índice del ${ed} no declara la versión 1 (dice ${JSON.stringify(indice.v)})`);
  if (indice.ed !== ed) problemas.push(`el índice del ${ed} dice ser de ${JSON.stringify(indice.ed)}`);
  if (!Array.isArray(indice.textos)) {
    problemas.push(`el índice del ${ed} no trae la lista de textos`);
  }
  const campos = indice.campos && typeof indice.campos === "object" ? indice.campos : {};
  if (Object.keys(campos).length === 0) problemas.push(`el índice del ${ed} no declara ningún campo`);

  for (const [tipo, lista] of Object.entries(campos)) {
    if (!Array.isArray(lista) || lista.length < 2) {
      problemas.push(`${ed}/${tipo}: los campos no son una lista de al menos dos`);
      continue;
    }
    if (lista[0] !== "nombre") problemas.push(`${ed}/${tipo}: el primer campo debería ser «nombre» y es ${JSON.stringify(lista[0])}`);
    const seccion = indice[tipo];
    if (!seccion || typeof seccion !== "object" || Array.isArray(seccion)) {
      problemas.push(`${ed}/${tipo}: no hay filas para el tipo`);
      continue;
    }
    if (Object.keys(seccion).length === 0) problemas.push(`${ed}/${tipo}: la sección está vacía`);

    for (const [slug, fila] of Object.entries(seccion)) {
      if (!Array.isArray(fila)) {
        problemas.push(`${ed}/${tipo}/${slug}: la fila no es una lista`);
        continue;
      }
      if (fila.length !== lista.length) {
        problemas.push(`${ed}/${tipo}/${slug}: la fila tiene ${fila.length} valores y ${lista.length} campos`);
      }
      let rota = false;
      for (const v of fila) {
        if (v === null || v === undefined || (typeof v !== "string" && typeof v !== "number")) {
          problemas.push(`${ed}/${tipo}/${slug}: hay un valor vacío o de otro tipo (${JSON.stringify(v)})`);
          rota = true;
          break;
        }
        if (typeof v === "number" && v < 0 && typeof indice.textos?.[-v - 1] !== "string") {
          problemas.push(`${ed}/${tipo}/${slug}: la referencia ${v} no apunta a ningún texto`);
          rota = true;
          break;
        }
      }
      if (rota) continue;

      const valores = valoresDe(indice, lista, fila);
      if (typeof valores[0] !== "string" || valores[0].trim() === "") {
        problemas.push(`${ed}/${tipo}/${slug}: sin nombre`);
      }

      const entrada = catalogo.get(`${tipo}/${slug}`);
      if (!entrada) {
        problemas.push(`${ed}/${tipo}/${slug}: no está en /datos/${ed}.json`);
        continue;
      }
      lista.forEach((campo, i) => {
        const fuente = FUENTES[tipo]?.[campo];
        if (!fuente) {
          problemas.push(`${ed}/${tipo}: la tarjeta pinta «${campo}» y la puerta no sabe de dónde sale`);
          return;
        }
        const esperado = fuente(entrada);
        const obtenido = valores[i];
        const iguales =
          typeof esperado === "number" || typeof obtenido === "number"
            ? Number(esperado) === Number(obtenido)
            : String(esperado) === String(obtenido);
        if (!iguales) {
          problemas.push(
            `${ed}/${tipo}/${slug}: «${campo}» publica ${JSON.stringify(obtenido)} y el catálogo dice ${JSON.stringify(esperado)}`,
          );
        }
      });
    }
  }

  // Cobertura: ningún enlace publicado se queda sin fila.
  const referidos = new Map();
  for (const ref of refs) {
    if (ref.ed !== ed) continue;
    const clave = `${ref.tipo}/${ref.slug}`;
    referidos.set(clave, (referidos.get(clave) ?? 0) + 1);
  }
  for (const clave of referidos.keys()) {
    const [tipo, slug] = clave.split("/");
    if (!indice[tipo]?.[slug]) {
      problemas.push(`el enlace ${clave} de una ficha no tiene fila en el índice del ${ed}: esa tarjeta no sale`);
    }
  }
  return problemas;
}

// --- El sitio publicado -----------------------------------------------------

const fallos = [];
let comprobados = 0;

const ficheros = paginas(DIST);
if (ficheros.length === 0) {
  console.log(`✗ No hay HTML en ${DIST} (¿falta npm run build?).`);
  process.exit(1);
}

const refs = [];
let bloqueVisto = null;
let paginaConEnlaces = null;
for (const fichero of ficheros) {
  const html = fs.readFileSync(fichero, "utf8");
  if (!html.includes("data-tarjeta=")) continue;
  const enlaces = enlacesDeTarjeta(html);
  if (enlaces.length === 0) continue;
  refs.push(...enlaces);
  if (!bloqueVisto) {
    bloqueVisto = bloqueDeTarjetas(html);
    paginaConEnlaces = path.relative(DIST, fichero);
  }
}
comprobados++;

if (refs.length === 0) {
  fallos.push("no hay ningún enlace con data-tarjeta en el HTML publicado");
}

const indices = new Map();
const catalogos = new Map();
for (const ed of EDICIONES) {
  const rutaIndice = path.join(DIST, "datos", `${ed}-tarjetas.json`);
  const rutaCatalogo = path.join(DIST, "datos", `${ed}.json`);
  comprobados++;

  if (!fs.existsSync(rutaIndice)) {
    fallos.push(`no está ${path.relative(DIST, rutaIndice)} (¿falta npm run build?)`);
    continue;
  }
  if (!fs.existsSync(rutaCatalogo)) {
    fallos.push(`no está ${path.relative(DIST, rutaCatalogo)}, así que el índice no se puede contrastar`);
    continue;
  }

  const bytes = fs.statSync(rutaIndice).size;
  let indice;
  try {
    indice = JSON.parse(fs.readFileSync(rutaIndice, "utf8"));
  } catch (e) {
    fallos.push(`el índice del ${ed} no es JSON: ${e.message}`);
    continue;
  }
  const catalogo = new Map();
  for (const entrada of JSON.parse(fs.readFileSync(rutaCatalogo, "utf8")).entradas ?? []) {
    catalogo.set(`${entrada.t}/${entrada.s}`, entrada);
  }
  indices.set(ed, indice);
  catalogos.set(ed, catalogo);

  comprobados++;
  for (const problema of revisar({ ed, indice, catalogo, refs, bytes })) {
    fallos.push(`el índice del ${ed}: ${problema}`);
  }
}

// El consumo: el bloque que pinta la tarjeta pide el índice delgado.
comprobados++;
if (!bloqueVisto) {
  fallos.push(`no encuentro el bloque de la tarjeta emergente en el HTML publicado (${paginaConEnlaces ?? "ninguna página"})`);
} else if (!bloqueVisto.includes("-tarjetas.json")) {
  fallos.push(`la tarjeta emergente de ${paginaConEnlaces} no pide el índice delgado: sigue tirando del catálogo entero`);
}

// --- Autocomprobación -------------------------------------------------------

const ed = "5.5";
const indiceReal = indices.get(ed);
const catalogoReal = catalogos.get(ed);
const refsReal = refs.filter((r) => r.ed === ed);
const bytesReal = fs.existsSync(path.join(DIST, "datos", `${ed}-tarjetas.json`))
  ? fs.statSync(path.join(DIST, "datos", `${ed}-tarjetas.json`)).size
  : 0;

if (indiceReal && catalogoReal) {
  const base = () => ({
    ed,
    indice: structuredClone(indiceReal),
    catalogo: catalogoReal,
    refs: refsReal,
    bytes: bytesReal,
  });

  comprobados++;
  if (revisar(base()).length > 0) {
    fallos.push("el índice que se publica hoy sale con problemas en la autocomprobación");
  }

  // Quitar una fila referida tiene que notarse, y con su nombre.
  const referida = refsReal.map((r) => `${r.tipo}/${r.slug}`).find((c) => {
    const [t, s] = c.split("/");
    return indiceReal[t]?.[s];
  });
  if (referida) {
    comprobados++;
    const [tipo, slug] = referida.split("/");
    const caso = base();
    delete caso.indice[tipo][slug];
    if (!revisar(caso).some((p) => p.includes(referida))) {
      fallos.push(`quitar la fila ${referida} del índice no pone la puerta en rojo`);
    }
  }

  // Acortar una fila: los campos y los valores dejan de cuadrar.
  comprobados++;
  {
    const caso = base();
    const tipo = Object.keys(caso.indice.campos)[0];
    const slug = Object.keys(caso.indice[tipo])[0];
    caso.indice[tipo][slug] = caso.indice[tipo][slug].slice(0, -1);
    if (!revisar(caso).some((p) => p.includes(`${tipo}/${slug}`))) {
      fallos.push("acortar una fila del índice no pone la puerta en rojo");
    }
  }

  // Cambiar un nombre: el índice deja de decir lo mismo que el catálogo.
  comprobados++;
  {
    const caso = base();
    const tipo = "conjuros";
    const slug = Object.keys(caso.indice[tipo])[0];
    caso.indice.textos[caso.indice.textos.length] = "Nombre inventado";
    caso.indice[tipo][slug][0] = -(caso.indice.textos.length - 1) - 1;
    if (!revisar(caso).some((p) => p.includes(`${tipo}/${slug}`) && p.includes("nombre"))) {
      fallos.push(`cambiar el nombre de ${tipo}/${slug} no pone la puerta en rojo`);
    }
  }

  // Una referencia que no apunta a ningún texto.
  comprobados++;
  {
    const caso = base();
    const tipo = "monstruos";
    const slug = Object.keys(caso.indice[tipo])[0];
    caso.indice[tipo][slug][2] = -(caso.indice.textos.length + 50);
    if (!revisar(caso).some((p) => p.includes(`${tipo}/${slug}`) && p.includes("referencia"))) {
      fallos.push(`romper una referencia al diccionario de ${tipo}/${slug} no pone la puerta en rojo`);
    }
  }

  // Pasarse de presupuesto.
  comprobados++;
  {
    const caso = base();
    caso.bytes = PRESUPUESTO + 1;
    if (!revisar(caso).some((p) => p.includes("presupuesto"))) {
      fallos.push("un índice por encima del presupuesto no pone la puerta en rojo");
    }
  }
}

console.log(`Tarjetas emergentes: ${comprobados} casos comprobados sobre ${refs.length} enlaces publicados.`);
if (fallos.length > 0) {
  console.log("✗ La tarjeta emergente no se lleva lo que debe:");
  for (const fallo of fallos) console.log(`   - ${fallo}`);
  process.exit(1);
}
const tamanos = EDICIONES.map((e) => {
  const ruta = path.join(DIST, "datos", `${e}-tarjetas.json`);
  return `${e} ${fs.statSync(ruta).size} B`;
}).join(", ");
console.log(`La tarjeta emergente pide el índice delgado (${tamanos}), cubre los ${refs.length} enlaces publicados y cada valor coincide con el catálogo.`);
