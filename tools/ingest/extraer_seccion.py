"""Extrae una sección del SRD respetando columnas y convierte los títulos.

A diferencia de `pdftotext -layout`, aquí se trabaja con las líneas del pipeline
(página, columna, x, y, tamaño), así que el orden de lectura es el real: primero
la columna izquierda de cada página y luego la derecha, sin mezclar.

Los párrafos se agrupan por cercanía vertical y bloque; las líneas grandes
(tamaño de titular) se convierten en encabezados y las que continúan un titular
partido en dos líneas se unen a él.

Uso:
  .venv-ingest/bin/python tools/ingest/extraer_seccion.py \
      --ed ed51 --desde "Los planos de" --hasta "Apéndice MM-A:" --dry-run
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingest.srd import stream

PIE = ("Prohibida la reventa", "Documento de referencia del sistema")


def arg(nombre: str, defecto: str | None = None) -> str:
    return sys.argv[sys.argv.index(nombre) + 1] if nombre in sys.argv else defecto  # type: ignore[return-value]


def es_titular(linea: stream.Line) -> bool:
    return linea.size >= 15.0 and len(linea.text) < 80


def bloques(lineas: list[stream.Line]) -> list[tuple[bool, str]]:
    """Devuelve [(es_titular, texto)] agrupando líneas en párrafos."""
    salida: list[tuple[bool, str]] = []
    actual: list[stream.Line] = []

    def cerrar():
        if not actual:
            return
        texto = " ".join(l.text.strip() for l in actual)
        texto = re.sub(r"\s+", " ", texto).strip()
        titulo = all(es_titular(l) for l in actual) and len(texto) < 90
        if salida and titulo and salida[-1][0] and len(salida[-1][1]) < 60:
            salida[-1] = (True, f"{salida[-1][1]} {texto}")
        else:
            salida.append((titulo, texto))
        actual.clear()

    for linea in lineas:
        if any(p in linea.text for p in PIE):
            cerrar()
            continue
        if not linea.text.strip():
            cerrar()
            continue
        if not actual:
            actual.append(linea)
            continue
        prev = actual[-1]
        misma_col = (linea.page, linea.col) == (prev.page, prev.col)
        salto = (linea.y - prev.y) if misma_col else 999
        if not misma_col or salto > 22 or es_titular(linea) != es_titular(prev):
            cerrar()
        actual.append(linea)
    cerrar()
    return salida


def main() -> int:
    ed = arg("--ed", "ed51")
    desde = arg("--desde")
    hasta = arg("--hasta")
    fichero = "e51.jsonl" if ed == "ed51" else "e52.jsonl"

    lineas = stream.load(Path(f".cache/srd/work/{fichero}"))
    i = next(k for k, l in enumerate(lineas) if l.text.strip().startswith(desde))
    j = next(k for k, l in enumerate(lineas[i:], start=i) if l.text.strip().startswith(hasta))

    partes = []
    for titulo, texto in bloques(lineas[i:j]):
        partes.append(f"## {texto}" if titulo else texto)
    cuerpo = "\n\n".join(partes)
    print(cuerpo[:1600])
    print(f"\n--- {len(partes)} bloques, {len(cuerpo)} caracteres")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
