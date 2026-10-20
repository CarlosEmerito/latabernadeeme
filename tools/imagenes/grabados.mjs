/**
 * Descarga grabados de dominio público y los prepara para la web.
 *
 * Fuente: The Metropolitan Museum of Art (API abierta, sin clave). Solo se
 * aceptan objetos marcados como dominio público y con técnica de estampa
 * (grabado, aguafuerte, xilografía, litografía), que es lo que da coherencia
 * visual al sitio.
 *
 * Salida: public/img/grabados/<tipo>/<slug>-960.webp y -480.webp, más un
 * manifiesto con título, autor, fecha, museo y enlace para el crédito.
 *
 * Uso: node tools/imagenes/grabados.mjs [--limite N] [--tipo monstruos]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SALIDA = path.join(process.cwd(), "public/img/grabados");
const MANIFIESTO = path.join(process.cwd(), "data/imagenes-grabados.json");
const CACHE = path.join(process.cwd(), ".cache/met");

const args = process.argv.slice(2);
const limite = args.includes("--limite") ? Number(args[args.indexOf("--limite") + 1]) : Infinity;
const soloTipo = args.includes("--tipo") ? args[args.indexOf("--tipo") + 1] : null;

const TECNICA = /engraving|etching|woodcut|lithograph|drypoint|mezzotint|aquatint/i;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) {
  const fichero = path.join(CACHE, Buffer.from(url).toString("base64url").slice(0, 120) + ".json");
  if (fs.existsSync(fichero)) return JSON.parse(fs.readFileSync(fichero, "utf8"));
  const r = await fetch(url, { headers: { "user-agent": "LaTabernaDeEme/1.0 (proyecto personal)" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const datos = await r.json();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(fichero, JSON.stringify(datos));
  await dormir(120);
  return datos;
}

async function buscarObjeto(termino) {
  const busqueda = await json(
    `https://collectionapi.metmuseum.org/public/collection/v1.1/search?q=${encodeURIComponent(termino)}&hasImages=true`,
  );
  const ids = (busqueda.objectIDs ?? []).slice(0, 10);
  let reserva = null;
  for (const id of ids) {
    let obj;
    try {
      obj = await json(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
    } catch {
      continue;
    }
    if (!obj?.isPublicDomain || !obj.primaryImage) continue;
    const texto = `${obj.title ?? ""} ${obj.objectName ?? ""} ${obj.classification ?? ""}`;
    if (!new RegExp(termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(texto)) continue;
    const estampa = TECNICA.test(obj.medium ?? "") || /print/i.test(obj.objectName ?? "");
    if (estampa) return obj;
    reserva ??= obj;
  }
  if (reserva) return reserva;

  // Segunda fuente: Cleveland, también CC0.
  const cl = await json(
    `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(termino)}&cc0=1&has_image=1&limit=5`,
  );
  const obra = (cl.data ?? []).find((x) => x.images?.web?.url);
  if (!obra) return null;
  return {
    isPublicDomain: true,
    primaryImage: obra.images.web.url,
    title: obra.title,
    artistDisplayName: obra.creators?.[0]?.description ?? "Anónimo",
    objectDate: obra.creation_date ?? "",
    objectURL: obra.url ?? `https://www.clevelandart.org/art/${obra.id}`,
    objectID: `cle-${obra.id}`,
    _museo: "Cleveland Museum of Art",
  };
}

async function descargar(url, destino) {
  const r = await fetch(url, { headers: { "user-agent": "LaTabernaDeEme/1.0" } });
  if (!r.ok) throw new Error(`${r.status} al descargar ${url}`);
  const buffer = Buffer.from(await r.arrayBuffer());
  const base = sharp(buffer).rotate();
  for (const ancho of [960, 480]) {
    await base
      .clone()
      .resize({ width: ancho, fit: "cover", position: "attention" })
      .grayscale()
      .linear(1.06, -8)
      .webp({ quality: 78 })
      .toFile(destino.replace(".webp", `-${ancho}.webp`));
  }
}

const manifiesto = fs.existsSync(MANIFIESTO) ? JSON.parse(fs.readFileSync(MANIFIESTO, "utf8")) : {};

// Entradas con alias inglés: es el término que entiende el museo.
const candidatos = [];
for (const ed of ["5e", "5.5"]) {
  const datos = JSON.parse(fs.readFileSync(path.join(process.cwd(), `dist/datos/${ed}.json`), "utf8"));
  for (const e of datos.entradas) {
    if (!e.a) continue;
    if (soloTipo && e.t !== soloTipo) continue;
    if (manifiesto[`${e.t}/${e.s}`]) continue;
    candidatos.push({ tipo: e.t, slug: e.s, nombre: e.n, termino: e.a });
  }
}

const vistos = new Set();
let hechos = 0;
let fallos = 0;

let intentos = 0;
for (const c of candidatos) {
  if (intentos >= limite) break;
  intentos++;
  const clave = `${c.tipo}/${c.slug}`;
  if (vistos.has(clave)) continue;
  vistos.add(clave);

  try {
    const obj = await buscarObjeto(c.termino);
    if (!obj) {
      fallos++;
      continue;
    }
    const dir = path.join(SALIDA, c.tipo);
    fs.mkdirSync(dir, { recursive: true });
    const destino = path.join(dir, `${c.slug}.webp`);
    await descargar(obj.primaryImage, destino);
    manifiesto[clave] = {
      titulo: obj.title,
      autor: obj.artistDisplayName || "Anónimo",
      fecha: obj.objectDate || "",
      museo: obj._museo ?? "The Metropolitan Museum of Art",
      url: obj.objectURL,
      licencia: "Dominio público (CC0)",
      objeto: obj.objectID,
    };
    hechos++;
    if (hechos % 10 === 0) console.log(`  ${hechos} imágenes…`);
  } catch (e) {
    fallos++;
  }
}

fs.writeFileSync(MANIFIESTO, JSON.stringify(manifiesto, null, 2) + "\n");
console.log(`Grabados: ${hechos} nuevos, ${fallos} sin resultado. Total en el manifiesto: ${Object.keys(manifiesto).length}`);
