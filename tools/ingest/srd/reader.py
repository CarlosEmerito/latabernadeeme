"""Lector del flujo de bloques generado por `pdf_stream.py`."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

SIZES = {"h1": 16.5, "h2": 13.0, "entry": 11.5, "sub": 10.5}


@dataclass
class Block:
    page: int
    col: int
    x: float
    y: float
    size: float
    bold: bool
    text: str

    @property
    def key(self) -> tuple[int, int, float]:
        return (self.page, self.col, self.y)


@dataclass
class Element:
    """Unidad lógica: cabecera de sección, entrada, subcabecera o párrafo."""

    kind: str            # h1 | h2 | entry | sub | para | prop
    text: str
    page: int
    blocks: list[Block] = field(default_factory=list)


WEAVE_RE = re.compile(r"[a-záéíóúñ][A-ZÁÉÍÓÚÑ]")


def is_woven(text: str) -> bool:
    """Detecta texto entrelazado de dos capas superpuestas del PDF."""
    return len(WEAVE_RE.findall(text)) >= 3


def load(path: Path) -> list[Block]:
    blocks: list[Block] = []
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            d = json.loads(line)
            b = Block(**d)
            if is_woven(b.text):
                continue
            blocks.append(b)
    return blocks


def merge_same_row(blocks: list[Block]) -> list[Block]:
    """Une bloques de la misma línea partidos por el maquetador.

    Por ejemplo "Clase de Armadura:" + "17 (armadura natural)".
    """
    out: list[Block] = []
    for b in sorted(blocks, key=lambda b: (b.page, b.col, b.y, b.x)):
        if out:
            prev = out[-1]
            same_row = prev.page == b.page and prev.col == b.col and abs(prev.y - b.y) < 2.0
            if same_row and prev.bold == b.bold and abs(prev.size - b.size) < 0.3:
                prev.text = f"{prev.text} {b.text}"
                continue
        out.append(Block(**b.__dict__))
    return out


def classify(b: Block) -> str:
    if b.size >= SIZES["h1"]:
        return "h1"
    if b.size >= SIZES["h2"]:
        return "h2"
    if b.size >= SIZES["entry"]:
        return "entry"
    if b.size >= SIZES["sub"] and b.bold:
        return "sub"
    return "para"


def to_elements(blocks: list[Block]) -> list[Element]:
    """Convierte bloques en elementos, uniendo líneas de cuerpo en párrafos."""
    rows = merge_same_row(blocks)
    elements: list[Element] = []
    pitch_by_page: dict[tuple[int, int], float] = {}

    for b in rows:
        kind = classify(b)
        if kind == "para":
            prev = elements[-1] if elements else None
            same_col = prev is not None and prev.blocks and prev.blocks[-1].page == b.page and prev.blocks[-1].col == b.col
            pitch = pitch_by_page.setdefault((b.page, b.col), 11.5)
            gap = b.y - prev.blocks[-1].y if same_col else 99
            if same_col and prev.kind in {"para", "prop"} and gap <= pitch * 1.35:
                sep = "" if prev.text.endswith("-") else " "
                prev.text = prev.text.rstrip("-") + sep + b.text if prev.text.endswith("-") else prev.text + sep + b.text
                prev.blocks.append(b)
                continue
            elements.append(Element(kind="para", text=b.text, page=b.page, blocks=[b]))
        else:
            elements.append(Element(kind=kind, text=b.text, page=b.page, blocks=[b]))
    return elements


def find_sections(elements: list[Element]) -> list[tuple[str, int, int]]:
    """Devuelve (título, índice_inicio, índice_fin) de cada h1."""
    marks = [i for i, e in enumerate(elements) if e.kind == "h1"]
    sections = []
    for n, i in enumerate(marks):
        end = marks[n + 1] if n + 1 < len(marks) else len(elements)
        sections.append((elements[i].text, i, end))
    return sections
