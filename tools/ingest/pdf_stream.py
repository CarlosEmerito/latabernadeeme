#!/usr/bin/env python3
"""Convierte un PDF de dos columnas en un flujo de bloques de texto (JSONL).

Uso:
    python3 pdf_stream.py entrada.pdf salida.jsonl

Se apoya en `pdftotext -bbox-layout` (poppler), que descarta las capas de texto
ocultas bajo otras cajas —un problema real en las ediciones en español, donde
aparecen frases alternativas superpuestas—. De cada palabra se conservan las
coordenadas y la altura de caja, que sirve como proxy del tamaño de fuente
para distinguir títulos, cabeceras de entrada y cuerpo.

Salida, una línea por bloque:

    {"page": 12, "col": 0, "x": 57.6, "y": 210.4, "size": 9.5,
     "bold": false, "text": "..."}
"""
from __future__ import annotations

import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

NS = "{http://www.w3.org/1999/xhtml}"
GUTTER = 306.0
FOOTER_TOP = 736.0


def run_pdftotext(pdf: Path, xml: Path) -> None:
    subprocess.run(["pdftotext", "-bbox-layout", str(pdf), str(xml)], check=True)


def lines_from_xml(xml: Path) -> list[list[dict]]:
    tree = ET.parse(xml)
    pages: list[list[dict]] = []
    for page in tree.iter(f"{NS}page"):
        words: list[dict] = []
        for nb, block in enumerate(page.iter(f"{NS}block")):
            for w in block.iter(f"{NS}word"):
                text = (w.text or "").strip()
                if not text:
                    continue
                x0, x1 = float(w.get("xMin", 0)), float(w.get("xMax", 0))
                y0, y1 = float(w.get("yMin", 0)), float(w.get("yMax", 0))
                col = 0 if x1 <= GUTTER + 4 else (1 if x0 >= GUTTER - 4 else 2)
                words.append(
                    {"x0": x0, "x1": x1, "y0": y0, "y1": y1, "h": y1 - y0, "col": col, "t": text, "b": nb}
                )

        buckets: dict[tuple[int, int], list[dict]] = defaultdict(list)
        for w in words:
            buckets[(w["col"], round(w["y0"] / 3.0))].append(w)  # 3 pt: une las cursivas alineadas con su línea

        lines: list[dict] = []
        for (col, _row), items in buckets.items():
            items.sort(key=lambda w: w["x0"])
            text = ""
            prev_x1 = None
            for w in items:
                if not text:
                    text = w["t"]
                elif prev_x1 is not None and w["x0"] - prev_x1 < 1.2:
                    text += w["t"]
                else:
                    text += " " + w["t"]
                prev_x1 = w["x1"]
            if not text.strip():
                continue
            lines.append(
                {
                    "page": page.get("page") if "page" in page.attrib else None,
                    "col": col,
                    "x": round(min(w["x0"] for w in items), 1),
                    "y": round(min(w["y0"] for w in items), 1),
                    "size": round(sorted(w["h"] for w in items)[len(items) // 2], 1),
                    "bold": False,
                    "block": items[0].get("b", -1),
                    "text": text.strip(),
                }
            )
        lines.sort(key=lambda l: (l["col"], l["y"], l["x"]))
        pages.append(lines)
    return pages


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    src = Path(sys.argv[1]).expanduser().resolve()
    out = Path(sys.argv[2]).expanduser().resolve()
    xml = out.with_suffix(".bbox.xml")
    run_pdftotext(src, xml)
    pages = lines_from_xml(xml)

    with out.open("w", encoding="utf-8") as fh:
        for n, lines in enumerate(pages, start=1):
            for line in lines:
                line["page"] = n
                if line["y"] < FOOTER_TOP:
                    fh.write(json.dumps(line, ensure_ascii=False) + "\n")
    print(f"{out}: {out.stat().st_size:,} bytes, {len(pages)} páginas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
