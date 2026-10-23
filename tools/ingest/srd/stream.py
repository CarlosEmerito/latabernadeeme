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
    # `y` de la última línea que se ha fundido en esta. Una línea unida de dos
    # renglones ocupa hasta aquí, así que el hueco con la siguiente se mide
    # desde `end_y` y no desde `y`: si no, el párrafo parece un salto de dos
    # renglones por los dos lados y `paragraphs()` lo corta (T-0241).
    end_y: float | None = None

    @property
    def fin(self) -> float:
        """`y` de la última línea que representa esta."""
        return self.y if self.end_y is None else self.end_y



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

# Cierre de frase. Una línea que no acaba así y a la que sigue otra en
# minúscula es la misma frase partida, no dos párrafos.
CIERRE_RE = re.compile(r"[.!?»\"'”]\s*$")


def corta_palabra(text: str) -> bool:
    """¿La línea acaba partiendo una palabra con el guion del maquetador?"""
    return bool(CORTE_RE.search(text))


# El PDF pone el exponente de una unidad en un trozo suelto de la misma fila y
# con la letra más pequeña: «…hasta 0,03 m» + «3» es «0,03 m³», y publicado tal
# cual la ficha acaba en «…durante 1 hora. 3» (T-0241). El tamaño es lo que
# distingue el exponente de un número normal de la línea.
SUPERINDICE = {"1": "¹", "2": "²", "3": "³"}


# La medida a la que pertenece el exponente: «0,03 m» de «0,03 m³».
MEDIDA_RE = re.compile(r"\d+(?:[.,]\d+)?\s*m\b")


def _pega_superindices(fila: list[Line]) -> list[Line]:
    """Pega a su medida el exponente que el maquetador deja suelto."""
    out: list[Line] = []
    for ln in fila:
        trozo = ln.text.strip()
        if out and len(trozo) == 1 and trozo.isdigit() and out[-1].size >= ln.size + 5:
            prev = out[-1]
            marca = None
            for marca in MEDIDA_RE.finditer(prev.text):
                pass
            texto = prev.text
            if marca is not None:
                texto = texto[: marca.end()] + SUPERINDICE.get(trozo, trozo) + texto[marca.end() :]
            else:
                texto = texto.rstrip() + SUPERINDICE.get(trozo, trozo)
            out[-1] = Line(
                prev.page,
                prev.col,
                prev.x,
                prev.y,
                prev.size,
                texto,
                prev.block,
                end_y=max(prev.fin, ln.y),
            )
            continue
        out.append(ln)
    return out


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
        fila[:] = _pega_superindices(fila)
        cortada = any(corta_palabra(l.text) for l in fila)
        # Un trozo suelto de la misma línea visual puede venir detrás con la `x`
        # de la izquierda («Rudnogg”.» a 202 y «cian sus labios…» a 58, T-0241):
        # si la fila no va de izquierda a derecha, es que está desordenada y se
        # ordena por `x`. No se toca la fila que ya viene en orden.
        desordenada = any(b.x < a.x - TOLERANCIA_FILA for a, b in zip(fila, fila[1:]))
        out.extend(sorted(fila, key=lambda l: l.x) if (cortada or desordenada) else fila)
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


def _grupos(lines: list[Line]) -> list[list[Line]]:
    """Agrupa líneas consecutivas en párrafos, sin unirlas todavía."""
    if not lines:
        return []
    pitch = page_pitch(lines)
    out: list[list[Line]] = []
    cur: list[Line] = []
    prev: Line | None = None
    for ln in lines:
        if prev is not None:
            same_col = (ln.page, ln.col) == (prev.page, prev.col)
            gap = ln.y - prev.fin if same_col else 999
            # La sangría abre párrafo, pero no cuando la línea es la
            # continuación de una frase abierta: eso lo resuelve `continua` más
            # abajo (T-0241, el drenaje psíquico del aboleth, que llega sangrado
            # 9 pt y sigue siendo el mismo párrafo).
            bloque_distinto = same_col and ln.block >= 0 and prev.block >= 0 and ln.block != prev.block
            indented = same_col and (ln.x - prev.x) > 5 and gap > pitch * 0.9
            # Una palabra partida sigue en la línea siguiente aunque cambie la
            # columna o la página (los cortes del maquetador caen al pie de la
            # columna); el trozo siempre empieza en minúscula.
            sigue_palabra = corta_palabra(prev.text) and ln.text[:1].islower()
            # Una frase no empieza en minúscula: si la línea anterior no cierra
            # frase y esta arranca en minúscula, el salto de columna, de página
            # o de bloque lo puso el maquetador y el párrafo continúa. Sin esto,
            # el último rasgo de 20 criaturas se corta al cambiar de columna y
            # `_split_feature()` descarta el trozo suelto (T-0241).
            continua = ln.text[:1].islower() and not CIERRE_RE.search(prev.text.rstrip())
            if (not same_col or gap > pitch * 1.45 or indented or bloque_distinto) and not (sigue_palabra or continua):
                out.append(cur)
                cur = []
        cur.append(ln)
        prev = ln
    if cur:
        out.append(cur)
    return out


def paragraphs(lines: list[Line]) -> list[str]:
    """Une líneas consecutivas en párrafos."""
    return [_join([l.text for l in g]) for g in _grupos(lines)]




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
