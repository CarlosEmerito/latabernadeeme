"""Extracción de las clases del SRD en español (5.1 y 5.2).

Cada clase se escribe como un Markdown con frontmatter (ver docs/DATOS.md):
atributos básicos, tabla de progresión de 20 niveles, rasgos por nivel y
subclases.

Uso:
    python tools/ingest/srd/classes.py [--ed 51|52] [--only Nombre] [--debug]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1]))

from stream import Line, load, page_pitch  # noqa: E402
from write_data import clean_paragraph, slug, unique_path, write_entry  # noqa: E402

WORK = Path("/home/emerito/.hermes/cache/scratch/srd/work")
ROOT = HERE.parents[3]
DATA = ROOT / "data"

CLASSES51 = [
    ("Bárbaro", 8), ("Bardo", 11), ("Brujo", 15), ("Clérigo", 21),
    ("Druida", 25), ("Explorador", 30), ("Guerrero", 34), ("Hechicero", 36),
    ("Mago", 40), ("Monje", 44), ("Paladín", 48), ("Pícaro", 53),
]
CLASSES52 = [
    ("Bárbaro", 32), ("Bardo", 35), ("Brujo", 40), ("Clérigo", 47),
    ("Druida", 52), ("Explorador", 58), ("Guerrero", 62), ("Hechicero", 64),
    ("Mago", 71), ("Monje", 77), ("Paladín", 81), ("Pícaro", 86),
]

T51_SECTION, T51_TRAIT, T51_SUB, T51_CAPTION = 24.1, 18.8, 16.1, 16.7
T51_TABLE_MAX = 13.2
T52_SECTION, T52_TRAIT, T52_TABLE_MAX = 16.7, 14.3, 11.6

LEVEL_RE = re.compile(r"^(\d{1,2})\s+\+(\d)\b")
NUM_TOKEN = re.compile(r"^([+−-]?(?:\d+d\d+|\d+(?:,\d+)?)|—|-)$")
TRAIT52_RE = re.compile(r"^Nivel (\d{1,2}):\s*(.+)$")
SLOTS = [f"Espacios de conjuro {i}" for i in range(1, 10)]

# Columnas extra de cada tabla de progresión de 5.1. Las tablas del PDF vienen
# partidas en dos o tres paneles; aquí se indica qué panel aporta qué columna.
SPEC51 = {
    "Bárbaro": {
        "trail": ["N.º de furias", "Daño por furia"],
        "overrides": {20: {"text": ["Campeón Primordial"], "trail": ["Ilimitadas", "+4"]}},
    },
    "Bardo": {"trail": ["Trucos conocidos"],
              "panes": [{"pos": (11, 1), "drop_lead": 1, "names": SLOTS}]},
    "Brujo": {"panes": [{"pos": (15, 1), "names": [
        "Trucos conocidos", "Conjuros conocidos", "Espacios de conjuro",
        "Nivel de espacio", "Invocaciones conocidas"]}]},
    "Clérigo": {"panes": [{"pos": (21, 1), "names": ["Trucos conocidos"] + SLOTS}]},
    "Druida": {"panes": [{"pos": (25, 1), "names": ["Trucos conocidos"] + SLOTS}]},
    "Explorador": {"panes": [{"pos": (30, 1), "names": ["Conjuros conocidos"] + SLOTS[:5]}]},
    "Guerrero": {},
    "Hechicero": {"lead": ["Puntos de hechicería"], "trail": ["Trucos conocidos"],
                  "panes": [{"pos": (36, 1), "drop_lead": 1, "names": SLOTS}]},
    "Mago": {"panes": [{"pos": (40, 1), "names": ["Trucos conocidos"] + SLOTS},
                       {"pos": (40, 2), "mode": "y"}]},
    "Monje": {"lead": ["Artes marciales", "Puntos de ki"],
              "trail": ["Movimiento sin armadura"],
              "panes": [{"pos": (44, 1), "names": [], "numeric": False},
                        {"pos": (44, 2), "mode": "y", "target": "trail"}],
              "overrides": {1: {"trail": ["—"]}}},
    "Paladín": {"panes": [{"pos": (48, 1), "names": SLOTS[:5]}],
                "overrides": {2: {"text": ["Estilo de Combate, Lanzamiento de Conjuros, Castigo Divino"]}}},
    "Pícaro": {"lead": ["Ataque furtivo"]},
}


# --------------------------------------------------------------------------
# Utilidades de líneas
# --------------------------------------------------------------------------
def merge_same_baseline(lines: list[Line]) -> list[Line]:
    """Une fragmentos de una misma línea base (etiqueta en negrita + texto)."""
    out: list[Line] = []
    for ln in lines:
        if (out and (out[-1].page, out[-1].col) == (ln.page, ln.col)
                and abs(out[-1].y - ln.y) <= 1.6):
            prev = out[-1]
            out[-1] = Line(prev.page, prev.col, min(prev.x, ln.x), prev.y, prev.size,
                           f"{prev.text} {ln.text}".strip())
        else:
            out.append(ln)
    return out


def prose(lines: list[Line]) -> list[str]:
    """Párrafos literales, respetando columnas, sangrías y viñetas."""
    if not lines:
        return []
    pitch = page_pitch(lines)
    margins: dict[tuple[int, int], float] = {}
    for ln in lines:
        k = (ln.page, ln.col)
        margins[k] = min(margins.get(k, ln.x), ln.x)
    paras: list[list[str]] = []
    cur: list[str] = []
    prev: Line | None = None
    for ln in lines:
        if prev is not None:
            same = (ln.page, ln.col) == (prev.page, prev.col)
            gap = ln.y - prev.y if same else 0.0
            indent = ln.x - margins[(ln.page, ln.col)]
            if ln.text.startswith("•") and cur:
                paras.append(cur)
                cur = []
            elif same and gap > pitch * 1.45:
                paras.append(cur)
                cur = []
            elif (not same or gap > pitch * 0.9) and indent > 5:
                paras.append(cur)
                cur = []
        cur.append(ln.text)
        prev = ln
    if cur:
        paras.append(cur)
    out: list[str] = []
    for parts in paras:
        text = _join(parts)
        if not text:
            continue
        if "•" in text and not text.startswith("•"):
            head, *rest = re.split(r"\s*•\s*", text)
            if head.strip():
                out.append(clean_paragraph(head))
            out.extend("• " + clean_paragraph(r) for r in rest if r.strip())
        else:
            out.append(clean_paragraph(text))
    return [p for p in out if p]


def _join(parts: list[str]) -> str:
    text = ""
    for p in parts:
        if not text:
            text = p
        elif text.endswith("-") and not text.endswith("--"):
            text = text[:-1] + p
        else:
            text += " " + p
    return text.strip()


def add_paras(out: list[str], lines: list[Line]) -> None:
    for p in prose(lines):
        out.extend([p, ""])


def is_running_header(ln: Line) -> bool:
    return ln.size < 10.5 or ln.y < 45


def near(size: float, target: float, tol: float = 0.35) -> bool:
    return abs(size - target) <= tol


# --------------------------------------------------------------------------
# Tablas de progresión
# --------------------------------------------------------------------------
def table_runs(lines: list[Line], pages: set[int], maxsize: float) -> list[list[Line]]:
    out: list[list[Line]] = []
    cur: list[Line] = []
    for ln in lines:
        ok = (ln.page in pages and ln.size <= maxsize
              and ln.text.strip() not in ("•", "")
              and not ln.text.startswith("•")
              and not is_running_header(ln))
        if ok:
            if cur and ((cur[-1].page, cur[-1].col) != (ln.page, ln.col)
                        or ln.y - cur[-1].y > 30):
                out.append(cur)
                cur = []
            cur.append(ln)
        else:
            if cur:
                out.append(cur)
                cur = []
    if cur:
        out.append(cur)
    return out


def _numeric_tokens(text: str) -> list[str]:
    return [t for t in text.split() if NUM_TOKEN.match(t)]


def parse_table(lines: list[Line], pages: set[int], maxsize: float,
                spec: dict) -> tuple[list[dict], list[str]]:
    """Reconstruye la tabla de progresión (20 niveles) de una clase."""
    warns: list[str] = []
    runs = table_runs(lines, pages, maxsize)
    mains = [r for r in runs if sum(1 for l in r if LEVEL_RE.match(l.text)) >= 5]
    rows: dict[int, dict] = {}
    for run in mains:
        cur: dict | None = None
        for ln in run:
            m = LEVEL_RE.match(ln.text)
            if m:
                lvl = int(m.group(1))
                cur = rows.setdefault(lvl, {"level": lvl, "bonus": "+" + m.group(2),
                                            "text": [], "trail": [], "lead": [],
                                            "y": ln.y, "page": ln.page})
                toks = ln.text[m.end():].strip().split()
                lead_vals = []
                for _ in spec.get("lead", []):
                    lead_vals.append(toks.pop(0) if toks and NUM_TOKEN.match(toks[0]) else "")
                trail_vals: list[str] = []
                for _ in spec.get("trail", []):
                    trail_vals.insert(0, toks.pop() if toks and NUM_TOKEN.match(toks[-1]) else "")
                cur["lead"], cur["trail"] = lead_vals, trail_vals
                if spec.get("strip_trailing"):
                    while toks and NUM_TOKEN.match(toks[-1]):
                        toks.pop()
                if toks:
                    cur["text"].append(" ".join(toks))
            elif cur is not None:
                toks = ln.text.split()
                if toks and all(NUM_TOKEN.match(t) for t in toks):
                    continue
                cur["text"].append(ln.text)
    if sorted(rows) != list(range(1, 21)):
        warns.append(f"niveles incompletos: {sorted(rows)}")

    extra: dict[str, dict[int, str]] = {}

    def pane_lines(pos):
        """Todas las líneas de un panel (puede venir partido en varios tramos)."""
        return [l for r in runs if (r[0].page, r[0].col) == pos for l in r]

    for pane in spec.get("panes", []):
        if pane.get("mode") == "y":
            continue
        lines_p = pane_lines(pane["pos"])
        if not lines_p:
            warns.append(f"falta el panel {pane['pos']}")
            continue
        by_y = {}
        for l in lines_p:
            match = [r for r in rows.values()
                     if r["page"] == l.page and abs(r["y"] - l.y) <= 3]
            if len(match) == 1:
                by_y[match[0]["level"]] = l
        use_y = len(by_y) >= 13
        data = lines_p[-len(rows):] if len(lines_p) >= len(rows) else lines_p
        if len(data) != len(rows) and not use_y:
            warns.append(f"panel {pane['pos']}: {len(data)} filas para {len(rows)} niveles")
        names = pane.get("names", [])
        for i, lvl in enumerate(sorted(rows)):
            if use_y:
                if lvl not in by_y:
                    warn_txt = f"panel {pane['pos']}: nivel {lvl} sin fila"
                    if warn_txt not in warns:
                        warns.append(warn_txt)
                    continue
                line = by_y[lvl].text
            else:
                if i >= len(data):
                    break
                line = data[i].text
            if names:
                overflow = [t for t in line.split() if not NUM_TOKEN.match(t)]
                if overflow:
                    rows[lvl]["text"].append(" ".join(overflow))
                toks = _numeric_tokens(line)[pane.get("drop_lead", 0):]
                if len(toks) < len(names):
                    toks = ["—"] * (len(names) - len(toks)) + toks
                for n, v in zip(names, toks[-len(names):]):
                    extra.setdefault(n, {})[lvl] = v
            else:
                rows[lvl]["text"] = [re.sub(r"^(—|m)\s+", "", line)]

    for pane in spec.get("panes", []):
        if pane.get("mode") != "y":
            continue
        for ln in pane_lines(pane["pos"]):
            best = min(rows.values(), key=lambda r: (r["page"] != ln.page, abs(r["y"] - ln.y)))
            if best["page"] != ln.page or abs(best["y"] - ln.y) > 4:
                continue
            if pane.get("target") == "trail" and best["trail"]:
                best["trail"][-1] = ln.text
            else:
                best["text"].append(ln.text)

    for lvl, fix in spec.get("overrides", {}).items():
        for k, v in fix.items():
            rows[lvl][k] = v

    used = {id(l) for run in mains for l in run}
    for pane in spec.get("panes", []):
        used |= {id(l) for r in runs if (r[0].page, r[0].col) == pane["pos"] for l in r}
    ordered = [rows[k] for k in sorted(rows)]
    for r in ordered:
        r["extras"] = {n: d.get(r["level"], "—") for n, d in extra.items()}
    return ordered, warns, used


def markdown_table(rows: list[dict], spec: dict, extra_names: list[str]) -> str:
    lead, trail = spec.get("lead", []), spec.get("trail", [])
    headers = ["Nivel", "Bon. por competencia"] + lead + ["Rasgos"] + trail + extra_names
    out = ["| " + " | ".join(headers) + " |",
           "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        cells = [str(r["level"]), r["bonus"]] + r["lead"]
        cells.append(" ".join(r["text"]).strip() or "—")
        cells += r["trail"] + [r["extras"].get(n, "—") for n in extra_names]
        out.append("| " + " | ".join(c.replace("|", "/") for c in cells) + " |")
    return "\n".join(out)


# --------------------------------------------------------------------------
# Atributos básicos (5.1)
# --------------------------------------------------------------------------
def attribute_items(lines: list[Line]) -> list[tuple[str, str]]:
    """Ítems (etiqueta, valor) del bloque de atributos; las viñetas van aparte."""
    items: list[tuple[str, str]] = []
    cur: list[str] = []

    def flush() -> None:
        if not cur:
            return
        text = _join(cur)
        cur.clear()
        m = re.match(r"^([^:]{3,80}):\s*(.*)$", text)
        items.append((m.group(1).strip(), m.group(2).strip()) if m else ("", text))

    for ln in lines:
        if ln.text.startswith("•"):
            flush()
            cur.append(ln.text)
        elif ln.size <= 13.6 and cur and not cur[0].startswith("•"):
            flush()
            cur.append(ln.text)
        else:
            cur.append(ln.text)
    flush()
    # una misma línea puede contener dos etiquetas ("Armadura: ... Armas: ...")
    out: list[tuple[str, str]] = []
    for label, value in items:
        parts = re.split(r"(?<=[.;])\s+(?=(?:Armadura|Armas|Herramientas|"
                         r"Tiradas de salvación|Habilidades|Dados de Golpe|"
                         r"Puntos de golpe)[:])", value)
        for k, part in enumerate(parts):
            m = re.match(r"^([^:]{3,40}):\s*(.*)$", part.strip()) if k else None
            if m:
                out.append((m.group(1).strip(), m.group(2).strip()))
            else:
                out.append((label, part.strip()))
            label = ""
    return out


def front51(items: list[tuple[str, str]], page: int) -> dict:
    d = {k: v for k, v in items if k}
    hit = ""
    for k, v in d.items():
        if k.startswith("Dados de Golpe") or k.startswith("Puntos de golpe a niveles"):
            m = re.search(r"1d(\d+)", v)
            if m:
                hit = "d" + m.group(1)
                break
    def clean(key: str) -> str:
        return d.get(key, "").strip().rstrip(".")

    saves = [s.strip().rstrip(".") for s in
             re.split(r",| y ", d.get("Tiradas de salvación", "")) if s.strip()]
    return {
        "name": "",
        "hitDie": hit,
        "primaryAbility": "",
        "saves": saves,
        "skillChoices": clean("Habilidades"),
        "armor": clean("Armadura"),
        "weapons": clean("Armas"),
        "tools": clean("Herramientas"),
        "srd": "5.1",
        "page": page,
    }


def _attr_bullets(items: list[tuple[str, str]]) -> list[str]:
    out = []
    for label, value in items:
        if label and value:
            out.append(f"- **{label}:** {value}")
        elif label:
            out.append(f"**{label}:**")
        elif value.startswith("•"):
            out.append("- " + value[1:].strip())
        elif value:
            out.append(value)
    return out


def _fmt_levels(lv: list[int]) -> str:
    v = sorted(set(lv))
    if len(v) == 1:
        return f"nivel {v[0]}"
    return "niveles " + ", ".join(str(x) for x in v[:-1]) + f" y {v[-1]}"


def _small_table(lines: list[Line]) -> list[str]:
    """Convierte una tabla pequeña del PDF en viñetas legibles."""
    rows = [l for l in lines if l.size <= 13.4]
    if not rows:
        return []
    head = " ".join(l.text for l in rows if not re.match(r"^\d", l.text))
    data = [l for l in rows if re.match(r"^\d", l.text)]
    out = []
    if head:
        out.append(f"*{clean_paragraph(head)}*")
        out.append("")
    for l in data:
        m = re.match(r"^(\d{1,2})\s+(.*)$", l.text)
        out.append(f"- **{m.group(1)}:** {clean_paragraph(m.group(2))}" if m
                   else f"- {clean_paragraph(l.text)}")
    if not data:
        out = [f"- {clean_paragraph(l.text)}" for l in rows]
    return out


# --------------------------------------------------------------------------
# 5.1
# --------------------------------------------------------------------------
def span51(lines: list[Line], name: str, page: int) -> list[Line]:
    start = None
    for i, ln in enumerate(lines):
        if ln.page == page and ln.size > 30 and ln.text == name:
            start = i
            break
    if start is None:
        raise LookupError(f"sin título para {name}")
    end = len(lines)
    for i in range(start + 1, len(lines)):
        ln = lines[i]
        if ln.size > 30 and ln.text in [c for c, _ in CLASSES51]:
            end = i
            break
        if ln.size > 23 and ln.text.startswith("Más allá"):
            end = i
            break
    return lines[start + 1:end]


ATTR_LABELS = ("Dados de Golpe", "Puntos de golpe", "Armadura", "Armas", "Herramientas",
               "Tiradas de salvación", "Habilidades")


def attr_label(text: str) -> str | None:
    for lab in ATTR_LABELS:
        if text.startswith(lab) and ":" in text[: len(lab) + 30]:
            return lab
    return None


def collect_attrs(body: list[Line]) -> tuple[list[Line], list[Line], set[int]]:
    """Líneas de "Puntos de golpe" y "Competencias" estén donde estén."""
    pitch = page_pitch(body)
    points: list[Line] = []
    comps: list[Line] = []
    used: set[int] = set()
    i = 0
    while i < len(body):
        ln = body[i]
        lab = attr_label(ln.text)
        if not lab:
            i += 1
            continue
        target = points if lab in ("Dados de Golpe", "Puntos de golpe") else comps
        target.append(ln)
        used.add(id(ln))
        j = i + 1
        while j < len(body):
            nx = body[j]
            if (target[-1].text.rstrip().endswith((".", ";", ":"))
                    or (nx.page, nx.col) != (ln.page, ln.col) or 15.5 <= nx.size <= 30
                    or nx.size <= 13.6 or nx.text.startswith("•")
                    or adjust_gap(nx.y - body[j - 1].y) > pitch * 1.35
                    or adjust_gap(nx.y - body[j - 1].y) <= 0):
                break
            target.append(nx)
            used.add(id(nx))
            j += 1
        i = j
    return points, comps, used


def adjust_gap(gap: float) -> float:
    return gap if gap > 0 else 0.0


def build51(name: str, page: int, lines: list[Line], next_page: int):
    spec = SPEC51[name]
    pages = set(range(page, next_page))
    body = span51(lines, name, page)
    rows, warns, tbl_used = parse_table(lines, pages, T51_TABLE_MAX, spec)
    extra_names = list(rows[0]["extras"].keys()) if rows else []
    body = [ln for ln in body if id(ln) not in tbl_used]

    trait_levels: dict[str, list[int]] = {}
    for r in rows:
        for chunk in " ".join(r["text"]).split(","):
            base = re.sub(r"\s*\(.*\)$", "", chunk).strip()
            if base and base != "—":
                trait_levels.setdefault(base, []).append(r["level"])

    nodes: list[dict] = []
    cur: dict | None = None
    skip_table = False
    caption = f"El {name.lower()}"
    for ln in body:
        if skip_table:
            if ln.size <= 13.6:
                continue
            skip_table = False
        if near(ln.size, T51_CAPTION) and ln.text == caption:
            skip_table = True
            continue
        heading = (near(ln.size, T51_SECTION) or near(ln.size, T51_TRAIT)
                   or near(ln.size, T51_SUB) or near(ln.size, T51_CAPTION))
        if heading:
            # un título puede ocupar dos líneas ("...: Expulsar Muertos" / "Vivientes")
            if (cur is not None and not cur["lines"] and abs(cur["size"] - ln.size) < 0.4
                    and (cur["page"], cur["col"]) == (ln.page, ln.col)
                    and 0 < ln.y - cur["y"] < 20):
                cur["title"] += " " + ln.text
                cur["y"] = ln.y
                continue
            level = 2 if near(ln.size, T51_SECTION) else 3 if near(ln.size, T51_TRAIT) else 4
            if near(ln.size, T51_CAPTION):
                level = 5
            cur = {"level": level, "title": ln.text, "lines": [], "size": ln.size,
                   "y": ln.y, "page": ln.page, "col": ln.col}
            nodes.append(cur)
        elif cur is not None:
            cur["lines"].append(ln)

    puntos, comps, used_ids = collect_attrs(body)
    for nd in nodes:
        nd["lines"] = [l for l in nd["lines"] if id(l) not in used_ids]

    equipo = next((nd for nd in nodes if nd["title"] == "Equipo"), None)
    # el bloque de Equipo puede arrastrar texto posterior: se corta en la última viñeta
    if equipo is not None:
        head: list[Line] = []
        started = False
        for k, l in enumerate(equipo["lines"]):
            head.append(l)
            if l.text.startswith("•"):
                started = True
            if started and l.text.rstrip().endswith((".", ";")) and (
                    k + 1 >= len(equipo["lines"])
                    or not equipo["lines"][k + 1].text.startswith("•")):
                break
        tail = equipo["lines"][len(head):]
        equipo["lines"] = head
        if tail:
            k = nodes.index(equipo)
            prev_node = nodes[k - 1] if k else None
            if prev_node is not None and prev_node["level"] in (3, 4):
                prev_node["lines"] = prev_node["lines"] + tail
            elif k + 1 < len(nodes):
                nodes[k + 1]["lines"] = tail + nodes[k + 1]["lines"]

    attr_nodes = [nd for nd in nodes if nd is equipo]

    items: list[tuple[str, str]] = []
    for nd in attr_nodes:
        items.extend(attribute_items(nd["lines"]))
    front = front51(items + attribute_items(puntos) + attribute_items(comps), page)
    front["name"] = name

    out: list[str] = ["## Atributos básicos", ""]
    if puntos:
        out += ["### Puntos de golpe", ""] + _attr_bullets(attribute_items(puntos)) + [""]
    if comps:
        out += ["### Competencias", ""] + _attr_bullets(attribute_items(comps)) + [""]
    if equipo is not None:
        out += ["### Equipo", ""] + _attr_bullets(attribute_items(equipo["lines"])) + [""]
    out += ["## Progresión", "", markdown_table(rows, spec, extra_names), ""]

    prev: dict | None = None
    for nd in nodes:
        if nd["title"] in ("Puntos de golpe", "Competencias"):
            if prev is not None and nd["lines"]:
                prev["lines"] = prev["lines"] + nd["lines"]
            continue
        prev = nd

    section = ""
    for nd in nodes:
        if nd is equipo or nd["title"] in ("Puntos de golpe", "Competencias"):
            continue
        if nd["level"] == 2:
            out += [f"## {nd['title']}", ""]
            section = nd["title"]
            add_paras(out, nd["lines"])
            continue
        if nd["level"] == 3:
            lv = trait_levels.get(nd["title"], [])
            if not lv:
                m = re.search(r"nivel (\d+)", " ".join(prose(nd["lines"])))
                lv = [int(m.group(1))] if m else []
            if lv:
                if section != "Rasgos de clase":
                    out += ["## Rasgos de clase", ""]
                    section = "Rasgos de clase"
                out.append(f"### {nd['title']} ({_fmt_levels(lv)})")
            else:
                if section != "Subclases":
                    out += ["## Subclases", ""]
                    section = "Subclases"
                out.append(f"### {nd['title']}")
            out.append("")
            add_paras(out, nd["lines"])
            continue
        if nd["level"] == 4:
            title = nd["title"]
            if section == "Subclases":
                m = re.search(r"nivel (\d+)", " ".join(prose(nd["lines"])))
                if m:
                    title = f"{title} ({_fmt_levels([int(m.group(1))])})"
                out.append(f"#### {title}")
            elif section == "Rasgos de clase":
                out.append(f"#### {title}")
            else:
                out.append(f"### {title}")
            out.append("")
            add_paras(out, nd["lines"])
            continue
        out += [f"#### {nd['title']}", ""] + _small_table(nd["lines"]) + [""]
    return front, "\n".join(out).strip() + "\n", rows, warns


# --------------------------------------------------------------------------
# 5.2
# --------------------------------------------------------------------------
def span52(lines: list[Line], name: str, page: int) -> list[Line]:
    start = None
    for i, ln in enumerate(lines):
        if ln.page == page and near(ln.size, 21.5, 0.6) and ln.text == name:
            start = i
            break
    if start is None:
        raise LookupError(f"sin título para {name}")
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if near(lines[i].size, 21.5, 0.6) and lines[i].text in [c for c, _ in CLASSES52]:
            end = i
            break
    return lines[start + 1:end]


def attribute_box52(raw: list[Line], page: int) -> list[tuple[str, str]]:
    """Caja de atributos de 5.2: dos columnas (etiqueta | valor)."""
    i0 = None
    for i, ln in enumerate(raw):
        if ln.page == page and ln.text.startswith("Atributos básicos de"):
            i0 = i
            break
    if i0 is None:
        return []
    seg: list[Line] = []
    for ln in raw[i0 + 1:]:
        if ln.size > 12.6:
            break
        seg.append(ln)
    xs = sorted(l.x for l in seg)
    mid = (xs[0] + xs[-1]) / 2
    left = [l for l in seg if l.x < mid]
    right = [l for l in seg if l.x >= mid]
    labels: list[tuple[float, list[str]]] = []
    for l in left:
        if not l.text:
            continue
        if labels and l.y - labels[-1][0] <= 13:
            labels[-1][1].append(l.text)
        else:
            labels.append((l.y, [l.text]))
    out: list[tuple[str, str]] = []
    for k, (y, parts) in enumerate(labels):
        y_next = labels[k + 1][0] if k + 1 < len(labels) else 10_000
        vals = [l.text for l in right if y - 2 <= l.y < y_next - 2]
        out.append((" ".join(parts).strip(), _join(vals)))
    return out


def build52(name: str, page: int, lines: list[Line], raw: list[Line], next_page: int):
    pages = set(range(page, next_page))
    body = span52(lines, name, page)
    rows, warns, _ = parse_table(lines, pages, T52_TABLE_MAX, {"strip_trailing": True})

    nodes: list[dict] = []
    cur: dict | None = None
    skip_list = False
    i = 0
    while i < len(body):
        ln = body[i]
        if near(ln.size, T52_SECTION) and ln.text.startswith("Subclase de"):
            name2 = body[i + 1].text if i + 1 < len(body) else ""
            cur = {"level": 3, "title": name2, "lines": []}
            nodes.append(cur)
            i += 2
            continue
        if near(ln.size, T52_SECTION):
            if ln.text.startswith("Lista de conjuros"):
                skip_list = True
                i += 1
                continue
            skip_list = False
            cur = {"level": 2, "title": ln.text, "lines": []}
            nodes.append(cur)
            i += 1
            continue
        if near(ln.size, T52_TRAIT) and not skip_list:
            m = TRAIT52_RE.match(ln.text)
            if m:
                cur = {"level": 4, "title": m.group(2), "num": int(m.group(1)), "lines": []}
            else:
                cur = {"level": 5, "title": ln.text, "lines": []}
            nodes.append(cur)
            i += 1
            continue
        if skip_list:
            i += 1
            continue
        if cur is not None:
            cur["lines"].append(ln)
        i += 1

    by_level: dict[int, list[str]] = {}
    for nd in nodes:
        if nd["level"] == 4:
            by_level.setdefault(nd["num"], []).append(nd["title"])
    for r in rows:
        names = by_level.get(r["level"])
        if names:
            r["text"] = [", ".join(names)]

    attrs = attribute_box52(raw, page)
    ad = {k.lower(): v for k, v in attrs}
    hit = ""
    m = re.search(r"1d(\d+)", ad.get("dado de puntos de golpe", ""))
    if m:
        hit = "d" + m.group(1)
    saves = [s.strip() for s in re.split(r",| y ", ad.get("competencias en tiradas de salvación", ""))
             if s.strip()]
    front = {
        "name": name,
        "hitDie": hit,
        "primaryAbility": ad.get("característica principal", ""),
        "saves": saves,
        "skillChoices": ad.get("competencias en habilidades", ""),
        "armor": ad.get("entrenamiento con armaduras", ""),
        "weapons": ad.get("competencias con armas", ""),
        "tools": ad.get("competencias con herramientas", ""),
        "srd": "5.2",
        "page": page,
    }

    out: list[str] = ["## Atributos básicos", ""]
    out += [f"- **{k}:** {v}" for k, v in attrs if k and v]
    out.append("")
    out += ["## Progresión", "", markdown_table(rows, {}, []), ""]

    section = ""
    for nd in nodes:
        if nd["level"] == 2:
            title = nd["title"]
            if title.lower().startswith("convertirse en"):
                title = "Cómo convertirse en " + title.split(" en ", 1)[-1]
            elif title.lower().startswith("rasgos de clase de"):
                title = "Rasgos de clase"
            out += [f"## {title}", ""]
            section = title
            add_paras(out, nd["lines"])
            continue
        if nd["level"] == 3:
            if section != "Subclases":
                out += ["## Subclases", ""]
                section = "Subclases"
            out += [f"### {nd['title']}", ""]
            add_paras(out, nd["lines"])
            continue
        if nd["level"] == 4:
            if section == "Subclases":
                out.append(f"#### {nd['title']} (nivel {nd['num']})")
            else:
                out += ["### " + nd["title"] + f" (nivel {nd['num']})", ""]
            add_paras(out, nd["lines"])
            continue
        out.append(f"### {nd['title']}")
        out.append("")
        add_paras(out, nd["lines"])
    return front, "\n".join(out).strip() + "\n", rows, warns


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def run(ed: str, only: str | None = None, write: bool = True) -> dict:
    classes = CLASSES51 if ed == "51" else CLASSES52
    table = T51_TABLE_MAX if ed == "51" else T52_TABLE_MAX
    path = WORK / f"e{ed}.jsonl"
    raw = load(path)
    lines = merge_same_baseline(raw)
    folder = DATA / f"ed{ed}" / "clases"
    taken: set[str] = set()
    report = {"ed": ed, "classes": [], "warns": []}
    for i, (name, page) in enumerate(classes):
        next_page = classes[i + 1][1] if i + 1 < len(classes) else (56 if ed == "51" else 115)
        if ed == "51":
            front, body, rows, warns = build51(name, page, lines, next_page)
        else:
            front, body, rows, warns = build52(name, page, lines, next_page, raw)
        n_sub = body.count("\n### ") if "## Subclases" in body else 0
        sub_block = body.split("## Subclases", 1)[1] if "## Subclases" in body else ""
        subs = re.findall(r"^### (.+)$", sub_block, re.M)
        traits = len(re.findall(r"^### .+ \(nivel(?:es)? ", body, re.M))
        if len(rows) != 20:
            warns.append(f"filas={len(rows)}")
        if write:
            p = unique_path(folder, slug(name), taken)
            write_entry(p, front, body)
        else:
            p = Path("/dev/null")
        report["classes"].append({
            "name": name, "file": str(p), "rows": len(rows),
            "traits": traits, "subclasses": subs, "warns": warns,
        })
        for w in warns:
            report["warns"].append(f"{ed} {name}: {w}")
    return report


def main(argv: list[str]) -> int:
    only = None
    write = "--dry" not in argv
    if "--only" in argv:
        only = argv[argv.index("--only") + 1]
    eds = ["51", "52"]
    if "--ed" in argv:
        eds = [argv[argv.index("--ed") + 1]]
    for ed in eds:
        rep = run(ed, only, write)
        for c in rep["classes"]:
            print(f"{ed} {c['name']:<12} filas={c['rows']:<3} rasgos={c['traits']:<3} "
                  f"subclases={len(c['subclasses'])} {c['warns'] or ''}")
            if "--debug" in argv:
                print("    " + ", ".join(c["subclasses"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
