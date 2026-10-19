"""Extracción de conjuros de los SRD en español (5.1 y 5.2)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .stream import PROP_LABELS, Line, paragraphs

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

SCHOOL_51 = re.compile(
    r"^(?P<school>" + "|".join(SCHOOLS) + r")\s+(?P<level>nivel \d+|\(truco\))(?P<ritual>\s*\(ritual\))?$"
)
SCHOOL_52 = re.compile(
    r"^(?P<school>" + "|".join(SCHOOLS) + r")\s+de nivel (?P<level>\d+)\s*(?:\((?P<classes>[^)]*)\))?$"
)
CANTRIP_52 = re.compile(r"^Truco de (?P<school>[a-záéíóúñ]+)\s*(?:\((?P<classes>[^)]*)\))?$")

LEVEL_WORDS = {f"nivel {n}": n for n in range(10)}

CLASS_NAMES = {
    "bárbaro": "Bárbaro",
    "bardo": "Bardo",
    "brujo": "Brujo",
    "clérigo": "Clérigo",
    "druida": "Druida",
    "explorador": "Explorador",
    "guerrero": "Guerrero",
    "hechicero": "Hechicero",
    "mago": "Mago",
    "monje": "Monje",
    "paladín": "Paladín",
    "pícaro": "Pícaro",
}


@dataclass
class Spell:
    name: str
    level: int
    school: str
    ritual: bool
    casting_time: str
    range: str
    components: str
    duration: str
    body: str
    page: int
    classes: list[str] = field(default_factory=list)


def _title_class(name: str) -> str:
    key = name.strip().lower()
    return CLASS_NAMES.get(key, name.strip().capitalize())


SCHOOL_START = re.compile(
    r"^(?:" + "|".join(SCHOOLS) + r")\s+(?:de nivel \d+|nivel \d+|nivel \d+ \()|^Truco de "
)


def _looks_like_school_start(text: str) -> bool:
    return bool(SCHOOL_START.match(text)) or bool(_match_school(text))


def _match_school(line: str) -> re.Match | None:
    return SCHOOL_51.match(line) or SCHOOL_52.match(line) or CANTRIP_52.match(line)


def _extract_props(block: list[Line]) -> dict[str, str]:
    """Reparte las propiedades del encabezado, que llegan partidas en líneas."""
    joined = " ".join(l.text for l in block)
    props: dict[str, str] = {}
    positions = []
    for lbl in PROP_LABELS:
        idx = joined.find(lbl)
        if idx >= 0:
            positions.append((idx, lbl))
    positions.sort()
    for n, (idx, lbl) in enumerate(positions):
        end = positions[n + 1][0] if n + 1 < len(positions) else len(joined)
        value = joined[idx + len(lbl) : end].strip(" :,;")
        props[lbl.rstrip(":")] = re.sub(r"\s+", " ", value).strip()
    return props


def _classes_from(m: re.Match) -> list[str]:
    raw = m.groupdict().get("classes") or ""
    return [_title_class(c) for c in raw.split(",") if c.strip()]


def parse(lines: list[Line]) -> list[Spell]:
    spells: list[Spell] = []
    i = 0
    while i < len(lines) - 1:
        head = lines[i]
        school_line = lines[i + 1].text.strip()
        extra = 0
        # La lista de clases puede venir partida en dos o tres líneas.
        while (
            school_line.count("(") > school_line.count(")")
            or school_line.rstrip().endswith(",")
        ) and i + 2 + extra < len(lines) and extra < 3:
            school_line = f"{school_line} {lines[i + 2 + extra].text.strip()}"
            extra += 1
        m = _match_school(school_line)
        if not m or len(head.text) > 70:
            i += 1
            continue

        groups = m.groupdict()
        if groups.get("level") == "(truco)" or school_line.startswith("Truco de"):
            level = 0
        else:
            raw_level = groups.get("level", "")
            level = int(raw_level) if raw_level.isdigit() else LEVEL_WORDS.get(raw_level, 0)
        school = groups.get("school", "").capitalize()
        if school.lower().startswith("nigromancia") or school.lower() == "necromancia":
            school = "Nigromancia"

        j = i + 2 + extra
        prop_lines: list[Line] = []
        while j < len(lines) and len(prop_lines) < 16:
            prop_lines.append(lines[j])
            props = _extract_props(prop_lines)
            if len(props) >= 4 and all(
                props.get(k) for k in ("Tiempo de lanzamiento", "Alcance", "Componentes", "Duración")
            ):
                break
            j += 1
        else:
            i += 1
            continue
        props = _extract_props(prop_lines)
        if len(props) < 4:
            i += 1
            continue
        j += 1

        body_lines: list[Line] = []
        while j < len(lines) - 1:
            nxt = lines[j + 1].text.strip()
            if _looks_like_school_start(nxt):
                break
            body_lines.append(lines[j])
            j += 1

        body = paragraphs(body_lines)
        body = [
            re.sub(r"^A niveles superiores\.?\s*", "## A niveles superiores\n\n", p) for p in body
        ]
        casting = props.get("Tiempo de lanzamiento", "")
        spells.append(
            Spell(
                name=head.text.strip(),
                level=level,
                school=school,
                ritual=("ritual" in casting.lower()) or bool(groups.get("ritual")),
                casting_time=casting,
                range=props.get("Alcance", ""),
                components=props.get("Componentes", ""),
                duration=props.get("Duración", ""),
                body="\n\n".join(body),
                page=head.page,
                classes=_classes_from(m) if groups.get("classes") else [],
            )
        )
        i = j
    return spells
