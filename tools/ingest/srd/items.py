"""Extracción de objetos mágicos de los SRD en español (5.1 y 5.2)."""
from __future__ import annotations

import re
from dataclasses import dataclass

from .pies import sin_pies
from .stream import Line

TYPE_PREFIXES = (
    "Objeto maravilloso",
    "Objeto",
    "Arma",
    "Armadura",
    "Escudo",
    "Varita",
    "Vara",
    "Bastón",
    "Anillo",
    "Poción",
    "Pergamino",
    "Artefacto",
)

RARITY_WORDS = (
    "común",
    "infrecuente",
    "poco común",
    "rara",
    "raro",
    "muy rara",
    "muy raro",
    "legendaria",
    "legendario",
    "varía",
    "variable",
    "artefacto",
)

TYPE_RE = re.compile(
    r"^(?P<prefix>" + "|".join(TYPE_PREFIXES) + r")\b"
    r"\s*(?:\([^)]*\))?\s*,\s*(?P<rest>.+)$"
)

RARITY_RE = re.compile(r"\b(" + "|".join(RARITY_WORDS) + r")\b", re.I)

RARITY_MAP = {
    "común": "común",
    "infrecuente": "poco común",
    "poco común": "poco común",
    "rara": "raro",
    "raro": "raro",
    "muy rara": "muy raro",
    "muy raro": "muy raro",
    "legendaria": "legendario",
    "legendario": "legendario",
    "varía": "varía",
    "variable": "varía",
    "artefacto": "artefacto",
}


@dataclass
class Item:
    name: str
    type: str
    rarity: str
    attunement: bool
    body: str
    page: int
    variant: str = ""
    raw_type: str = ""
    has_table: bool = False


def merge_rows(lines: list[Line]) -> list[Line]:
    """Une fragmentos de la misma línea de texto (cursivas, negritas, celdas).

    El PDF dibuja las cursivas y las negritas como bloques aparte que quedan
    1-2 pt por encima o por debajo de la línea base, así que hay que
    reordenarlos por x dentro de la fila antes de unirlos.
    """
    out: list[Line] = []
    row: list[Line] = []

    def flush() -> None:
        if not row:
            return
        row.sort(key=lambda l: l.x)
        text = ""
        for l in row:
            piece = l.text
            # Las entradas de párrafo en negrita ("Maldición.", "Conjuros.") se
            # dibujan con un cuerpo propio, ligeramente mayor que la cursiva.
            if 13.35 <= l.size <= 13.6 and piece.endswith(".") and not text:
                piece = f"**{piece}**"
            if not text:
                text = piece
            elif text.endswith("-"):
                text = text[:-1] + piece
            else:
                text = text + " " + piece
        first = min(row, key=lambda l: (l.y, l.x))
        biggest = max(row, key=lambda l: l.size)
        out.append(
            Line(
                page=first.page,
                col=first.col,
                x=min(l.x for l in row),
                y=first.y,
                size=biggest.size,
                text=" ".join(text.split()),
            )
        )
        row.clear()

    for ln in lines:
        if row and (ln.page, ln.col) == (row[-1].page, row[-1].col) and abs(ln.y - row[-1].y) <= 2.6:
            row.append(ln)
        else:
            flush()
            row.append(ln)
    flush()
    return out


def _is_type_line(text: str) -> bool:
    if not TYPE_RE.match(text):
        return False
    return bool(RARITY_RE.search(text)) or "rareza" in text.lower()


def _type_block(lines: list[Line], i: int) -> tuple[str, int]:
    """Devuelve el texto completo del tipo y el índice de la última línea usada."""
    text = lines[i].text.strip()
    size = lines[i].size
    j = i
    while j + 1 < len(lines) and (j - i) < 5:
        nxt = lines[j + 1]
        if abs(nxt.size - size) > 0.25:
            break
        dangles = not RARITY_RE.search(text) and nxt.text[:1].islower()
        if not (text.count("(") > text.count(")") or text.endswith(",") or dangles):
            break
        text = text + " " + nxt.text.strip()
        j += 1
    return text, j


def parse(lines: list[Line], name_min_size: float) -> tuple[list[Item], list[str]]:
    lines = merge_rows(lines)
    # (idx_nombre, idx_primer_tipo, idx_ultimo_tipo, tipo)
    starts: list[tuple[int, int, int, str]] = []
    i = 0
    while i < len(lines) - 1:
        if lines[i].size >= name_min_size:
            text, last = _type_block(lines, i + 1)
            if _is_type_line(text) and last >= i + 1:
                name_idx = i
                # El nombre puede venir partido en dos líneas al mismo cuerpo.
                if i > 0 and lines[i - 1].size >= name_min_size - 0.1 and lines[i].text[:1].islower():
                    name_idx = i - 1
                starts.append((name_idx, i + 1, last, text))
                i = last + 1
                continue
        i += 1

    items: list[Item] = []
    orphans: list[str] = []
    base = _col_base(lines)
    for n, (name_idx, type_start, type_end, raw_type) in enumerate(starts):
        name = " ".join(lines[k].text.strip() for k in range(name_idx, type_start)).strip()
        body_start = type_end + 1
        body_end = starts[n + 1][0] if n + 1 < len(starts) else len(lines)
        if body_end <= body_start:
            orphans.append(f"{name} (p. {lines[name_idx].page}): sin cuerpo")
            continue
        items.append(
            _make_item(
                name,
                raw_type,
                lines[body_start:body_end],
                lines[name_idx].page,
                base,
                name_min_size,
            )
        )
    return items, orphans


