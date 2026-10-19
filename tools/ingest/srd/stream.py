"""Utilidades sobre el flujo de líneas del SRD."""
from __future__ import annotations

import json
import re
import statistics
from dataclasses import dataclass
from pathlib import Path

SCHOOLS = (
    "Abjuración",
    "Adivinación",
    "Conjuración",
    "Encantamiento",
    "Evocación",
    "Ilusionismo",
    "Nigromancia",
    "Necromancia",
    "Transmutación",
)

SCHOOL_RE = re.compile(
    r"^(?P<school>" + "|".join(SCHOOLS) + r")\s+(?P<level>nivel \d+|\(truco\))(?P<ritual>\s*\(ritual\))?$"
)

PROP_LABELS = ("Tiempo de lanzamiento:", "Alcance:", "Componentes:", "Duración:", "Objetivo:", "Área:")


@dataclass
class Line:
    page: int
    col: int
    x: float
    y: float
    size: float
    text: str
    block: int = -1


def load(path: Path) -> list[Line]:
    out: list[Line] = []
    with path.open(encoding="utf-8") as fh:
        for raw in fh:
            d = json.loads(raw)
            text = (
                d["text"]
                .replace("\u00a0", " ")
                .replace("\u2009", " ")
                .replace("\u202f", " ")
                .replace("\u2011", "-")
                .replace("\u00ad", "")
            )
            out.append(Line(d["page"], d["col"], d["x"], d["y"], d["size"], " ".join(text.split()), int(d.get("block", -1))))
    return out


def page_pitch(lines: list[Line]) -> float:
    deltas = []
    for a, b in zip(lines, lines[1:]):
        if a.page == b.page and a.col == b.col:
            d = b.y - a.y
            if 0 < d < 30:
                deltas.append(d)
    return statistics.median(deltas) if deltas else 11.7


def paragraphs(lines: list[Line]) -> list[str]:
    """Une líneas consecutivas en párrafos."""
    if not lines:
        return []
    pitch = page_pitch(lines)
    out: list[str] = []
    cur: list[str] = []
    prev: Line | None = None
    for ln in lines:
        if prev is not None:
            same_col = (ln.page, ln.col) == (prev.page, prev.col)
            gap = ln.y - prev.y if same_col else 999
            indented = same_col and (ln.x - prev.x) > 5 and gap > pitch * 0.9
            otro_bloque = same_col and ln.block >= 0 and prev.block >= 0 and ln.block != prev.block
            if not same_col or gap > pitch * 1.45 or indented or otro_bloque:
                out.append(_join(cur))
                cur = []
        cur.append(ln.text)
        prev = ln
    if cur:
        out.append(_join(cur))
    return [p for p in out if p]


def _join(parts: list[str]) -> str:
    text = ""
    for p in parts:
        if not text:
            text = p
        elif text.endswith("-"):
            text = text[:-1] + p
        else:
            text += " " + p
    return text.strip()


def find_index(lines: list[Line], title: str, start: int = 0) -> int:
    for i in range(start, len(lines)):
        if lines[i].text.strip() == title:
            return i
    raise LookupError(title)


def slice_between(lines: list[Line], start_title: str, end_titles: tuple[str, ...] | str) -> list[Line]:
    if isinstance(end_titles, str):
        end_titles = (end_titles,)
    start = find_index(lines, start_title)
    end = len(lines)
    for t in end_titles:
        try:
            end = min(end, find_index(lines, t, start + 1))
        except LookupError:
            continue
    return lines[start:end]
