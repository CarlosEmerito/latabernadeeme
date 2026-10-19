#!/usr/bin/env python3
"""Extrae conjuros y monstruos de los dos SRD en español a `data/`."""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from rutas import WORK  # noqa: E402
from srd import monsters, spells, stream  # noqa: E402
from write_data import DATA, monster_body, spell_body, slug, unique_path, write_entry  # noqa: E402

CLASS_RE = re.compile(r"^(?:Conjuros de|Lista de conjuros de)\s+(?P<cls>[A-Za-zÁÉÍÓÚÑáéíóúñ ]+)$")
LEVEL_RE = re.compile(r"^(?:Trucos \(nivel 0\)|Nivel \d+)$")


def class_lists(lines) -> dict[str, list[str]]:
    """Devuelve {conjuro: [clases]} a partir de las listas de clase (SRD 5.1)."""
    start = None
    for i, line in enumerate(lines):
        if line.text.strip() in ("Listas de conjuros", "Listas de conjuros de clases"):
            start = i
            break
    if start is None:
        return {}

    mapping: dict[str, list[str]] = {}
    current_class = ""
    for line in lines[start:]:
        text = line.text.strip()
        if m := CLASS_RE.match(text):
            current_class = m.group("cls").strip().title()
            continue
        if LEVEL_RE.match(text):
            continue
        if not current_class or not text or text.startswith(("Descripciones", "Apéndice", "Listas")):
            if text.startswith(("Descripciones", "Apéndice")):
                break
            continue
        if len(text) > 48 or text[0].islower():
            continue
        mapping.setdefault(text, [])
        if current_class not in mapping[text]:
            mapping[text].append(current_class)
    return mapping


def run_edition(ed: str, stream_file: str, spell_slice, monster_slices) -> None:
    lines = stream.load(WORK / stream_file)
    out = DATA / ed

    lists = class_lists(lines)
    if callable(spell_slice):
        sec = spell_slice(lines)
    else:
        inicio, fin = spell_slice
        sec = stream.slice_between(lines, inicio, (fin,) if isinstance(fin, str) else fin)
    parsed = spells.parse(sec)

    taken: set[str] = set()
    for s in parsed:
        classes = s.classes or sorted(lists.get(s.name, []))
        front = {
            "name": s.name,
            "level": s.level,
            "school": s.school,
            "ritual": s.ritual,
            "concentration": s.duration.lower().startswith(("concentración", "concentracion")),
            "castingTime": s.casting_time,
            "range": s.range,
            "components": s.components,
            "duration": s.duration,
            "classes": classes,
            "srd": ed[2:3] + "." + ed[3:],
            "page": s.page,
        }
        write_entry(unique_path(out / "conjuros", slug(s.name), taken), front, spell_body(s.body))

    taken_m: set[str] = set()
    total_m = 0
    for a, b in monster_slices:
        if b:
            ms = monsters.parse(stream.slice_between(lines, a, (b,)))
        else:
            start = next(i for i, l in enumerate(lines) if l.text.strip() == a)
            ms = monsters.parse(lines[start:])
        print(f'  tramo {a!r} -> {len(ms)}')
        for m in ms:
            front = {
                "name": m.name,
                "size": m.size,
                "type": m.kind,
                "tags": m.tags,
                "alignment": m.alignment,
                "ac": m.ac,
                "hp": m.hp,
                "speed": m.speed,
                "initiative": m.initiative,
                "abilities": m.abilities,
                "saves": m.saves,
                "skills": m.skills,
                "resistances": m.resistances,
                "immunities": m.immunities,
                "conditionImmunities": m.condition_immunities,
                "vulnerabilities": m.vulnerabilities,
                "senses": m.senses,
                "languages": m.languages,
                "cr": m.cr,
                "xp": m.xp,
                "proficiency": m.proficiency,
                "gear": m.gear,
                "srd": ed[2:3] + "." + ed[3:],
                "page": m.page,
            }
            write_entry(unique_path(out / "monstruos", slug(m.name), taken_m), front, monster_body(m))
            total_m += 1

    print(f"{ed}: {len(parsed)} conjuros, {total_m} monstruos, {len(lists)} nombres en listas de clase")


def slice_52_spells(lines):
    i = next(k for k, x in enumerate(lines) if x.text.strip() == "Descripciones de conjuros" and x.page == 118)
    j = next(k for k, x in enumerate(lines) if x.text.strip() == "Glosario de reglas" and x.page == 194)
    return lines[i:j]


def main() -> int:
    run_edition(
        "ed51",
        "e51.jsonl",
        ("Descripciones de conjuros", "Trampas"),
        [
            ("Monstruos (A)", "Apéndice MJ-A:"),
            ("Apéndice MM-A:", "Apéndice MM-B:"),
            ("Apéndice MM-B:", ""),
        ],
    )
    run_edition(
        "ed52",
        "e52.jsonl",
        slice_52_spells,
        [("Monstruos de la A", "")],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