def _col_base(lines: list[Line]) -> dict[tuple[int, int], float]:
    base: dict[tuple[int, int], float] = {}
    for l in lines:
        key = (l.page, l.col)
        base[key] = min(base.get(key, l.x), l.x)
    return base


def _body_text(
    body_lines: list[Line], base: dict[tuple[int, int], float], name_min: float
) -> str:
    chunks: list[str] = []
    cur: list[str] = []
    prev: Line | None = None

    def flush() -> None:
        if cur:
            chunks.append(_join(cur))
            cur.clear()

    for ln in body_lines:
        heading = name_min <= ln.size <= 21.0 and len(ln.text) < 70 and not ln.text.endswith(".")
        if prev is not None:
            same = (ln.page, ln.col) == (prev.page, prev.col)
            gap = ln.y - prev.y if same else 99.0
            indented = (ln.x - base.get((ln.page, ln.col), ln.x)) > 5.0
            table = _is_table_line(ln)
            prev_table = _is_table_line(prev)
            big = name_min <= ln.size <= 21.0
            if table or prev_table or big or (same and (gap > 19.0 or indented)):
                flush()
        if heading:
            flush()
            chunks.append(f"## {ln.text.strip()}")
            prev = ln
            continue
        cur.append(ln.text)
        prev = ln
    flush()
    return "\n\n".join(c for c in chunks if c.strip())


def _is_table_line(l: Line) -> bool:
    return l.size <= 12.6


def _make_item(
    name: str,
    raw_type: str,
    body_lines: list[Line],
    page: int,
    base: dict[tuple[int, int], float],
    name_min: float,
) -> Item:
    m = TYPE_RE.match(raw_type)
    rest = m.group("rest") if m else ""
    full_prefix = raw_type[: raw_type.index(",")] if "," in raw_type else raw_type
    prefix = full_prefix.strip()

    rarities = [RARITY_MAP[r.lower()] for r in RARITY_RE.findall(rest)]
    uniq = sorted(set(rarities))
    if len(uniq) == 1:
        rarity = uniq[0]
    elif uniq:
        rarity = "varía"
    elif re.search(r"rareza|variable", rest, re.I):
        rarity = "varía"
    else:
        rarity = ""

    attunement = "requiere sintonizaci" in rest.lower()

    body = _body_text(body_lines, base, name_min)
    has_table = any(_is_table_line(l) for l in body_lines)
    return Item(
        name=name,
        type=prefix,
        rarity=rarity,
        attunement=attunement,
        body=body,
        page=page,
        variant=rest.strip(),
        raw_type=raw_type,
        has_table=has_table,
    )


def _join(parts: list[str]) -> str:
    text = ""
    for p in parts:
        if not text:
            text = p
        elif text.endswith("-"):
            text = text[:-1] + p
        else:
            text += " " + p
    return " ".join(text.split()).strip()


def plain_bodies(items: list[Item], text: str) -> list[str | None]:
    """Cuerpos tomados del texto plano, donde las cursivas conservan su orden.

    El flujo por coordenadas intercala las cursivas (nombres de conjuros) al
    final de la línea. El texto plano las deja en su sitio, así que se ancla la
    cabecera de cada entrada (nombre + línea de tipo) y se toma el texto hasta
    la cabecera siguiente.

    El texto plano trae el pie de página del PDF —y con él, a veces, el número
    de la hoja—, así que se limpia antes de cortar los cuerpos: sin eso el pie
    acaba publicado dentro de la descripción del objeto y, si cayó a media
    frase, la ficha se queda sin el final del texto.
    """
    text = sin_pies(text)
    prefix = "(?:" + "|".join(TYPE_PREFIXES) + ")"
    rarity = (
        r"(?:poco común|muy rar[oa]s?|infrecuentes?|legendari[oa]s?|comunes?|común"
        r"|rar[oa]s?|varía|variable|artefacto)"
    )
    clause = re.compile(r"\s*(?:,|\s+o\s+|\s+y\s+)\s*(?:" + rarity + r")(?:\s*\([^)]*\))?")
    first = re.compile(r"(" + rarity + r")(?:\s*\([^)]*\))?")

    cur = 0
    heads: list[tuple[int, int] | None] = []
    for it in items:
        pat = re.compile(
            r"\s+".join(re.escape(w) for w in it.name.split()) + r"\s+" + prefix + r"\b",
            re.I,
        )
        m = pat.search(text, cur)
        if not m:
            heads.append(None)
            continue
        heads.append((m.start(), m.end()))
        cur = m.end()

    out: list[str | None] = []
    for n, _it in enumerate(items):
        head = heads[n]
        if head is None:
            out.append(None)
            continue
        # Fin de la línea de tipo: rareza (+ posible paréntesis) y variantes.
        stop = head[1] + 200
        m = first.search(text, head[1], stop)
        if m:
            start = m.end()
            while True:
                c = clause.match(text, start)
                if not c or c.end() <= start:
                    break
                start = c.end()
            # Paréntesis sueltos tras la rareza ("(requiere sintonización...)").
            while True:
                mp = re.compile(r"\s*\([^)]*\)").match(text, start)
                if not mp:
                    break
                start = mp.end()
        else:
            nl = text.find("\n", head[1])
            start = nl if 0 <= nl <= head[1] + 150 else head[1]
        end = len(text)
        for nxt in heads[n + 1 :]:
            if nxt is not None and nxt[0] >= start:
                end = nxt[0]
                break
        body = text[start:end].strip()
        paras = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
        body = "\n\n".join(paras)
        out.append(body if body else None)
    return out
