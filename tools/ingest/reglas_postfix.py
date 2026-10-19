#!/usr/bin/env python3
"""Retoques de revisión sobre las reglas extraídas.

El PDF de las ediciones en español tiene las cajas de las palabras corruptas,
así que la geometría de algunas tablas y cuadros solo es fiable a nivel de
palabra. El extractor resuelve casi todos los casos; estos son los que se
revisaron a mano y se reaplican aquí para que no se pierdan al regenerar.

Es idempotente: si el retoque ya está aplicado, no hace nada.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from rutas import DATOS  # noqa: E402

EXHAUSTION = [
    ("1", "Desventaja en pruebas de característica."),
    ("2", "Velocidad reducida a la mitad."),
    ("3", "Desventaja en tiradas de ataque y de salvación."),
    ("4", "Puntos de golpe máximos reducidos a la mitad."),
    ("5", "Velocidad reducida a 0."),
    ("6", "Muerte."),
]

ABBREVIATIONS = [
    ("BC", "Bonificador por competencia"),
    ("C", "Concentración"),
    ("Car", "Carisma"),
    ("CA", "Clase de armadura"),
    ("CB", "Caótico bueno"),
    ("CD", "Clase de dificultad"),
    ("CM", "Caótico malvado"),
    ("CN", "Caótico neutral"),
    ("Con", "Constitución"),
    ("Des", "Destreza"),
    ("Fue", "Fuerza"),
    ("GM", "Game Master"),
    ("Int", "Inteligencia"),
    ("LB", "Legal bueno"),
    ("LM", "Legal malvado"),
    ("LN", "Legal neutral"),
    ("M", "Componente material"),
    ("N", "Neutral"),
    ("NB", "Neutral bueno"),
    ("NM", "Neutral malvado"),
    ("pc", "Pieza(s) de cobre"),
    ("pe", "Pieza(s) de electro"),
    ("pg", "Punto(s) de golpe"),
    ("PNJ", "Personaje no jugador"),
    ("po", "Pieza(s) de oro"),
    ("pp", "Pieza(s) de plata"),
    ("ppt", "Pieza(s) de platino"),
    ("PX", "Punto(s) de experiencia"),
    ("R", "Ritual"),
    ("S", "Componente somático"),
    ("Sab", "Sabiduría"),
    ("V", "Componente verbal"),
    ("VD", "Valor de desafío"),
]


def _table(rows: list[tuple[str, str]], head: tuple[str, str]) -> str:
    return "\n".join(
        [f"| {head[0]} | {head[1]} |", "|---|---|"] + [f"| {a} | {b} |" for a, b in rows]
    )


def fix_exhaustion(path: Path) -> bool:
    """El cuadro de cansancio del 5.1 sale como tabla de prosa: prosa + tabla."""
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    body = text.split("---", 2)[-1].lstrip()
    if not body.startswith("| Algunas capacidades"):
        return False
    start = text.find("| Algunas capacidades")
    if start < 0:
        return False
    end = text.find("| 6 | Muerte. |")
    if end < 0:
        return False
    block = text[start : end + len("| 6 | Muerte. |")]
    rows = [r for r in block.split("\n") if r.startswith("|") and not r.startswith("|---")]
    cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows]
    prose = " ".join(c[0] for c in cells[:2] if c[0])
    rest = text[end + len("| 6 | Muerte. |") :]
    after = [r.strip() for r in rest.split("\n") if r.strip()]
    rebuilt = prose + "\n\n" + _table(EXHAUSTION, ("Nivel", "Efecto"))
    if after and after[0].startswith("|"):
        rebuilt += "\n\n" + after[0].strip("| ").strip()
        rest = rest.replace(after[0], "", 1)
    path.write_text(text[:start] + rebuilt + rest, encoding="utf-8")
    return True


def fix_abbreviations(path: Path) -> bool:
    """La lista de abreviaturas del glosario del 5.2 sale en dos parejas por fila."""
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    if "| Abreviatura | Significado |" in text:
        return False
    start = text.find("| BC |")
    if start < 0:
        return False
    path.write_text(
        text[:start] + _table(ABBREVIATIONS, ("Abreviatura", "Significado")) + "\n",
        encoding="utf-8",
    )
    return True


def main() -> int:
    fixes = [
        ("ed51", "cansancio.md", fix_exhaustion),
        ("ed52", "convenciones-del-glosario.md", fix_abbreviations),
    ]
    for ed, name, fn in fixes:
        if fn(DATOS / ed / "reglas" / name):
            print(f"  retoque aplicado: {ed}/reglas/{name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
