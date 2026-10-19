#!/usr/bin/env python3
"""Extrae las reglas y los estados de los dos SRD en español a `data/`.

A diferencia de conjuros y monstruos, las reglas no tienen un patrón único de
cabecera: cada capítulo cambia el nivel de los títulos. Por eso el troceado se
hace con una lista explícita de entradas (`SPECS_51` y `SPECS_52`), que fija el
título, la categoría y, cuando hace falta, dónde acaba la entrada.

Uso:
    python3 import_rules.py            # las dos ediciones
    python3 import_rules.py ed51       # solo una
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import reglas_postfix  # noqa: E402
from rutas import WORK  # noqa: E402
from srd import rules  # noqa: E402
from srd.rules import Spec  # noqa: E402
from write_data import DATA, slug, unique_path, write_entry  # noqa: E402

# --- SRD 5.1 ---------------------------------------------------------------

SPECS_51: list[Spec] = [
    Spec("Uso de las puntuaciones de característica", "Características", level="h1",
         end="Puntuaciones de característica y modificadores"),
    Spec("Puntuaciones de característica y modificadores", "Características"),
    Spec("Ventaja y desventaja", "Características"),
    Spec("Bonificador por competencia", "Características"),
    Spec("Pruebas de característica", "Características"),
    Spec("Usar cada característica", "Características"),
    Spec("Tiradas de salvación", "Características"),
    Spec("Tiempo", "Exploración"),
    Spec("Movimiento", "Exploración"),
    Spec("El entorno", "Exploración"),
    Spec("Descansar", "Descanso"),
    Spec("Entre aventuras", "Descanso"),
    Spec("Estructura de un combate", "Combate"),
    Spec("Movimiento y posición", "Combate"),
    Spec("Acciones en combate", "Combate"),
    Spec("Atacar", "Combate"),
    Spec("Cobertura", "Combate"),
    Spec("Daño y curación", "Combate"),
    Spec("Combate montado", "Combate"),
    Spec("Combate bajo el agua", "Combate"),
    Spec("Lanzamiento de conjuros", "Magia", level="h1", end="¿Qué es un conjuro?"),
    Spec("¿Qué es un conjuro?", "Magia"),
    Spec("Lanzar un conjuro", "Magia", end="Listas de conjuros"),
    Spec("Trampas", "Peligros"),
    Spec("Enfermedades", "Peligros"),
    Spec("Locura", "Peligros"),
    Spec("Objetos", "Equipo"),
    Spec("Venenos", "Peligros", end="Objetos mágicos"),
    Spec("Apéndice MJ-A: Estados", "Condiciones", level="h1", end="Agarrado"),
    Spec("Agarrado", "Condiciones", level="h4"),
    Spec("Apresado", "Condiciones", level="h4"),
    Spec("Asustado", "Condiciones", level="h4"),
    Spec("Aturdido", "Condiciones", level="h4"),
    Spec("Cegado", "Condiciones", level="h4"),
    Spec("Derribado", "Condiciones", level="h4"),
    Spec("Ensordecido", "Condiciones", level="h4"),
    Spec("Cansancio", "Condiciones", level="para", end="Envenenado"),
    Spec("Envenenado", "Condiciones", level="h4"),
    Spec("Hechizado", "Condiciones", level="h4"),
    Spec("Incapacitado", "Condiciones", level="h4"),
    Spec("Inconsciente", "Condiciones", level="h4"),
    Spec("Invisible", "Condiciones", level="h4"),
    Spec("Paralizado", "Condiciones", level="h4"),
    Spec("Petrificado", "Condiciones", level="h4"),
]

# --- SRD 5.2.1 -------------------------------------------------------------

SPECS_52: list[Spec] = [
    Spec("Cómo jugar", "Básico", level="h1", end="El ritmo de juego"),
    Spec("El ritmo de juego", "Básico"),
    Spec("Las seis características", "Características"),
    Spec("Las pruebas con d20", "Características"),
    Spec("Competencia", "Características"),
    Spec("Acciones", "Combate"),
    Spec("Interacciones sociales", "Social"),
    Spec("Exploración", "Exploración"),
    Spec("Combate", "Combate"),
    Spec("Daño y curación", "Combate", end="Creación de personajes"),
    Spec("Herramientas del juego", "Básico", level="h1", end="Ritmo de viaje"),
    Spec("Ritmo de viaje", "Exploración"),
    Spec("Crear un trasfondo", "Social"),
    Spec("Maldiciones y enfermedades mágicas", "Peligros"),
    Spec("Efectos ambientales", "Peligros"),
    Spec("Miedo y estrés psicológico", "Peligros"),
    Spec("Veneno", "Peligros"),
    Spec("Trampas", "Peligros"),
    Spec("Encuentros de combate", "Combate", end="Objetos mágicos"),
]

GLOSSARY_START = "Definiciones de las reglas"
GLOSSARY_END = "Herramientas del juego"
STATE_TAG = "[estado]"


def glossary_specs(blocks: list[rules.Block]) -> list[Spec]:
    """Una entrada por cada voz del glosario, en orden alfabético."""
    first = rules.find_any(blocks, GLOSSARY_START)
    last = rules.find_any(blocks, GLOSSARY_END, first)
    specs: list[Spec] = []
    for i, block in enumerate(blocks[first + 1 : last], start=first + 1):
        if block.kind != "caption":
            continue
        title = block.text.strip()
        if not title or len(title) > 48 or "**" in title or "." in title:
            continue
        if not title[0].isupper() or not title[0].isalpha():
            continue
        if i + 1 >= len(blocks) or blocks[i + 1].kind not in ("para", "item"):
            continue
        name = title.replace(STATE_TAG, "").replace("[peligro]", "").replace("[acción]", "")
        name = name.replace("[actitud]", "").replace("[área de efecto]", "").strip()
        category = "Condiciones" if STATE_TAG in title else "Glosario"
        specs.append(Spec(title, category, name=name, level="caption"))
    return specs


def run_edition(ed: str, xml: str, words_xml: str, specs: list[Spec], first: int, last: int) -> int:
    pages = rules.parse(WORK / xml)
    words = rules.parse_words(WORK / words_xml)
    blocks = rules.blocks(pages, first, last, words, indent_space=(ed == "ed51"))
    if ed == "ed52":
        specs = [s for s in specs if s.title != GLOSSARY_START]
        idx = specs.index(next(s for s in specs if s.title == GLOSSARY_END))
        specs[idx:idx] = [
            Spec("Convenciones del glosario", "Glosario"),
            Spec(GLOSSARY_START, "Glosario"),
        ] + glossary_specs(blocks)

    out = DATA / ed / "reglas"
    taken: set[str] = set()
    total = 0
    for spec, page, body in rules.entries(blocks, specs):
        text = rules.render(body)
        if not text.strip():
            print(f"  ¡vacía! {spec.title!r}")
            continue
        front = {
            "name": spec.label(),
            "category": spec.category,
            "srd": ed[2:3] + "." + ed[3:],
            "page": page,
        }
        write_entry(unique_path(out, slug(spec.label()), taken), front, text)
        total += 1
    print(f"{ed}: {total} reglas en {out}")
    return total


def main() -> int:
    which = sys.argv[1] if len(sys.argv) > 1 else "todas"
    if which in ("todas", "ed51"):
        run_edition("ed51", "es51.xml", "es51.bbox.xml", SPECS_51, 79, 390)
    if which in ("todas", "ed52"):
        run_edition("ed52", "es52.xml", "es52.bbox.xml", SPECS_52, 5, 226)
    reglas_postfix.main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
