"""Extrae los objetos mágicos de los SRD 5.1 y 5.2 a data/ed5x/objetos/*.md."""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from srd import items as items_mod  # noqa: E402
from srd.stream import load  # noqa: E402
from rutas import WORK  # noqa: E402
from write_data import DATA, slug, unique_path, write_entry  # noqa: E402

EDITIONS = {
    "5.1": {
        "jsonl": WORK / "e51.jsonl",
        "plain": WORK / "es51.txt",
        "start": "Objetos mágicos de la A a la Z",
        "end": "Objetos mágicos",
        "name_min": 15.5,
        "extra": ("Artefactos", "Monstruos", 270),
    },
    "5.2": {
        "jsonl": WORK / "e52.jsonl",
        "plain": WORK / "es52.txt",
        "start": "Objetos mágicos de la A",
        "end": "Monstruos",
        "name_min": 14.0,
    },
}


def plain_section(path: Path, start: str, end: str) -> str:
    """Recorta el capítulo usando líneas completas como marcas."""
    lines = path.read_text(encoding="utf-8", errors="replace").split("\n")
    i = next(n for n, l in enumerate(lines) if l.strip() == start)
    j = next(n for n, l in enumerate(lines) if n > i + 5 and l.strip() == end)
    return "\n".join(lines[i:j])


def section(lines, start: str, end: str, page_min: int):
    i = next(n for n, l in enumerate(lines) if l.text.strip() == start and l.page >= page_min)
    # El arranque puede venir partido en dos líneas ("Objetos mágicos de la A" / "a la Z").
    while lines[i + 1].page == lines[i].page and lines[i + 1].size == lines[i].size:
        i += 1
    for j in range(i + 1, len(lines)):
        if lines[j].text.strip() == end and lines[j].page >= lines[i].page + 10:
            return lines[i + 1 : j]
    raise LookupError(end)


def main() -> None:
    summary = {}
    for ed, cfg in EDITIONS.items():
        lines = load(cfg["jsonl"])
        page_min = 200 if ed == "5.1" else 220
        seg = section(lines, cfg["start"], cfg["end"], page_min)
        items, orphans = items_mod.parse(seg, cfg["name_min"])
        plain = plain_section(cfg["plain"], cfg["start"], cfg["end"])
        extra = cfg.get("extra")
        if extra:
            # La sección "Artefactos" (5.1) va después del listado A-Z y son
            # objetos mágicos de pleno derecho (rareza "artefacto").
            e_start, e_end, e_page = extra
            i = next(
                n
                for n, l in enumerate(lines)
                if l.text.strip() == e_start and l.page >= e_page
            )
            j = next(
                n for n in range(i + 1, len(lines))
                if lines[n].text.strip() == e_end and lines[n].page >= e_page
            )
            more, more_orphans = items_mod.parse(lines[i:j], cfg["name_min"])
            items += more
            orphans += more_orphans
            plain += "\n" + plain_section(cfg["plain"], e_start, e_end)
        bodies = items_mod.plain_bodies(items, plain)
        fallbacks = []
        for n, it in enumerate(items):
            b = bodies[n]
            if b and 40 <= len(b) <= 12000 and not it.has_table:
                it.body = b
            else:
                fallbacks.append((it.name, "tabla" if it.has_table else len(b or "")))
        folder = DATA / f"ed{ed.replace('.', '')}" / "objetos"
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob("*.md"):
            old.unlink()
        taken: set[str] = set()
        written = []
        for it in items:
            base = slug(it.name)
            variant = ""
            if base in taken:
                variant = it.raw_type
                base = slug(f"{it.name} {it.rarity}")
            path = unique_path(folder, base, taken)
            front = {
                "name": it.name,
                "type": it.type,
                "rarity": it.rarity,
                "attunement": it.attunement,
                "srd": ed,
                "page": it.page,
            }
            if variant:
                front["variant"] = variant
            write_entry(path, front, it.body)
            written.append((it.name, path))
        summary[ed] = {
            "count": len(written),
            "orphans": orphans,
            "files": written,
        }
        print(f"{ed}: {len(written)} objetos -> {folder}")
        if fallbacks:
            print("  cuerpo del flujo por coordenadas:", fallbacks)
        for o in orphans:
            print("  AVISO:", o)

    total = sum(s["count"] for s in summary.values())
    print("total:", total)


if __name__ == "__main__":
    main()
