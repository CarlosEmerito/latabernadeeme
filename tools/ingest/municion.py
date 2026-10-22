"""
Saca del SRD 5.2 la tabla de munición (pág. 106) a `data/ed52/equipo/*.md`.

La tabla del 5.2 no está en el catálogo porque su extractor solo leía el
capítulo de equipo del 5.1: el 5.2 tiene la tabla de munición en su propia
página y se perdía entera. Las cinco filas vienen del mismo formato que el
resto del equipo —«Tipo Cantidad Recipiente Peso Precio»— y aquí se leen de
las coordenadas del PDF (`.cache/srd/work/e52.jsonl`), que es la fuente que
usa el resto de la ingesta.

Los nombres vienen partidos en dos líneas («Balas de» / «arma de» / «fuego»),
así que se unen por el mismo criterio que usa el resto del parser: una
continuación que empieza por minúscula y va en la columna del nombre.

Uso: python3 tools/ingest/municion.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from rutas import WORK  # noqa: E402
from write_data import DATA, slug, unique_path, write_entry  # noqa: E402

PAGINA = 106
# La cabecera de la tabla: «Tipo Cantidad Recipiente Peso Precio».
CABECERA = re.compile(r"^Tipo\s+Cantidad\s+Recipiente\s+Peso\s+Precio$")
# «Balas de 10 Bolsa 1 kg 3 po» — el nombre y la cantidad, el resto de columnas.
FILA = re.compile(
    r"^(?P<tipo>.+?)\s+(?P<cantidad>\d+)\s+(?P<recipiente>[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s+"
    r"(?P<peso>[\d,]+(?:,\d+)? (?:kg|g|l))\s+(?P<precio>\d+ (?:po|pp|pc))$"
)


def filas() -> list[tuple[str, str, str, str]]:
    """Las cinco municiones: (nombre, precio, peso, recipiente)."""
    lineas = []
    with (WORK / "e52.jsonl").open(encoding="utf-8") as f:
        for linea in f:
            d = json.loads(linea)
            if d.get("page") == PAGINA and d.get("col") == 1:
                lineas.append(d)
    lineas.sort(key=lambda d: d["y"])

    # La tabla empieza en la cabecera y acaba en la siguiente entrada.
    inicio = next(n for n, d in enumerate(lineas) if CABECERA.match(d["text"].strip()))
    fin = next(
        n
        for n, d in enumerate(lineas)
        if n > inicio and d["text"].strip().startswith("Olla de hierro")
    )
    tabla = lineas[inicio + 1 : fin]

    salida: list[tuple[str, str, str, str]] = []
    actual: list[str] = []
    for d in tabla:
        texto = d["text"].strip()
        if not texto:
            continue
        m = FILA.match(texto)
        if m:
            if actual:
                salida.append(_fila(actual))
                actual = []
            actual = [texto]
        elif actual and texto[:1].islower():
            # Continuación del nombre: «Balas de» + «arma de» + «fuego».
            actual.append(texto)
        elif actual:
            salida.append(_fila(actual))
            actual = []
    if actual:
        salida.append(_fila(actual))
    return salida


def _fila(partes: list[str]) -> tuple[str, str, str, str]:
    """Une las partes de una fila y saca (nombre, precio, peso, recipiente).

    La primera parte trae el nombre y la cantidad pegados, y las
    continuaciones van en medio: «Balas de 10» + «arma de» + «fuego» es
    «Balas de arma de fuego (10)». La cantidad se reconoce porque es el único
    número suelto de la fila.
    """
    m = FILA.match(partes[0])
    if not m:
        raise ValueError(f"no se entiende la fila: {' '.join(partes)!r}")
    tipo = m.group("tipo")
    cantidad = m.group("cantidad")
    # Las continuaciones se pegan al nombre: «Balas de» + «arma de» + «fuego».
    for parte in partes[1:]:
        tipo = f"{tipo} {parte}".strip()
    return f"{tipo} ({cantidad})", m.group("precio"), m.group("peso"), m.group("recipiente")


def main() -> int:
    encontradas = filas()
    if len(encontradas) != 5:
        print(f"se esperaban 5 municiones y han salido {len(encontradas)}")
        return 1

    carpeta = DATA / "ed52" / "equipo"
    carpeta.mkdir(parents=True, exist_ok=True)
    tomados: set[str] = set()
    for nombre, precio, peso, _ in encontradas:
        ruta = unique_path(carpeta, slug(nombre), tomados)
        frente = {
            "name": nombre,
            "category": "Equipo de aventurero",
            "price": precio,
            "weight": peso,
            "srd": "5.2",
            "page": PAGINA,
        }
        write_entry(ruta, frente, "")
        print(f"  {nombre} ({precio}, {peso}) -> {ruta.name}")
    print(f"{len(encontradas)} municiones del 5.2 -> {carpeta}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
