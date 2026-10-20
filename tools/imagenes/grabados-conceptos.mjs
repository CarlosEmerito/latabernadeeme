/**
 * Segunda pasada de grabados: por concepto.
 *
 * Las criaturas inventadas no existen en ningún museo, pero muchas fichas
 * comparten un concepto que sí: «dragón», «lobo», «espada», «poción». Este
 * script agrupa las entradas por concepto, descarga dos o tres estampas por
 * concepto y reparte una distinta a cada entrada según su hash, de modo que el
 * mismo dragón no se repite en las seis fichas de dragón.
 *
 * Uso: node tools/imagenes/grabados-conceptos.mjs [--limite N]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SALIDA = path.join(process.cwd(), "public/img/grabados");
const MANIFIESTO = path.join(process.cwd(), "data/imagenes-grabados.json");
const CACHE = path.join(process.cwd(), ".cache/met");

const args = process.argv.slice(2);
const limite = args.includes("--limite") ? Number(args[args.indexOf("--limite") + 1]) : 999;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Palabra en el nombre de la entrada → términos que entiende un museo.
const CONCEPTOS = [
  { clave: "dragón", tiene: /drag[oó]n|wyrm|wyvern|guiverno|sierpe/i, terminos: ["dragon", "wyvern", "serpent"] },
  { clave: "lobo", tiene: /lobo|worg|huargo/i, terminos: ["wolf", "dog"] },
  { clave: "oso", tiene: /oso|osuna/i, terminos: ["bear"] },
  { clave: "araña", tiene: /ara[ñn]a/i, terminos: ["spider"] },
  { clave: "serpiente", tiene: /serpiente|víbora|cobra|naga/i, terminos: ["snake", "serpent"] },
  { clave: "gigante", tiene: /gigante|titán|ogro|trol|ciclope|cíclope|etín|ettin/i, terminos: ["giant", "ogre", "hercules"] },
  { clave: "muerto", tiene: /esqueleto|zombi|momia|liche|espectro|fantasma|sombra|necrófago|tumulario/i, terminos: ["skeleton", "mummy", "ghost"] },
  { clave: "infernal", tiene: /demonio|diablo|diablillo|balor|succubus|súcubo|diabl|demon|infernal/i, terminos: ["demon", "devil", "hell"] },
  { clave: "celestial", tiene: /ángel|celestial|deva|planetar|solar\b/i, terminos: ["angel", "cherub"] },
  { clave: "caballo", tiene: /caballo|corcel|pegaso|unicornio|pesadilla/i, terminos: ["horse", "unicorn", "pegasus"] },
  { clave: "ave", tiene: /águila|aguila|halc[oó]n|b[úu]ho|lechuza|cuervo|grifo|arpía|harpia|roc\b/i, terminos: ["eagle", "owl", "griffin"] },
  { clave: "felino", tiene: /león|leon|tigre|pantera|puma|gato/i, terminos: ["lion", "tiger", "cat"] },
  { clave: "acuático", tiene: /tibur[oó]n|pulpo|kraken|sirena|trit[oó]n|sahuagin|ballena|anguila/i, terminos: ["shark", "octopus", "mermaid"] },
  { clave: "bicho", tiene: /rata|murci[ée]lago|escorpi[oó]n|cangrejo|insecto|escarabajo|abeja|avispa|ciempi[ée]s/i, terminos: ["rat", "bat", "scorpion"] },
  { clave: "saurio", tiene: /lagarto|saurio|basilisco|cocatriz|hidra|kobold|troglodita/i, terminos: ["lizard", "crocodile", "cockatrice"] },
  { clave: "humanoide", tiene: /goblin|orco|osgo|hobgoblin|gnoll|kobold|bandido|guardia|soldado|caballero|cultista|plebeyo|noble|explorador|espía|mat[oó]n|veterano/i, terminos: ["soldier", "knight", "peasant"] },
  { clave: "vegetal", tiene: /planta|árbol|arbol|ent\b|hongo|musgo|espina|raíz|raiz/i, terminos: ["tree", "plant", "mushroom"] },
  { clave: "golem", tiene: /golem|constructo|aut[oó]mata|estatua|armadura animada/i, terminos: ["statue", "armor", "golem"] },

  { clave: "espada", tiene: /espada|sable|estoque|mandoble/i, terminos: ["sword", "sabre"] },
  { clave: "hacha", tiene: /hacha|alabarda|bardiche/i, terminos: ["axe", "halberd"] },
  { clave: "arco", tiene: /arco\b|ballesta|flecha|virote/i, terminos: ["bow", "crossbow", "archer"] },
  { clave: "daga", tiene: /daga|pu[ñn]al|estilete/i, terminos: ["dagger", "knife"] },
  { clave: "maza", tiene: /maza|martillo|lucero|mayal/i, terminos: ["mace", "hammer"] },
  { clave: "lanza", tiene: /lanza|pica|tridente|guada[ñn]a/i, terminos: ["spear", "lance", "trident"] },
  { clave: "armadura", tiene: /armadura|cota|coraza|placas|malla|camisa/i, terminos: ["armor", "armour", "cuirass"] },
  { clave: "escudo", tiene: /escudo|rodela|pav[eé]s/i, terminos: ["shield"] },
  { clave: "yelmo", tiene: /yelmo|casco|celada|almete/i, terminos: ["helmet", "armor"] },
  { clave: "poción", tiene: /poci[oó]n|elixir|ung[üu]ento|veneno/i, terminos: ["potion", "alchemist", "apothecary"] },
  { clave: "anillo", tiene: /anillo|sello|sortija/i, terminos: ["ring", "signet"] },
  { clave: "joya", tiene: /amuleto|collar|colgante|gema|piedra|diamante|rub[íi]|zafiro|perla/i, terminos: ["necklace", "gem", "jewel"] },
  { clave: "bastón", tiene: /bast[oó]n|cayado|vara|varita|Cetro|ceptro/i, terminos: ["staff", "scepter", "wand"] },
  { clave: "capa", tiene: /capa|manto|túnica|tunica|vestidura|traje/i, terminos: ["cloak", "robe", "costume"] },
  { clave: "calzado", tiene: /botas|zapatos|sandalias|guantes|guanteletes|brazales/i, terminos: ["boots", "gloves", "armor"] },
  { clave: "cofre", tiene: /cofre|arc[oó]n|ba[úu]l|bolsa|mochila/i, terminos: ["chest", "bag"] },
  { clave: "llave", tiene: /llave|cerradura|candado/i, terminos: ["key", "lock"] },
  { clave: "libro", tiene: /libro|tomo|grimorio|manual|pergamino|mapa|carta/i, terminos: ["book", "manuscript", "map"] },
  { clave: "luz", tiene: /antorcha|l[aá]mpara|linterna|vela|candil/i, terminos: ["lantern", "candle", "torch"] },
  { clave: "utensilio", tiene: /cuerda|soga|red\b|gancho|pala|pico\b|azada|martillo de guerra/i, terminos: ["rope", "tools"] },
  { clave: "vajilla", tiene: /copa|c[aá]liz|jarra|plato|olla|comida|racion/i, terminos: ["goblet", "feast"] },
  { clave: "corona", tiene: /corona|diadema|trono/i, terminos: ["crown", "throne"] },
  { clave: "espejo", tiene: /espejo|bola de cristal|cristal/i, terminos: ["mirror", "crystal"] },

  { clave: "guerrero", tiene: /bárbaro|barbaro|guerrero|palad[íi]n|soldado/i, terminos: ["knight", "warrior", "soldier"] },
  { clave: "mago", tiene: /mago|hechicero|brujo|arcanista/i, terminos: ["magician", "astrologer", "alchemist"] },
  { clave: "sacerdote", tiene: /cl[ée]rigo|sacerdote|monje|druida/i, terminos: ["priest", "monk"] },
  { clave: "pícaro", tiene: /p[íi]caro|ladr[oó]n|bardo|juglar/i, terminos: ["thief", "musician"] },
  { clave: "enano", tiene: /enano|gnomo/i, terminos: ["dwarf", "gnome"] },
  { clave: "elfo", tiene: /elfo|semielfo|fe[eé]rico|hada|duende/i, terminos: ["elf", "fairy"] },
];

function hash(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function json(url) {
  const fichero = path.join(CACHE, Buffer.from(url).toString("base64url").slice(0, 120) + ".json");
  if (fs.existsSync(fichero)) return JSON.parse(fs.readFileSync(fichero, "utf8"));
  const r = await fetch(url, { headers: { "user-agent": "LaTabernaDeEme/1.0" } });
  if (!r.ok) throw new Error(String(r.status));
  const d = await r.json();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(fichero, JSON.stringify(d));
  await dormir(90);
  return d;
}

async function estampas(termino, cuantas) {
  const salida = [];
  try {
    const s = await json(`https://collectionapi.metmuseum.org/public/collection/v1.1/search?q=${encodeURIComponent(termino)}&hasImages=true`);
    for (const id of (s.objectIDs ?? []).slice(0, 14)) {
      if (salida.length >= cuantas) break;
      let o;
      try {
        o = await json(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
      } catch {
        continue;
      }
      if (!o?.isPublicDomain || !o.primaryImage) continue;
      const texto = `${o.title ?? ""} ${o.objectName ?? ""} ${o.classification ?? ""}`;
      if (!new RegExp(termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(texto)) continue;
      salida.push({
        url: o.primaryImage,
        titulo: o.title,
        autor: o.artistDisplayName || "Anónimo",
        fecha: o.objectDate || "",
        museo: "The Metropolitan Museum of Art",
        enlace: o.objectURL,
      });
    }
  } catch {}
  if (salida.length < cuantas) {
    try {
      const c = await json(`https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(termino)}&cc0=1&has_image=1&limit=6`);
      for (const o of c.data ?? []) {
        if (salida.length >= cuantas) break;
        if (!o.images?.web?.url) continue;
        salida.push({
          url: o.images.web.url,
          titulo: o.title,
          autor: o.creators?.[0]?.description ?? "Anónimo",
          fecha: o.creation_date ?? "",
          museo: "Cleveland Museum of Art",
          enlace: o.url ?? "",
        });
      }
    } catch {}
  }
  return salida;
}

const manifiesto = fs.existsSync(MANIFIESTO) ? JSON.parse(fs.readFileSync(MANIFIESTO, "utf8")) : {};
const pool = new Map();

let nuevos = 0;
for (const concepto of CONCEPTOS) {
  if (nuevos >= limite) break;
  if (pool.has(concepto.clave)) continue;
  const imgs = [];
  for (const termino of concepto.terminos) {
    imgs.push(...(await estampas(termino, 2)));
    if (imgs.length >= 4) break;
  }
  if (!imgs.length) continue;
  pool.set(concepto.clave, imgs);
  console.log(`  ${concepto.clave}: ${imgs.length} estampas`);
}

// Reparto: cada entrada del concepto recibe una distinta, por hash.
const fichas = new Map();
for (const ed of ["5e", "5.5"]) {
  const datos = JSON.parse(fs.readFileSync(path.join(process.cwd(), `dist/datos/${ed}.json`), "utf8"));
  for (const e of datos.entradas) {
    if (manifiesto[`${e.t}/${e.s}`]) continue;
    const concepto = CONCEPTOS.find((c) => c.tiene.test(e.n));
    if (!concepto || !pool.has(concepto.clave)) continue;
    const imgs = pool.get(concepto.clave);
    const elegida = imgs[hash(`${e.t}/${e.s}`) % imgs.length];
    if (!fichas.has(`${e.t}/${e.s}`)) fichas.set(`${e.t}/${e.s}`, elegida);
  }
}

for (const [clave, img] of fichas) {
  if (nuevos >= limite) break;
  const [tipo, slug] = clave.split("/");
  const f960 = path.join(SALIDA, tipo, `${slug}-960.webp`);
  const f480 = path.join(SALIDA, tipo, `${slug}-480.webp`);
  if (fs.existsSync(f960) && fs.existsSync(f480)) {
    manifiesto[clave] = {
      titulo: img.titulo,
      autor: img.autor,
      fecha: img.fecha,
      museo: img.museo,
      url: img.enlace,
      licencia: "Dominio público (CC0)",
    };
    nuevos++;
    continue;
  }
  try {
    const r = await fetch(img.url, { headers: { "user-agent": "LaTabernaDeEme/1.0" } });
    if (!r.ok) continue;
    const buffer = Buffer.from(await r.arrayBuffer());
    const dir = path.join(SALIDA, tipo);
    fs.mkdirSync(dir, { recursive: true });
    for (const ancho of [960, 480]) {
      await sharp(buffer)
        .rotate()
        .resize({ width: ancho, fit: "cover", position: "attention" })
        .grayscale()
        .linear(1.06, -8)
        .webp({ quality: 76 })
        .toFile(path.join(dir, `${slug}-${ancho}.webp`));
    }
    manifiesto[clave] = {
      titulo: img.titulo,
      autor: img.autor,
      fecha: img.fecha,
      museo: img.museo,
      url: img.enlace,
      licencia: "Dominio público (CC0)",
    };
    nuevos++;
    if (nuevos % 20 === 0) {
      fs.writeFileSync(MANIFIESTO, JSON.stringify(manifiesto, null, 2) + "\n");
      console.log(`  ${nuevos} imágenes…`);
    }
  } catch {}
}

fs.writeFileSync(MANIFIESTO, JSON.stringify(manifiesto, null, 2) + "\n");
console.log(`Nuevas: ${nuevos}. Total en el manifiesto: ${Object.keys(manifiesto).length}`);
