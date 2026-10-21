#!/usr/bin/env python3
"""Comprueba cómo parte `_split_type` la línea de tipo del perfil.

La línea del perfil del PDF trae tres cosas pegadas —tipo, tamaño y
alineamiento— y el parser las separa con una sola expresión regular. Cuando esa
expresión no contempla una forma, el trozo que sobra no se pierde: se queda en
el campo de al lado, y la ficha publica «Mediano humanoide, o Pequeño, neutral»
o «Grande enjambre, de bestias Diminutas, sin alineamiento» sin que nada falle.

Aquí se fijan las líneas crudas tal cual vienen del PDF —no se leen de
`.cache/`, que no se versiona— y lo que tiene que salir de cada una:

  - el tamaño alternativo («Mediano o Pequeño») se conserva entero en `size`,
    porque es lo que parte `tamanosDe` para publicar las dos casillas del filtro;
  - la aclaración entre paréntesis —«(mago)», «(licántropo)»— va a `tags`, y en
    5.1 puede venir con una coma delante;
  - el complemento suelto del tipo —«de bestias Diminutas», «de muertos
    vivientes Diminutos»— va a `tags` y no al alineamiento, y el tipo sigue
    siendo `Enjambre`, que es de donde sale el icono de la banda;
  - lo que ya se partía bien no se toca, paréntesis legítimos del alineamiento
    —«neutral bueno (50 %)»— incluidos.

Uso: .venv-ingest/bin/python tools/test/tipo.py   (o `python3`, solo stdlib)
"""
from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "tools"))

from ingest.srd.monsters import _split_type  # noqa: E402

# (línea cruda del PDF, tipo, tamaño, tags, alineamiento)
CASOS = [
    # El tamaño alternativo con la aclaración detrás del segundo tamaño.
    (
        "Humanoide Mediano o Pequeño (mago), neutral",
        "Humanoide",
        "Mediano o Pequeño",
        "mago",
        "neutral",
    ),
    (
        "Monstruosidad Mediana o Pequeña (licántropo), caótica malvada",
        "Monstruosidad",
        "Mediana o Pequeña",
        "licántropo",
        "caótica malvada",
    ),
    # El tamaño alternativo sin paréntesis.
    ("Humanoide Mediano o Pequeño, neutral", "Humanoide", "Mediano o Pequeño", "", "neutral"),
    (
        "Muerto viviente Mediano o Pequeño, legal malvado",
        "Muerto viviente",
        "Mediano o Pequeño",
        "",
        "legal malvado",
    ),
    # El complemento suelto del tipo: no es alineamiento y el tipo sigue siendo Enjambre.
    (
        "Enjambre Mediano de bestias Diminutas, sin alineamiento",
        "Enjambre",
        "Mediano",
        "de bestias Diminutas",
        "sin alineamiento",
    ),
    (
        "Enjambre Mediano de muertos vivientes Diminutos, neutral malvado",
        "Enjambre",
        "Mediano",
        "de muertos vivientes Diminutos",
        "neutral malvado",
    ),
    # En 5.1 la coma se cuela delante del paréntesis.
    (
        "Infernal Diminuto, (diablo, cambiaformas), legal malvado",
        "Infernal",
        "Diminuto",
        "diablo, cambiaformas",
        "legal malvado",
    ),
    # Lo que ya se partía bien sigue igual.
    ("Feérico Pequeño (trasgo), caótico neutral", "Feérico", "Pequeño", "trasgo", "caótico neutral"),
    ("Cieno Mediano, sin alineamiento", "Cieno", "Mediano", "", "sin alineamiento"),
    ("Enjambre Grande de bestias Diminutas, sin alineamiento", "Enjambre", "Grande", "de bestias Diminutas", "sin alineamiento"),
    (
        "Gigante Mediano, neutral bueno (50 %) o neutral malvado (50 %)",
        "Gigante",
        "Mediano",
        "",
        "neutral bueno (50 %) o neutral malvado (50 %)",
    ),
    # Un tamaño que el SRD no usa no rompe el reparto: se queda donde está.
    ("Cieno Colosal, sin alineamiento", "", "", "", "Cieno Colosal, sin alineamiento"),
]

fallos = 0
for linea, tipo, tamano, tags, alineamiento in CASOS:
    dado = _split_type(linea)
    esperado = (tipo, tamano, tags, alineamiento)
    if dado != esperado:
        fallos += 1
        print(f"✗ {linea!r}")
        print(f"    da       {dado}")
        print(f"    esperaba {esperado}")

if fallos:
    print(f"\nFallos: {fallos} de {len(CASOS)} líneas.")
    raise SystemExit(1)

print(f"Líneas de tipo comprobadas: {len(CASOS)} · ninguna parte el tamaño, los tags ni el alineamiento.")
