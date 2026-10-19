"""Lectura de las reglas y estados del SRD a partir del XML de pdftohtml.

`pdftotext -bbox-layout` (lo que usa `pdf_stream.py`) da bien el texto y el
orden de lectura, pero las cajas de las palabras de estas ediciones en español
están corruptas: la altura de la mayoría de palabras no se corresponde con el
cuerpo de la fuente, así que no sirve para distinguir títulos de párrafos.

`pdftohtml -xml` sí exporta el tamaño real de cada `fontspec` y las negritas
(`<b>`), y conserva el orden de lectura. Es la fuente que usa este módulo:

    pdftohtml -xml -stdout es51.pdf > es51.xml
"""
from __future__ import annotations

import html
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

PAGE_RE = re.compile(r"<page\b[^>]*>(.*?)</page>", re.S)
TEXT_RE = re.compile(r"<text\b([^>]*)>(.*?)</text>", re.S)
SPEC_RE = re.compile(r"<fontspec\b([^>]*)/>")
ATTR_RE = re.compile(r"(\w+)=\"([^\"]*)\"")
TAG_RE = re.compile(r"<[^>]+>")

GUTTER = 459.0     # límite entre columnas en el XML de pdftohtml (escala 1,5)
SCALE = 1.5        # pdftohtml trabaja a 1,5 veces el tamaño real del PDF
FOOTER_TOP = 1100.0


def _attrs(raw: str) -> dict[str, str]:
    return dict(ATTR_RE.findall(raw))


def _segments(raw: str) -> list[tuple[str, bool]]:
    """Trocea el HTML de un `text` en pares (texto, negrita)."""
    segs: list[tuple[str, bool]] = []
    bold = 0
    pos = 0
    for m in re.finditer(r"</?b>", raw):
        chunk = html.unescape(TAG_RE.sub("", raw[pos : m.start()]))
        if chunk:
            segs.append((chunk, bold > 0))
        bold += 1 if m.group(0) == "<b>" else -1
        pos = m.end()
    chunk = html.unescape(TAG_RE.sub("", raw[pos:]))
    if chunk:
        segs.append((chunk, bold > 0))
    return segs


@dataclass
class Run:
    top: float
    left: float
    width: float
    size: float
    bold: bool
    text: str          # texto plano, sin etiquetas
    raw: str           # contenido original (con <b>/<i>)
    segs: list[tuple[str, bool]] = field(default_factory=list)  # (texto, negrita)


@dataclass
class Line:
    page: int
    col: int
    top: float
    left: float
    size: float
    text: str          # texto plano
    md: str            # texto con **negritas** de Markdown
    bold: bool
    indent: bool


@dataclass
class Page:
    n: int
    runs: list[Run] = field(default_factory=list)


def parse(path) -> list[Page]:
    src = open(path, encoding="utf-8", errors="replace").read()
    specs: dict[str, float] = {}
    pages: list[Page] = []
    for i, body in enumerate(PAGE_RE.findall(src), start=1):
        for m in SPEC_RE.finditer(body):
            a = _attrs(m.group(1))
            specs[a["id"]] = float(a["size"])
        runs = []
        for m in TEXT_RE.finditer(body):
            a = _attrs(m.group(1))
            inner = m.group(2)
            runs.append(
                Run(
                    top=float(a["top"]),
                    left=float(a["left"]),
                    width=float(a["width"]),
                    size=specs.get(a.get("font"), 0.0),
                    bold="<b>" in inner,
                    text=html.unescape(TAG_RE.sub("", inner)),
                    raw=inner,
                    segs=_segments(inner),
                )
            )
        pages.append(Page(i, runs))
    return pages


def two_columns(page: Page) -> bool:
    lefts = [r.left for r in page.runs if r.text.strip() and r.top < FOOTER_TOP]
    return any(x < GUTTER for x in lefts) and any(x >= GUTTER for x in lefts)


