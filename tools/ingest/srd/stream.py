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


# El maquetador del PDF corta la palabra con un guion al final de la línea. Una
# línea que acaba así continúa en la siguiente aunque el hueco, la sangría o el
# bloque digan otra cosa: es el único caso en que dos trozos se pegan sin
# espacio. Si no se respeta, la palabra se queda partida y el trozo cae en otro
# párrafo («…no requiere componentes ma-» y la línea siguiente se pierde al no
# tener forma de rasgo, «…tiene el es-» + «tado de derribado», T-0231).
CORTE_RE = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]-\s*$")

# El PDF dibuja las cursivas, las negritas y el trozo de una palabra partida por
# el guion como bloques aparte que quedan 1-2 pt por encima o por debajo de la
# línea base. Ordenar solo por `y` deja esos trozos delante de la línea a la que
# pertenecen («…de nivel 1 de» / «he-» / «la lista…»), así que las filas se
# ordenan por `x` dentro de la misma línea visual. No se unen en una sola Line:
# los parsers de tablas necesitan las coordenadas de cada celda.
TOLERANCIA_FILA = 2.6


def corta_palabra(text: str) -> bool:
    """¿La línea acaba partiendo una palabra con el guion del maquetador?"""
    return bool(CORTE_RE.search(text))


def order_rows(lines: list[Line]) -> list[Line]:
    """Ordena por `x` los trozos de una fila cuando uno de ellos es un corte.

    Solo se reordena la fila si algún trozo acaba en el guion del maquetador:
    entonces los pedazos de la palabra partida están a distinta `y` y hay que
    ponerlos en su sitio por `x`. Fuera de ese caso el orden del flujo se
    respeta tal cual, porque en el 5.1 las cursivas van intercaladas y
    reordenarlas mezcla las frases.
    """
    out: list[Line] = []
    fila: list[Line] = []

    def volcar() -> None:
        cortada = any(corta_palabra(l.text) for l in fila)
        out.extend(sorted(fila, key=lambda l: l.x) if cortada else fila)
        fila.clear()

    for ln in lines:
        if fila and (ln.page, ln.col) == (fila[0].page, fila[0].col) and abs(ln.y - fila[0].y) <= TOLERANCIA_FILA:
            fila.append(ln)
        else:
            volcar()
            fila.append(ln)
    volcar()
    return out


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
    return order_rows(out)


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
            # Una palabra partida sigue en la línea siguiente aunque cambie la
            # columna o la página (los cortes del maquetador caen al pie de la
            # columna); el trozo siempre empieza en minúscula.
            sigue_palabra = corta_palabra(prev.text) and ln.text[:1].islower()
            if (not same_col or gap > pitch * 1.45 or indented or otro_bloque) and not sigue_palabra:
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
