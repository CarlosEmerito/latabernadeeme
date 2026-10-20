"""Extrae un apéndice a dos columnas del SRD y lo convierte en una entrada de reglas.

`pdftotext -layout` deja las dos columnas una al lado de otra; aquí se separan por
la posición donde empieza la columna derecha, se unen las líneas en párrafos y se
conservan los títulos cortos como encabezados.

Uso:
  .venv-ingest/bin/python tools/ingest/extraer_apendice.py planos 394 396 --dry-run
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
PDF = RAIZ / ".cache/srd/srd-5.1-es.pdf"


def lineas_pagina(desde: int, hasta: int) -> list[str]:
    salida = subprocess.run(
        ["pdftotext", "-layout", "-f", str(desde), "-l", str(hasta), str(PDF), "-"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return salida.split("\n")


def columna(lineas: list[str], corte: int, lado: str) -> list[str]:
    out = []
    for linea in lineas:
        if "Prohibida la reventa" in linea or "Documento de referencia del sistema" in linea:
            continue
        if linea.strip().startswith("Apéndice"):
            continue
        if "\f" in linea:
            continue
        texto = linea[:corte] if lado == "izq" else linea[corte:]
        out.append(texto.rstrip())
    return out


def parrafos(lineas: list[str]) -> list[str]:
    bloques: list[list[str]] = [[]]
    for linea in lineas:
        if not linea.strip():
            if bloques[-1]:
                bloques.append([])
            continue
        bloques[-1].append(linea.strip())
    return [" ".join(b) for b in bloques if b]


def a_markdown(bloques: list[str]) -> str:
    # Une títulos partidos por el salto de línea («Los planos de» + «existencia»).
    unidos: list[str] = []
    for b in bloques:
        es_titulo = len(b) < 60 and not b.endswith(".") and not b.endswith(":")
        if unidos and es_titulo and len(unidos[-1]) < 60 and not unidos[-1].endswith("."):
            unidos[-1] = f"{unidos[-1]} {b}"
        else:
            unidos.append(b)
    salida = []
    for b in unidos:
        # Un título es corto, no acaba en punto y no lleva dos puntos.
        if len(b) < 60 and not b.endswith(".") and b.count(". ") == 0 and not b.endswith(":"):
            salida.append(f"## {b}")
        else:
            salida.append(b)
    return "\n\n".join(salida)


def main() -> int:
    nombre = sys.argv[1]
    desde, hasta = int(sys.argv[2]), int(sys.argv[3])
    lineas = lineas_pagina(desde, hasta)
    corte = 56

    izq = parrafos(columna(lineas, corte, "izq"))
    der = parrafos(columna(lineas, corte, "der"))
    cuerpo = a_markdown(izq + der)
    print(cuerpo[:1500])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
