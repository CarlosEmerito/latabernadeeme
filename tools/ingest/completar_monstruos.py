"""Completa los monstruos que el parser original dejó fuera.

Recorre el capítulo de monstruos del SRD, lo parsea y escribe solo las fichas cuyo
slug no existe todavía en `data/`. Sirve para cerrar huecos detectados por la
auditoría de cobertura (por ejemplo, los dragones ancianos y las criaturas de VD
alto que quedaron fuera de los tramos de extracción).

Uso:
  .venv-ingest/bin/python tools/ingest/completar_monstruos.py --dry-run
  .venv-ingest/bin/python tools/ingest/completar_monstruos.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingest import write_data
from ingest.extract_core import DATA, WORK
from ingest.srd import monsters, stream

TRAMOS = {
    "ed51": ("e51.jsonl", ("Monstruos (A)", "Apéndice MJ-A:")),
    "ed52": ("e52.jsonl", ("Monstruos de la A", "")),
}


def main() -> int:
    dry = "--dry-run" in sys.argv
    total = 0
    for ed, (fichero, (inicio, fin)) in TRAMOS.items():
        lines = stream.load(WORK / fichero)
        if fin:
            trozo = stream.slice_between(lines, inicio, (fin,))
        else:
            i = next(k for k, l in enumerate(lines) if l.text.strip() == inicio)
            trozo = lines[i:]
        parseados = monsters.parse(trozo)
        destino = DATA / ed / "monstruos"
        existentes = {f.stem for f in destino.glob("*.md")}
        nuevos = []
        for m in parseados:
            s = write_data.slug(m.name)
            if s in existentes:
                continue
            nuevos.append((s, m))
            if not dry:
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
                write_data.write_entry(destino / f"{s}.md", front, write_data.monster_body(m))
        print(f"{ed}: {len(parseados)} parseados, {len(nuevos)} nuevos")
        for s, m in nuevos:
            print(f"   + {m.name} (VD {m.cr}, p.{m.page})")
        total += len(nuevos)
    print(f"{'Se añadirían' if dry else 'Añadidos'}: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
