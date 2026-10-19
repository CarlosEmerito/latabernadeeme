"""Extracción de monstruos de los SRD en español (5.1 y 5.2)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .stream import Line, paragraphs

TYPES = (
    "Aberración",
    "Autómata",
    "Bestia",
    "Celestial",
    "Cieno",
    "Dragón",
    "Elemental",
    "Enjambre",
    "Feérico",
    "Infernal",
    "Gigante",
    "Humanoide",
    "Monstruosidad",
    "Muerto viviente",
    "Planta",
    "Semidiós",
)

SIZES = ("Diminuto", "Diminuta", "Pequeño", "Pequeña", "Mediano", "Mediana", "Grande", "Enorme", "Gigante")

TYPE_RE = re.compile(
    r"^(?:Enjambre de\s+)?(?:"
    + "|".join(TYPES)
    + r")\s+(?:"
    + "|".join(SIZES)
    + r")\b"
)

CR_RE = re.compile(r"^(?:Desafío|VD):\s*(?P<cr>[^()]+?)\s*\((?P<xp>[^)]*)\)")

STAT_LABELS = (
    "Tiradas de salvación:",
    "Habilidades:",
    "Resistencia a daño:",
    "Inmunidad a daño:",
    "Inmunidad a estados:",
    "Vulnerabilidad a daño:",
    "Sentidos:",
    "Idiomas:",
    "PG:",
    "Desafío:",
    "VD:",
    "Competencia:",
    "Equipo:",
    "Iniciativa:",
)

FIELD_BY_LABEL = {
    "Tiradas de salvación": "saves",
    "Habilidades": "skills",
    "Resistencia a daño": "resistances",
    "Inmunidad a daño": "immunities",
    "Inmunidad a estados": "condition_immunities",
    "Vulnerabilidad a daño": "vulnerabilities",
    "Sentidos": "senses",
    "Idiomas": "languages",
    "Competencia": "proficiency",
    "Equipo": "gear",
}

SECTION_HEADS = {
    "Acciones": "actions",
    "Acciones adicionales": "bonus_actions",
    "Reacciones": "reactions",
    "Acciones legendarias": "legendary",
    "Acciones de guarida": "lair",
    "Efectos de guarida": "lair",
    "Rasgos": "traits",
    "Atributos": "traits",
}

ABILITY_LINE_RE = re.compile(r"(Fue|Des|Con|Int|Sab|Car)\s*(-?\d+)\s*([+−-]\d+)")


@dataclass
class Monster:
    name: str
    type_line: str
    size: str = ""
    kind: str = ""
    tags: str = ""
    alignment: str = ""
    ac: str = ""
    hp: str = ""
    speed: str = ""
    initiative: str = ""
    abilities: dict[str, int] = field(default_factory=dict)
    saves: str = ""
    skills: str = ""
    resistances: str = ""
    immunities: str = ""
    condition_immunities: str = ""
    vulnerabilities: str = ""
    senses: str = ""
    languages: str = ""
    gear: str = ""
    cr: str = ""
    xp: str = ""
    proficiency: str = ""
    traits: list[tuple[str, str]] = field(default_factory=list)
    actions: list[tuple[str, str]] = field(default_factory=list)
    bonus_actions: list[tuple[str, str]] = field(default_factory=list)
    reactions: list[tuple[str, str]] = field(default_factory=list)
    legendary: list[tuple[str, str]] = field(default_factory=list)
    lair: list[tuple[str, str]] = field(default_factory=list)
    page: int = 0


def is_header(lines: list[Line], i: int) -> bool:
    if i + 1 >= len(lines):
        return False
    head, nxt = lines[i], lines[i + 1]
    if TYPE_RE.match(head.text.strip()):
        return False
    return bool(TYPE_RE.match(nxt.text.strip())) and len(head.text) < 70


def _split_type(text: str) -> tuple[str, str, str, str]:
    m = re.match(
        r"^(?P<kind>(?:Enjambre de\s+)?(?:"
        + "|".join(TYPES)
        + r"))\s+(?P<size>(?:"
        + "|".join(SIZES)
        + r"))\s*(?:\((?P<tags>[^)]*)\))?\s*,?\s*(?P<align>.*)$",
        text,
    )
    if not m:
        return "", "", "", text
    return m.group("kind"), m.group("size"), m.group("tags") or "", m.group("align").strip(" ,")


def _split_feature(text: str) -> tuple[str, str]:
    """Separa 'Nombre. texto' en (nombre, texto)."""
    m = re.match(r"^([^.:]{2,70})\.\s+(.*)$", text, re.S)
    if m and not m.group(1).lower().startswith(("por ejemplo", "es decir")):
        return m.group(1).strip(), m.group(2).strip()
    return "", text.strip()


def _between(text: str, start: str, stops: tuple[str, ...]) -> str:
    idx = text.find(start)
    if idx < 0:
        return ""
    rest = text[idx + len(start) :].strip(" :")
    for stop in stops:
        cut = rest.find(stop)
        if cut > 0:
            rest = rest[:cut]
    return rest.strip(" ,;")


ALL_LABELS = STAT_LABELS + ("Clase de Armadura:", "CA:", "Puntos de golpe:", "Velocidad:")


def join_dangling_labels(lines: list[Line]) -> list[Line]:
    """Une 'Clase de Armadura:' con el valor de la línea siguiente."""
    out: list[Line] = []
    i = 0
    while i < len(lines):
        cur = lines[i]
        if cur.text.rstrip().endswith(":") and i + 1 < len(lines):
            nxt = lines[i + 1]
            if not any(nxt.text.startswith(lbl) for lbl in ALL_LABELS) and nxt.text[:1].isdigit():
                out.append(Line(cur.page, cur.col, cur.x, cur.y, cur.size, f"{cur.text} {nxt.text}".strip()))
                i += 2
                continue
        out.append(cur)
        i += 1
    return out


def merge_continuations(lines: list[Line]) -> list[Line]:
    """Une las líneas de continuación de las etiquetas del perfil.

    El PDF parte los valores largos ("Clase de Armadura: 11 en forma
    humanoide, 12" + "(armadura natural) en formas de lobo...") y también la
    línea de tipo de la criatura.
    """
    out: list[Line] = []
    i = 0
    while i < len(lines):
        cur = lines[i]
        text = cur.text.rstrip()
        if any(text.startswith(lbl) for lbl in ALL_LABELS) or TYPE_RE.match(text):
            j = i + 1
            while j < len(lines):
                nxt = lines[j].text.strip()
                if (
                    nxt[:1].islower() or nxt.startswith("(")
                ) and not any(nxt.startswith(lbl) for lbl in ALL_LABELS) and len(nxt) < 90:
                    text = f"{text} {nxt}"
                    j += 1
                    continue
                break
            out.append(Line(cur.page, cur.col, cur.x, cur.y, cur.size, text))
            i = j
            continue
        out.append(cur)
        i += 1
    return out


def _parse_abilities(blob: str) -> dict[str, int]:
    keys = ("fue", "des", "con", "int", "sab", "car")
    # Formato 5.1: "21 (+5) 9 (−1) 15 (+2) ..."
    vals = re.findall(r"(-?\d+)\s*\(([+−-]\d+)\)", blob)
    if len(vals) == 6:
        return {k: int(v[0]) for k, v in zip(keys, vals)}
    # Formato 5.2: "F 21 +5 +5 D 9 −1 +3 ..." (puntuación, salvación, habilidad)
    triples = re.findall(r"(?<![+\d−-])(\d{1,2})\s+([+−]?\d{1,2})\s+([+−]?\d{1,2})", blob)
    if len(triples) == 6:
        return {k: int(t[0]) for k, t in zip(keys, triples)}
    mods = ABILITY_LINE_RE.findall(blob)
    if len(mods) >= 6:
        return {k.lower(): int(v) for k, v, _ in mods[:6]}
    return {}


def parse(lines: list[Line]) -> list[Monster]:
    lines = merge_continuations(join_dangling_labels(lines))
    monsters: list[Monster] = []
    i = 0
    while i < len(lines):
        if not is_header(lines, i):
            i += 1
            continue

        head, type_line = lines[i], lines[i + 1]
        m = Monster(name=head.text.strip(), type_line=type_line.text.strip(), page=head.page)
        m.kind, m.size, m.tags, m.alignment = _split_type(m.type_line)

        # Bloque de datos: desde CA hasta la primera etiqueta de habilidades.
        j = i + 2
        hdr: list[str] = []
        while j < len(lines) and not is_header(lines, j):
            text = lines[j].text.strip()
            if text.startswith(("Habilidades:", "Tiradas de salvación:", "Sentidos:", "Resistencia a daño:", "Inmunidad a daño:", "Inmunidad a estados:", "Vulnerabilidad a daño:", "Idiomas:", "Desafío:", "VD:")):
                break
            if text in SECTION_HEADS:
                break
            hdr.append(text)
            j += 1

        blob = " ".join(hdr)
        m.ac = _between(blob, "Clase de Armadura:", ("Iniciativa:", "PG:", "Puntos de golpe:", "Velocidad:")) or _between(
            blob, "CA:", ("Iniciativa:", "PG:", "Puntos de golpe:", "Velocidad:")
        )
        m.initiative = _between(blob, "Iniciativa:", ("PG:", "Puntos de golpe:", "Velocidad:"))
        m.hp = _between(blob, "Puntos de golpe:", ("Velocidad:",)) or _between(blob, "PG:", ("Velocidad:",))
        m.speed = _between(blob, "Velocidad:", ("MOD. SALV.", "FUE ", "Fue "))
        if not m.speed and "Velocidad:" in blob:
            m.speed = re.split(r"\s(?:MOD\.|FUE|[FDCIS]\s\d)", _between(blob, "Velocidad:", ()))[0]
        m.abilities = _parse_abilities(blob)

        # Resto del perfil: etiquetas de datos y rasgos/acciones.
        body: list[Line] = []
        last_field = ""
        while j < len(lines) and not is_header(lines, j):
            text = lines[j].text.strip()
            matched = False
            for label in STAT_LABELS:
                if text.startswith(label):
                    key = label.rstrip(":")
                    if key in FIELD_BY_LABEL:
                        last_field = FIELD_BY_LABEL[key]
                        setattr(m, last_field, _between(text, label, ()))
                    elif key == "PG":
                        last_field = ""
                        m.hp = m.hp or _between(text, "PG:", ("Velocidad:",))
                        if "Velocidad:" in text and not m.speed:
                            m.speed = _between(text, "Velocidad:", ())
                    else:
                        last_field = ""
                        mm = CR_RE.match(text)
                        if mm:
                            m.cr = mm.group("cr").strip()
                            m.xp = mm.group("xp").strip()
                        else:
                            m.cr = _between(text, label, ())
                    matched = True
                    break
            if matched:
                j += 1
                continue
            if last_field and text[:1].islower():
                # Continuación de un campo largo (idiomas, sentidos...).
                setattr(m, last_field, f"{getattr(m, last_field)} {text}".strip())
                j += 1
                continue
            last_field = ""
            body.append(lines[j])
            j += 1

        current = "traits"
        for para in paragraphs(body):
            text = para.strip()
            if text in SECTION_HEADS:
                current = SECTION_HEADS[text]
                continue
            name, detail = _split_feature(text)
            if name:
                getattr(m, current).append((name, detail))

        monsters.append(m)
        i = j
    return monsters