def page_lines(page: Page) -> list[Line]:
    runs = [r for r in page.runs if r.text.strip() and r.top < FOOTER_TOP]
    if not runs:
        return []
    cols = two_columns(page)
    groups = (
        [
            [r for r in runs if r.left < GUTTER],
            [r for r in runs if r.left >= GUTTER],
        ]
        if cols
        else [runs]
    )
    out: list[Line] = []
    for col, items in enumerate(groups):
        if not items:
            continue
        items.sort(key=lambda r: (r.top, r.left))
        group: list[Run] = []
        base = items[0].top
        for r in items:
            if abs(r.top - base) <= 4:
                group.append(r)
            else:
                out.append(_line(group, col, page.n))
                group = [r]
                base = r.top
        out.append(_line(group, col, page.n))
    return [l for l in out if l and l.text]


def _line(group: list[Run], col: int, page: int) -> Line | None:
    group = sorted(group, key=lambda r: r.left)
    indent = group[0].text[:1].isspace()
    text = ""
    spans: list[tuple[int, int, bool]] = []
    prev_end = None
    for r in group:
        if not text:
            gap = ""
        else:
            gap = "" if (prev_end is not None and r.left - prev_end < 3) else " "
        text += gap
        first = not text.strip()
        for chunk, bold in r.segs:
            if first:
                chunk = chunk.lstrip()
                first = False
            start = len(text)
            text += chunk
            spans.append((start, len(text), bold))
        prev_end = r.left + r.width
    text = text.strip()
    if not text:
        return None
    mask = [False] * len(text)
    for a, b, bold in spans:
        if bold:
            for i in range(max(a, 0), min(b, len(text))):
                mask[i] = True
    for i in range(len(text)):
        if mask[i] and text[i] == " ":
            if i == 0 or not mask[i - 1]:
                mask[i] = False
            elif i + 1 >= len(text) or not mask[i + 1]:
                mask[i] = False
    md = ""
    for i, ch in enumerate(text):
        if mask[i] and (i == 0 or not mask[i - 1]):
            md += "**"
        md += ch
        if mask[i] and (i + 1 == len(text) or not mask[i + 1]):
            md += "**"
    return Line(
        page=page,
        col=col,
        top=group[0].top,
        left=group[0].left,
        size=max(r.size for r in group),
        text=text,
        md=md,
        bold=all(r.bold for r in group),
        indent=indent,
    )


