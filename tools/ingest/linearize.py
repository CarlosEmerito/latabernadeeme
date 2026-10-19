#!/usr/bin/env python3
"""Linealiza un PDF de dos columnas respetando el orden de lectura.

Uso:
    python3 linearize.py entrada.pdf salida.txt

Genera primero el XML con `pdftotext -bbox-layout` y reconstruye el texto
columna a columna: detecta el canal entre columnas, ordena las líneas por
coordenada vertical y separa párrafos por el hueco vertical entre líneas
(el PDF no trae marcas de párrafo, solo interlineado).

El objetivo no es una transcripción tipográfica fiel, sino un flujo estable
sobre el que detectar cabeceras de entrada (conjuros, monstruos, objetos) y
párrafos limpios.
"""
from __future__ import annotations

import statistics
import subprocess
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

NS = "{http://www.w3.org/1999/xhtml}"
GUTTER = 306.0          # frontera entre columnas (páginas de 612 pt de ancho)
FOOTER_TOP = 706.0      # por debajo de esto es pie de página

FOOTER_RE = (
    "Prohibida la reventa",
    "Tienes permiso para imprimir",
    "o fotocopiar este documento",
    "Documento de referencia del sistema",
)


@dataclass
class Line:
    x0: float
    y0: float
    x1: float
    y1: float
    text: str

    @property
    def col(self) -> int:
        if self.x1 <= GUTTER + 4:
            return 0
        if self.x0 >= GUTTER - 4:
            return 1
        return 2


def lines_from_xml(xml_path: Path) -> list[list[Line]]:
    tree = ET.parse(xml_path)
    pages: list[list[Line]] = []
    for page in tree.iter(f"{NS}page"):
        lines: list[Line] = []
        for line in page.iter(f"{NS}line"):
            text = words_to_text(line)
            if not text:
                continue
            lines.append(
                Line(
                    float(line.get("xMin", 0)),
                    float(line.get("yMin", 0)),
                    float(line.get("xMax", 0)),
                    float(line.get("yMax", 0)),
                    text,
                )
            )
        pages.append(lines)
    return pages


def words_to_text(line: ET.Element) -> str:
    """Une las palabras de una línea respetando el kerning.

    Poppler separa en palabras sueltas fragmentos como "F ue" cuando el
    tipografiado usa tracking; si el hueco entre dos cajas es mínimo hay que
    unirlas sin espacio.
    """
    out = ""
    prev_x1: float | None = None
    for w in line.iter(f"{NS}word"):
        text = (w.text or "").strip()
        if not text:
            continue
        x0 = float(w.get("xMin", 0))
        if not out:
            out = text
        elif prev_x1 is not None and x0 - prev_x1 < 1.2:
            out += text
        else:
            out += " " + text
        prev_x1 = float(w.get("xMax", 0))
    return out.strip()


def join_lines(lines: list[Line]) -> str:
    """Une líneas en párrafos.

    El PDF no marca los párrafos: usa sangría de primera línea y un poco de
    espacio extra antes de las cabeceras. Se detectan ambos casos.
    """
    if not lines:
        return ""
    lines.sort(key=lambda l: (l.y0, l.x0))
    starts = [l.y0 for l in lines]
    pitches = [b - a for a, b in zip(starts, starts[1:]) if 0 < b - a < 30]
    pitch = statistics.median(pitches) if pitches else 11.5
    base_x = min(l.x0 for l in lines)

    paragraphs: list[str] = []
    current: list[str] = []
    for i, line in enumerate(lines):
        if current:
            prev = lines[i - 1]
            new_para = (line.y0 - prev.y0) > pitch * 1.35 or (line.x0 - base_x) > 5.0
            if new_para:
                paragraphs.append(" ".join(current))
                current = []
            elif current[-1].endswith("-"):
                # Partición de palabra al final de línea: "puntuacio- nes".
                current[-1] = current[-1][:-1] + line.text
                continue
        current.append(line.text)
    if current:
        paragraphs.append(" ".join(current))
    return "\n\n".join(paragraphs)


def clean_line(s: str) -> str:
    return " ".join(s.replace("\u00ad", "").split())


def is_footer(text: str) -> bool:
    return any(text.startswith(p) for p in FOOTER_RE)


def linearize_page(lines: list[Line]) -> str:
    body = [l for l in lines if l.y0 < FOOTER_TOP and not is_footer(l.text)]
    left = [l for l in body if l.col == 0]
    right = [l for l in body if l.col == 1]
    wide = [l for l in body if l.col == 2]

    parts = [join_lines(left), join_lines(right)]
    if wide:
        # Tablas o títulos a ancho completo: se colocan al final de la página
        # para no partir el flujo de las dos columnas.
        parts.append(join_lines(wide))
    return "\n\n".join(p for p in parts if p)


def dehyphenate(text: str) -> str:
    text = text.replace("\u00ad", "")
    return text


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    pdf = Path(sys.argv[1]).expanduser().resolve()
    out = Path(sys.argv[2]).expanduser().resolve()
    xml = out.with_suffix(".bbox.xml")
    subprocess.run(["pdftotext", "-bbox-layout", str(pdf), str(xml)], check=True)

    pages = lines_from_xml(xml)
    chunks: list[str] = []
    for i, lines in enumerate(pages, start=1):
        chunks.append(f"\n\n=== PÁGINA {i} ===\n")
        chunks.append(linearize_page(lines))
    text = "\n".join(chunks)
    text = dehyphenate(text)
    text = "\n".join(clean_line(l) if l.strip() else "" for l in text.split("\n"))
    out.write_text(text, encoding="utf-8")
    print(f"{len(pages)} páginas -> {out} ({len(text):,} caracteres)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
