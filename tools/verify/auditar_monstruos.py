#!/usr/bin/env python3
"""Auditoría de los perfiles de monstruo: completitud, campos y fidelidad.

Uso:
    .venv-ingest/bin/python tools/verify/auditar_monstruos.py [--verbose]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parents[2]
DATOS = RAIZ / "data"
WORK = RAIZ / ".cache" / "srd" / "work"

CAMPOS = ("size", "type", "alignment", "ac", "hp", "speed", "cr")
ABIL = ("fue", "des", "con", "int", "sab", "car")


def norm(t: str) -> str:
    t = re.sub(r"\*\*|##", "", t)
    t = re.sub(r"\s+", " ", t)
    # El PDF parte palabras al final de línea («des- garro»): se recomponen
    # para poder comparar el texto con el original.
    t = re.sub(r"(?<=\w)-\s+(?=\w)", "", t)
    return t.strip()


def leer(p: Path):
    s = p.read_text(encoding="utf-8")
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?", s)
    return yaml.safe_load(m.group(1)) or {}, s[m.end() :]


def main() -> int:
    verbose = "--verbose" in sys.argv
    for ed, flujo in (("ed51", "e51.jsonl"), ("ed52", "e52.jsonl")):
        doc = norm(" ".join(l.text for l in _lineas(flujo)))
        carpeta = DATOS / ed / "monstruos"
        ficheros = sorted(carpeta.glob("*.md"))
        problemas = {"sin campos": [], "habilidades": [], "sin acciones": [], "no literal": [], "cuerpo corto": []}
        for f in ficheros:
            d, cuerpo = leer(f)
            nombre = str(d.get("name", f.stem))
            faltan = [c for c in CAMPOS if d.get(c) in (None, "", [])]
            if faltan:
                problemas["sin campos"].append((nombre, faltan))
            ab = d.get("abilities") or {}
            if set(ab) != set(ABIL) or any(not isinstance(ab.get(k), int) for k in ABIL):
                problemas["habilidades"].append(nombre)
            if "## Acciones" not in cuerpo:
                problemas["sin acciones"].append(nombre)
            # Se compara el primer rasgo, sin las cabeceras que añade el
            # conversor (`## Rasgos`, `## Acciones`…), que no están en el PDF.
            plano = "\n".join(l for l in cuerpo.splitlines() if not l.startswith("#"))
            texto = norm(plano)
            if len(texto) < 60:
                problemas["cuerpo corto"].append(nombre)
            elif texto[:60] not in doc:
                problemas["no literal"].append(nombre)

        total = len(ficheros)
        print(f"\n=== {ed}: {total} fichas")
        for k, v in problemas.items():
            print(f"  {k}: {len(v)}")
            if v and verbose:
                for x in v[:15]:
                    print("     -", x)
            elif v:
                print("     ", v[:6], "…" if len(v) > 6 else "")


def _lineas(fichero: str):
    sys.path.insert(0, str(RAIZ / "tools" / "ingest"))
    from srd import stream

    return stream.load(WORK / fichero)


if __name__ == "__main__":
    raise SystemExit(main())