def page_pitch(lines: list[Line]) -> float:
    deltas = []
    for a, b in zip(lines, lines[1:]):
        if a.col == b.col:
            d = b.top - a.top
            if 8 < d < 30:
                deltas.append(d)
    if not deltas:
        return 18.0
    deltas.sort()
    return deltas[len(deltas) // 2]


def _join(a: str, b: str) -> str:
    if a.endswith(("-", "\u2010", "\u2011")):
        return a[:-1] + b
    return a + " " + b


# --- bloques ---------------------------------------------------------------

H1, H2, H3, H4 = 30.0, 24.0, 20.0, 17.5
TABLE_MAX = 14.6
BODY_MIN = 14.7


@dataclass
class Block:
    kind: str                 # h1 h2 h3 h4 caption para item table
    page: int
    text: str = ""
    rows: list[list[str]] = field(default_factory=list)


def _kind_of(line: Line) -> str:
    if line.size >= H1:
        return "h1"
    if line.size >= H2:
        return "h2"
    if line.size >= H3:
        return "h3"
    if line.size >= H4:
        return "caption" if line.bold else "h4"
    if line.size <= TABLE_MAX:
        return "table"
    return "para"


def _lead_in(md: str) -> bool:
    """¿La línea empieza con una entradilla en negrita cerrada con punto?"""
    if not md.startswith("**"):
        return False
    end = md.find("**", 2)
    return end > 2 and md[2:end].rstrip().endswith(".")


def _cells(text: str) -> list[str]:
    return [c.strip() for c in re.split(r"\s{2,}", text) if c.strip()]


def _line_to_block(line: Line, page: int) -> Block:
    kind = _kind_of(line)
    if kind in ("para", "table") and line.text.startswith("•"):
        kind = "item"
    return Block(kind, page, line.text, _cells(line.text))


def blocks(pages: list[Page], first: int, last: int, words: dict | None = None) -> list[Block]:
    out: list[Block] = []
    cur: Block | None = None
    prev: Line | None = None
    pitch = 18.0
    tbl: dict | None = None

    def close_table() -> None:
        nonlocal tbl
        if tbl is None:
            return
        block = tbl["block"]
        if words:
            ws = []
            for p in range(tbl["first"], tbl["last"] + 1):
                for x0, x1, y, t in words.get(p, []):
                    if not (tbl["y0"] - 4 <= y <= tbl["y1"] + 8):
                        continue
                    if tbl["cols"] and (x0 >= 306) != tbl["col"]:
                        continue
                    ws.append((x0, x1, y, t))
            grid = table_grid(_cell_rows(ws))
            if grid and max(len(r) for r in grid) > 1:
                block.rows = grid
            else:
                # texto a cuerpo menor (cuadros y notas), no una tabla
                block.kind = "skip"
                block.text = ""
                for extra in _small_blocks([r[0] for r in (grid or tbl["rows"])], tbl["block"].page):
                    out.append(extra)
        else:
            block.rows = tbl["rows"]
        tbl = None

    for page in pages[first - 1 : last]:
        lines = page_lines(page)
        if not lines:
            continue
        pitch = page_pitch(lines)
        cols = two_columns(page)
        new_page = True
        for line in lines:
            kind = _kind_of(line)
            gap = line.top - prev.top if (prev is not None and prev.page == page.n) else None
            if kind in ("h1", "h2", "h3", "h4", "caption"):
                close_table()
                limit = max(pitch * 1.6, line.size * 2.2)
                if cur is not None and cur.kind == kind and gap is not None and gap < limit:
                    cur.text = _join(cur.text, line.text)
                else:
                    cur = Block(kind, page.n, line.text)
                    out.append(cur)
                prev = line
                continue
            if kind == "table":
                y = line.top / SCALE
                col = 0 if line.left < GUTTER else 1
                if tbl is not None and (tbl["last"] != page.n or tbl["col"] != col):
                    close_table()
                if tbl is None:
                    cur = Block("table", page.n)
                    out.append(cur)
                    tbl = dict(block=cur, first=page.n, last=page.n, y0=y, y1=y,
                               col=col, cols=cols,
                               rows=[_cells(line.text)], text=line.text)
                else:
                    tbl["last"] = page.n
                    tbl["y1"] = y
                    tbl["rows"].append(_cells(line.text))
                prev = line
                continue
            close_table()
            # cuerpo
            if new_page and cur is not None and kind == "para" and not line.indent:
                # un párrafo que viene de la página o columna anterior
                if cur.kind in ("para", "item") and not cur.text.rstrip().endswith((".", ":", "!", "?", "”", '"')):
                    cur.text = _join(cur.text, line.text)
                    prev, new_page = line, False
                    continue
            new_page = False
            starts_item = line.text.startswith("•")
            terminal = cur is not None and cur.text.rstrip().endswith((".", ":", "!", "?", "”", '"'))
            if cur is not None and cur.kind == "para" and _lead_in(line.md):
                cur = Block("para", page.n, line.md)
                cur_left = line.left
                out.append(cur)
                prev = line
                continue
            if starts_item:
                cur = Block("item", page.n, line.text)
                cur_left = line.left
                out.append(cur)
            elif (
                cur is not None
                and cur.kind == "item"
                and (line.left > cur_left + 5 or (gap is not None and gap < pitch * 1.3 and not terminal))
            ):
                cur.text = _join(cur.text, line.text)
            elif cur is not None and cur.kind == "para" and not line.indent and gap is not None and gap < pitch * 1.3:
                cur.text = _join(cur.text, line.text)
            else:
                cur = Block("para", page.n, line.text)
                cur_left = line.left
                out.append(cur)
            prev = line
    close_table()
    return _merge_tables(_merge_lists([b for b in out if b.kind != "skip"]))


def _merge_tables(items: list[Block]) -> list[Block]:
    """Une una tabla partida por un salto de página que repite la cabecera."""
    out: list[Block] = []
    for b in items:
        if (
            b.kind == "table"
            and out
            and out[-1].kind == "table"
            and b.rows
            and out[-1].rows
            and b.rows[0] == out[-1].rows[0]
        ):
            out[-1].rows = out[-1].rows + b.rows[1:]
        else:
            out.append(b)
    return out


def _small_blocks(lines: list[str], page: int) -> list[Block]:
    """Convierte un cuadro de texto pequeño en párrafos y listas."""
    out: list[Block] = []
    for ln in lines:
        ln = " ".join(ln.split())
        if not ln:
            continue
        bullet = ln.startswith("•")
        if out and not bullet:
            last = out[-1]
            if last.kind == "item" and not bullet:
                last.text = _join(last.text, ln.lstrip("• ").strip())
                continue
            if last.kind == "para" and not last.text.endswith((".", ":", "!", "?", "”", '"')):
                last.text = _join(last.text, ln)
                continue
        if bullet:
            out.append(Block("item", page, ln))
        else:
            out.append(Block("para", page, ln))
    return out


def _flow(lines: list[str]) -> str:
    """Une líneas sueltas en párrafos: solo se corta tras puntuación final."""
    paras: list[str] = []
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        if paras and not paras[-1].endswith((".", ":", "!", "?", "”", '"', ";")):
            paras[-1] = _join(paras[-1], ln)
        else:
            paras.append(ln)
    return "\n\n".join(paras)


def _merge_lists(items: list[Block]) -> list[Block]:
    """Une los ítems consecutivos de una lista en un único bloque."""
    out: list[Block] = []
    for b in items:
        if b.kind == "item" and out and out[-1].kind == "item" and out[-1].page == b.page:
            out[-1].text = out[-1].text + "\n" + b.text
        elif b.kind == "item" and out and out[-1].kind == "item":
            out[-1].text = out[-1].text + "\n" + b.text
        else:
            out.append(b)
    return out


# --- tablas ----------------------------------------------------------------

WORD_NS = "{http://www.w3.org/1999/xhtml}"


def parse_words(path) -> dict[int, list[tuple[float, float, float, str]]]:
    """Palabras con coordenadas (escala real del PDF) para reconstruir tablas."""
    root = ET.parse(path).getroot()
    pages: dict[int, list[tuple[float, float, float, str]]] = {}
    for i, page in enumerate(root.iter(f"{WORD_NS}page"), start=1):
        words = []
        for w in page.iter(f"{WORD_NS}word"):
            txt = (w.text or "").strip()
            if not txt:
                continue
            words.append(
                (float(w.get("xMin", 0)), float(w.get("xMax", 0)), float(w.get("yMin", 0)), txt)
            )
        pages[i] = words
    return pages


def _cell_rows(words: list[tuple[float, float, float, str]]) -> list[list[tuple[float, str]]]:
    """Agrupa palabras en filas y, dentro de cada fila, en celdas."""
    rows: list[list[tuple[float, float, float, str]]] = []
    for w in sorted(words, key=lambda v: (v[2], v[0])):
        if rows and abs(w[2] - rows[-1][0][2]) <= 4.5:
            rows[-1].append(w)
        else:
            rows.append([w])
    cells = []
    for row in rows:
        row.sort(key=lambda v: v[0])
        cur = [row[0]]
        out = []
        for w in row[1:]:
            prev_end = max(v[1] for v in cur)
            if w[0] - prev_end > 7:
                out.append(cur)
                cur = [w]
            else:
                cur.append(w)
        out.append(cur)
        cells.append([(min(v[0] for v in c), " ".join(v[3] for v in c)) for c in out])
    return cells


def table_grid(rows: list[list[tuple[float, str]]]) -> list[list[str]]:
    """Coloca las celdas en columnas usando la fila con más celdas como patrón."""
    rows = [r for r in rows if r]
    if not rows:
        return []
    width = max(len(r) for r in rows)
    if width == 1:
        return [[c[1]] for r in rows for c in r]
    anchor = next(r for r in rows if len(r) == width)
    anchors = [x for x, _ in anchor][:width]

    grid: list[list[str]] = []
    for row in rows:
        line = [""] * width
        for x, text in row:
            i = min(range(width), key=lambda j: abs(anchors[j] - x))
            line[i] = (line[i] + " " + text).strip() if line[i] else text
        if grid and line[0] == "" and sum(1 for c in line if c) == 1:
            # una fila con una sola celda fuera de la primera columna continúa la anterior
            j = next(i for i, c in enumerate(line) if c)
            prev = grid[-1][j]
            if prev.endswith(("-", "\u2010", "\u2011")):
                grid[-1][j] = prev[:-1] + line[j]
            else:
                grid[-1][j] = (prev + " " + line[j]).strip()
            continue
        grid.append(line)

    # cabecera partida en dos líneas: "Gravedad de" / "la trampa"
    if (
        len(grid) >= 2
        and all(c[:1].isupper() for c in grid[0] if c)
        and all(c[:1].islower() for c in grid[1] if c)
        and any(grid[1])
    ):
        grid[0] = [(a + " " + b).strip() for a, b in zip(grid[0], grid[1])]
        grid.pop(1)
    return grid


# --- entradas y renderizado ------------------------------------------------

HEADINGS = ("h1", "h2", "h3", "h4")


@dataclass
class Spec:
    """Una entrada del corpus: de su título al de la siguiente."""

    title: str
    category: str
    name: str = ""
    end: str = ""
    level: str = "h2"

    def label(self) -> str:
        return self.name or self.title


def find(blocks: list[Block], title: str, start: int = 0, kind="h2") -> int:
    kinds = (kind,) if isinstance(kind, str) else tuple(kind)
    for i in range(start, len(blocks)):
        b = blocks[i]
        if b.kind in kinds and b.text.strip() == title:
            return i
    raise LookupError(f"{kinds} no encontrado: {title!r}")


def find_any(blocks: list[Block], title: str, start: int = 0) -> int:
    for i in range(start, len(blocks)):
        if blocks[i].kind in HEADINGS and blocks[i].text.strip() == title:
            return i
    raise LookupError(f"título no encontrado: {title!r}")


def entries(blocks: list[Block], specs: list[Spec]) -> list[tuple[Spec, int, list[Block]]]:
    """Trocea los bloques en entradas siguiendo la lista de especificaciones."""
    out: list[tuple[Spec, int, list[Block]]] = []
    cursor = 0
    for i, spec in enumerate(specs):
        start = find(blocks, spec.title, cursor, spec.level)
        if spec.end:
            end = find_any(blocks, spec.end, start + 1)
        elif i + 1 < len(specs):
            nxt = specs[i + 1]
            end = find(blocks, nxt.title, start + 1, nxt.level)
        else:
            end = len(blocks)
        out.append((spec, blocks[start].page, blocks[start + 1 : end]))
        cursor = start + 1
    return out


def _md_table(rows: list[list[str]]) -> str:
    rows = [[c.strip() for c in r] for r in rows if any(c.strip() for c in r)]
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    head, body = rows[0], rows[1:]
    lines = ["| " + " | ".join(head) + " |", "|" + "|".join(["---"] * width) + "|"]
    for r in body:
        lines.append("| " + " | ".join(r) + " |")
    return "\n".join(lines)


def render(blocks: list[Block]) -> str:
    parts: list[str] = []
    for b in blocks:
        if b.kind in ("h1", "h2"):
            parts.append(f"## {b.text}")
        elif b.kind == "h3":
            parts.append(f"## {b.text}")
        elif b.kind == "h4":
            parts.append(f"### {b.text}")
        elif b.kind == "caption":
            parts.append(f"**{b.text}**")
        elif b.kind == "table":
            table = _md_table(b.rows)
            if table:
                parts.append(table)
        elif b.kind == "item":
            items = [f"- {ln.lstrip('• ').strip()}" for ln in b.text.split("\n") if ln.strip()]
            parts.append("\n".join(items))
        else:
            if b.text.strip():
                parts.append(b.text.strip())
    return "\n\n".join(p for p in parts if p.strip())
