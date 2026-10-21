/**
 * Copia los iconos de game-icons.net que usa la interfaz y su atribución.
 *
 * Fuente: https://github.com/game-icons/icons (CC BY 3.0, autor por carpeta).
 * El repositorio se descarga una vez en `.cache/game-icons`; después solo se
 * copian los que hacen falta, con nombres semánticos.
 *
 * Uso: node tools/imagenes/iconos.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const CACHE = path.join(process.cwd(), ".cache/game-icons");
const DESTINO = path.join(process.cwd(), "src/assets/iconos");

const MAPA = {
  "seccion-conjuros": "spell-book.svg",
  "seccion-monstruos": "dragon-head.svg",
  "seccion-objetos": "gems.svg",
  "seccion-equipo": "sword-hilt.svg",
  "seccion-clases": "knight-banner.svg",
  "seccion-especies": "elf-ear.svg",
  "seccion-trasfondos": "scroll-unfurled.svg",
  "seccion-dotes": "star-swirl.svg",
  "seccion-reglas": "book-cover.svg",
  "seccion-mesa": "big-gear.svg",

  "escuela-evocacion": "fire.svg",
  "escuela-abjuracion": "shield.svg",
  "escuela-adivinacion": "third-eye.svg",
  "escuela-encantamiento": "crowned-heart.svg",
  "escuela-ilusionismo": "tribal-mask.svg",
  "escuela-nigromancia": "death-skull.svg",
  "escuela-transmutacion": "frog.svg",
  "escuela-conjuracion": "magic-portal.svg",

  "tipo-aberracion": "one-eyed.svg",
  "tipo-bestia": "paw.svg",
  "tipo-celestial": "angel-wings.svg",
  "tipo-constructo": "gear-hammer.svg",
  "tipo-dragon": "dragon-breath.svg",
  "tipo-elemental": "wildfires.svg",
  "tipo-feerico": "fairy.svg",
  "tipo-infernal": "evil-wings.svg",
  "tipo-gigante": "giant.svg",
  "tipo-humanoide": "person.svg",
  "tipo-monstruosidad": "tentacles-skull.svg",
  "tipo-muerto-viviente": "shambling-zombie.svg",
  "tipo-cieno": "slime.svg",
  "tipo-planta": "carnivorous-plant.svg",
  // Dos tipos del bestiario que se quedaron sin icono: el autómata es un objeto
  // animado y el enjambre un grupo de criaturas diminutas. A 20 px se leen como
  // un golem mecánico y un montón de hormigas, y ninguno se confunde con la
  // tuerca del constructo ni con la zarpa de la bestia.
  "tipo-automata": "robot-golem.svg",
  "tipo-enjambre": "ants.svg",
};

function descargar() {
  if (fs.existsSync(CACHE)) return;
  fs.mkdirSync(CACHE, { recursive: true });
  const tgz = path.join(CACHE, "icons.tar.gz");
  execFileSync("curl", [
    "-sL",
    "https://github.com/game-icons/icons/archive/refs/heads/master.tar.gz",
    "-o",
    tgz,
  ]);
  execFileSync("tar", ["xzf", tgz, "-C", CACHE, "--strip-components=1"]);
  fs.rmSync(tgz, { force: true });
}

function buscar(nombre) {
  const pila = [CACHE];
  while (pila.length) {
    const dir = pila.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === ".git") continue;
        pila.push(ruta);
      } else if (e.name === nombre) {
        return ruta;
      }
    }
  }
  return null;
}

descargar();
fs.mkdirSync(DESTINO, { recursive: true });

const creditos = [];
let copiados = 0;

for (const [clave, fichero] of Object.entries(MAPA)) {
  const origen = buscar(fichero);
  if (!origen) {
    console.warn(`  ✗ no encontrado: ${fichero}`);
    continue;
  }
  const autor = path.relative(CACHE, origen).split(path.sep)[0];
  fs.copyFileSync(origen, path.join(DESTINO, `${clave}.svg`));
  creditos.push(`${clave}.svg — ${autor} — game-icons.net — CC BY 3.0`);
  copiados++;
}

fs.writeFileSync(path.join(DESTINO, "CREDITOS.txt"), creditos.join("\n") + "\n");
console.log(`Iconos copiados: ${copiados}/${Object.keys(MAPA).length}`);
