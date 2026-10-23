#!/usr/bin/env python3
"""Comprueba que el texto de rasgos y acciones no quede cortado a media frase.

`stream.paragraphs()` parte el flujo del PDF en párrafos y `monsters._split_feature()`
se queda con los que empiezan por «Nombre. »; un párrafo suelto que no empieza así
se **descarta en silencio** (`tools/ingest/srd/monsters.py:385-387`), así que un corte
de más se lleva el texto sin que nada falle: la ficha publica «…el objetivo deberá
superar» y ahí se acaba.

Hay dos cortes de más y los dos salen de `paragraphs()` (`tools/ingest/srd/stream.py:67`):

  - la continuación de un rótulo que une `join_dangling_labels()` conserva la `y` de
    la **primera** línea (`monsters.py:233`), así que el hueco hasta la siguiente es
    de dos renglones y el detector lo toma por un párrafo nuevo;
  - la continuación de una acción viene sangrada ~9 pt respecto de la línea del
    nombre, y `indented = (x - prev.x) > 5` la toma por un párrafo nuevo.

Aquí se fijan las líneas crudas tal como las entrega el JSONL —no se leen de
`.cache/`, que no se versiona— de los dos casos reales, y se comprueba que `parse()`
devuelve el texto entero. Después se barre `data/`: ninguna ficha publicada de
criatura o conjuro puede acabar a media frase.

Uso: .venv-ingest/bin/python tools/test/acciones.py   (o `python3 tools/test/acciones.py`)
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "tools"))

from ingest.srd import monsters  # noqa: E402
from ingest.srd.stream import Line  # noqa: E402

# Cabecera mínima de una criatura, para que `is_header()` la reconozca.
CABECERA = [
    (100.0, 16.7, "Criatura de prueba"),
    (113.0, 13.3, "Bestia Diminuta, sin alineamiento"),
    (126.0, 13.3, "Clase de Armadura: 12"),
    (139.0, 13.3, "Puntos de golpe: 1 (1d4 − 1)"),
    (152.0, 13.3, "Velocidad: 6 m, trepar 6 m"),
    (165.0, 13.3, "Desafío: 0 (10 PX)"),
]

# (explicación, líneas del cuerpo (x, y, block, texto), nombre del rasgo, trozos que
#  tienen que seguir en el detalle)
CASOS = [
    (
        "mordisco de la araña (5.1, pág. 398): «Impacto:» se une con la línea siguiente y "
        "la unida conserva la y de la primera, así que el hueco hasta la continuación es de dos renglones",
        [
            (328.6, 190.0, 48, "Acciones"),
            (328.6, 352.9, 49, "Mordisco. Ataque con arma cuerpo a cuerpo:"),
            (328.6, 365.3, 49, "+4 a impactar, alcance 1,5 m, una criatura. Impacto:"),
            (328.6, 377.4, 49, "1 de daño perforante y el objetivo deberá superar"),
            (328.6, 389.6, 49, "una tirada de salvación de Constitución con CD 9"),
            (328.6, 401.9, 49, "o recibirá 2 (1d4) de daño de veneno."),
        ],
        "Mordisco",
        (
            "una tirada de salvación de Constitución con CD 9",
            "o recibirá 2 (1d4) de daño de veneno.",
        ),
    ),
    (
        "drenaje psíquico del aboleth (5.1, pág. 282): la continuación viene sangrada 9,3 pt "
        "respecto de la línea del nombre y `paragraphs()` la toma por un párrafo nuevo",
        [
            (328.6, 190.0, 33, "Acciones"),
            (328.6, 550.7, 34, "Drenaje psíquico (cuesta 2 acciones). Una criatura"),
            (337.9, 562.9, 34, "hechizada por el aboleth recibe 10 (3d6) de daño"),
            (337.9, 575.1, 34, "psíquico y este recupera tantos puntos de golpe"),
            (337.9, 587.4, 34, "como el daño recibido por dicha criatura."),
        ],
        "Drenaje psíquico (cuesta 2 acciones)",
        (
            "hechizada por el aboleth recibe 10 (3d6) de daño",
            "como el daño recibido por dicha criatura.",
        ),
    ),
]

# Un renglón de tabla de d100 del conjuro acaba sin punto y no es un corte.
TABLA = re.compile(r"^\s*\d")
CIERRE = re.compile(r"[.!?)\)»\"”]\s*$")


def lineas(cuerpo):
    fuera = [Line(1, 0, 328.6, y, tam, texto) for y, tam, texto in CABECERA]
    fuera += [Line(1, 0, x, y, 13.3, texto, bloque) for x, y, bloque, texto in cuerpo]
    return fuera


fallos = 0

for explicacion, cuerpo, rasgo, trozos in CASOS:
    [criatura] = monsters.parse(lineas(cuerpo))
    detalles = [d for nombre, d in criatura.actions if nombre == rasgo]
    if not detalles:
        fallos += 1
        print(f"✗ No sale ninguna acción llamada {rasgo!r} ({explicacion})")
        continue
    detalle = detalles[0]
    faltan = [t for t in trozos if t not in detalle]
    if faltan:
        fallos += 1
        print(f"✗ {explicacion}")
        print(f"    publica  {detalle!r}")
        for t in faltan:
            print(f"    le falta {t!r}")

# Barrido de lo publicado: ninguna ficha puede acabar a media frase.
cortadas = []
for edicion in ("ed51", "ed52"):
    for tipo in ("monstruos", "conjuros"):
        for ficha in sorted((RAIZ / "data" / edicion / tipo).glob("*.md")):
            cuerpo = ficha.read_text(encoding="utf-8").split("---", 2)[2].strip()
            renglones = [r for r in cuerpo.split("\n") if r.strip()]
            if not renglones:
                continue
            ultimo = renglones[-1].strip().strip("*").strip()
            if not ultimo or ultimo.startswith("|") or TABLA.match(ultimo) or CIERRE.search(ultimo):
                continue
            cortadas.append((f"{edicion}/{tipo}/{ficha.name}", ultimo[-60:]))

if cortadas:
    fallos += 1
    print(f"✗ {len(cortadas)} fichas publicadas acaban a media frase:")
    for ruta, final in cortadas[:8]:
        print(f"    {ruta}: …{final!r}")
    if len(cortadas) > 8:
        print(f"    …y {len(cortadas) - 8} más")

if fallos:
    print(f"\nFallos: {fallos}.")
    raise SystemExit(1)

print(
    f"Rasgos comprobados: {len(CASOS)} · el texto de la acción llega entero · "
    "ninguna ficha de criatura o conjuro acaba a media frase."
)
