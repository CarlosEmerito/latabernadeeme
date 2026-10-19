"""Escritura de las entidades extraídas como ficheros Markdown."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"


def slug(text: str) -> str:
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.lower().replace("ñ", "n")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def write_entry(path: Path, front: dict, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    meta = yaml.safe_dump(front, allow_unicode=True, sort_keys=False, width=1000).strip()
    path.write_text(f"---\n{meta}\n---\n\n{body.strip()}\n", encoding="utf-8")


def unique_path(folder: Path, base: str, taken: set[str]) -> Path:
    name = base
    n = 2
    while name in taken:
        name = f"{base}-{n}"
        n += 1
    taken.add(name)
    return folder / f"{name}.md"


def clean_paragraph(p: str) -> str:
    p = p.replace("\u00ad", "")
    p = re.sub(r"\s+([,;:.])", r"\1", p)
    p = re.sub(r"[ \t]{2,}", " ", p)
    return p.strip()


def spell_body(text: str) -> str:
    parts = [clean_paragraph(p) for p in text.split("\n\n") if p.strip()]
    out: list[str] = []
    for p in parts:
        if p.startswith("A niveles superiores."):
            out.append("## A niveles superiores\n\n" + p[len("A niveles superiores.") :].strip())
        elif p.startswith("A niveles superiores"):
            out.append("## A niveles superiores\n\n" + p[len("A niveles superiores") :].strip(" .:"))
        else:
            out.append(p)
    return "\n\n".join(out)


def monster_body(m) -> str:
    out: list[str] = []
    for title, items in (
        ("Rasgos", m.traits),
        ("Acciones", m.actions),
        ("Acciones adicionales", m.bonus_actions),
        ("Reacciones", m.reactions),
        ("Acciones legendarias", m.legendary),
        ("Acciones de guarida", m.lair),
    ):
        if not items:
            continue
        out.append(f"## {title}")
        for name, detail in items:
            out.append(f"**{name}.** {clean_paragraph(detail)}")
    return "\n\n".join(out)
