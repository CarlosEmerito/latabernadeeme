"""
Saca del SRD 5.1 los siete paquetes de equipo (pág. 71).

En el PDF los paquetes no salen en una tabla como el resto del equipo, sino
en prosa: cada uno es un párrafo con el nombre, el precio entre paréntesis y
la lista de lo que incluye. El extractor de equipo queublished en el repo
(tools/ingest/srd/items.py) solo lee tablas, así que estos siete se perdían.

Este script no los inventa: los saca del texto lineal del SRD
(`.cache/srd/work/es51.txt`), que es la misma fuente que usa `extract_items.py`
para los cuerpos, y escribe una ficha por paquete con el texto literal.

Uso: python3 tools/ingest/paquetes.py [ed51]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from rutas import WORK  # noqa: E402
from write_data import DATA, slug, unique_path, write_entry  # noqa: E402

# El nombre del paquete y su precio: «Paquete de artista (40 po).»
# Sin ancla: el texto lineal pega los siete paquetes seguidos y el corte lo
# marca la cabecera del siguiente.
CABECERA = re.compile(
    r"(Paquete de [a-záéíóúñ ]+?) \((\d+ (?:po|pp|pc))\)\.\s*",
    re.IGNORECASE,
)

# El precio de los siete paquetes de 5.1, para no fiarse del texto.
PRECIOS = {
    "Paquete de artista": "40 po",
    "Paquete de diplomático": "39 po",
    "Paquete de erudito": "40 po",
    "Paquete de explorador": "10 po",
    "Paquete de explorador de mazmorras": "12 po",
    "Paquete de ladrón": "16 po",
    "Paquete de sacerdote": "19 po",
}


def texto_plano() -> str:
    """El texto del SRD 5.1 con las líneas pegadas en párrafos."""
    return (WORK / "es51.txt").read_text(encoding="utf-8", errors="replace")


def bloques() -> list[tuple[str, str, str]]:
    """Los siete paquetes: (nombre, precio, cuerpo)."""
    texto = texto_plano()
    inicio = texto.find("Paquete de artista (40 po)")
    fin = texto.find("Herramientas", inicio)
    if inicio == -1 or fin == -1:
        raise LookupError("no se encuentra el apartado de paquetes de equipo")
    trozo = texto[inicio:fin]

    # En el texto lineal los siete van seguidos por líneas, sin línea en blanco
    # entre ellos: el corte lo marca la cabecera del paquete siguiente.
    plano = " ".join(trozo.split())
    cabeceras = [m for m in CABECERA.finditer(plano)]
    salida: list[tuple[str, str, str]] = []
    for n, m in enumerate(cabeceras):
        nombre = m.group(1).strip()
        precio = m.group(2).strip()
        fin_paquete = cabeceras[n + 1].start() if n + 1 < len(cabeceras) else len(plano)
        cuerpo = plano[m.end() : fin_paquete].strip()
        if nombre not in PRECIOS:
            raise ValueError(f"paquete desconocido: {nombre!r}")
        if PRECIOS[nombre] != precio:
            raise ValueError(f"el precio de {nombre!r} no es {PRECIOS[nombre]}: {precio!r}")
        if not cuerpo:
            raise ValueError(f"el paquete {nombre!r} ha salido sin cuerpo")
        salida.append((nombre, precio, cuerpo))
    return salida


def main() -> int:
    encontrados = bloques()
    if len(encontrados) != len(PRECIOS):
        print(f"se esperaban {len(PRECIOS)} paquetes y han salido {len(encontrados)}")
        return 1

    carpeta = DATA / "ed51" / "equipo"
    carpeta.mkdir(parents=True, exist_ok=True)
    tomados: set[str] = set()
    for nombre, precio, cuerpo in encontrados:
        ruta = unique_path(carpeta, slug(nombre), tomados)
        frente = {
            "name": nombre,
            "category": "Equipo de aventurero",
            "price": precio,
            "weight": "",
            "srd": "5.1",
            "page": 71,
        }
        write_entry(ruta, frente, cuerpo)
        print(f"  {nombre} ({precio}) -> {ruta.name}")
    print(f"{len(encontrados)} paquetes de equipo del 5.1 -> {carpeta}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
