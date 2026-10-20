/**
 * Genera un sigilo SVG determinista por entrada.
 *
 * La forma sale del hash del identificador, así que la misma ficha tiene siempre
 * el mismo dibujo, y el color depende de la sección. Sirve de imagen cuando no
 * hay grabado: ninguna ficha queda vacía y no hay licencia de terceros de por
 * medio.
 *
 * Uso: node tools/imagenes/sigilos.mjs
 */
import fs from "node:fs";
import path from "node:path";

const DESTINO = path.join(process.cwd(), "public/img/sigilos");

const COLOR = {
  conjuros: "#4a5fa8",
  monstruos: "#a83a32",
  objetos: "#8a6a20",
  equipo: "#6a6450",
  clases: "#3a7a52",
  especies: "#7a56a0",
  trasfondos: "#2a7a88",
  dotes: "#a05a2a",
  reglas: "#55607e",
};

function hash(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function azar(semilla) {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sigilo(tipo, slug) {
  const h = hash(`${tipo}/${slug}`);
  const r = azar(h);
  const color = COLOR[tipo] ?? "#55607e";

  const lados = 5 + Math.floor(r() * 4); // 5 a 8
  const giro = r() * Math.PI * 2;
  const radio = 62 + r() * 10;
  const puntos = Array.from({ length: lados }, (_, i) => {
    const ang = giro + (i * Math.PI * 2) / lados;
    const rr = radio * (0.82 + r() * 0.18);
    return [100 + Math.cos(ang) * rr, 100 + Math.sin(ang) * rr];
  });

  const poligono = puntos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const cuerdas = Array.from({ length: 2 + Math.floor(r() * 2) }, () => {
    const a = Math.floor(r() * lados);
    let b = Math.floor(r() * lados);
    if (b === a) b = (a + 1) % lados;
    const [x1, y1] = puntos[a];
    const [x2, y2] = puntos[b];
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`;
  }).join("");

  const marcas = puntos
    .map(([x, y], i) => (i % 2 === 0 ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${color}" stroke="none" />` : ""))
    .join("");

  const interior = 10 + r() * 8;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img">
  <g fill="none" stroke="${color}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" opacity="0.92">
    <circle cx="100" cy="100" r="86" stroke-width="2.2" />
    <circle cx="100" cy="100" r="80" opacity="0.45" />
    <polygon points="${poligono}" />
    ${cuerdas}
    <circle cx="100" cy="100" r="${interior.toFixed(1)}" />
  </g>
  ${marcas}
</svg>`;
}

const tipos = fs.readdirSync(path.join(process.cwd(), "data/ed52"));
let total = 0;

for (const tipo of tipos) {
  const slugs = new Set();
  for (const ed of ["ed51", "ed52"]) {
    const dir = path.join(process.cwd(), "data", ed, tipo);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith(".md")) slugs.add(f.replace(/\.md$/, ""));
  }
  const salida = path.join(DESTINO, tipo);
  fs.mkdirSync(salida, { recursive: true });
  for (const slug of slugs) {
    fs.writeFileSync(path.join(salida, `${slug}.svg`), sigilo(tipo, slug));
    total++;
  }
}

console.log(`Sigilos generados: ${total} en ${DESTINO}`);
