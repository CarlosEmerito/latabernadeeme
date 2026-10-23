#!/usr/bin/env python3
"""Comprueba que el pie de página del PDF no se cuela en el texto de las fichas.

El texto linealizado del SRD trae, al final de cada hoja, la línea legal
(«Documento de referencia del sistema 5.1. 226», «Prohibida la reventa. Tienes
permiso…») y a veces el número de página. Cuando la extracción de objetos toma
ese texto tal cual, el pie se publica dentro de la descripción y, si cae a media
frase, la ficha pierde el final: `anillo-de-almacenamiento-de-conjuros` acababa
en «…y los conserva hasta que el portador» y `agujero-portatil` publicaba
«…que haya en su interior Prohibida la reventa» en mitad del párrafo.

Aquí se fijan las líneas crudas tal cual llegan del PDF —no se leen de
`.cache/`, que no se versiona— y lo que tiene que salir:

  - el pie que ocupa su propia línea desaparece, con el número que lo precede;
  - si el pie había partido un párrafo, la frase se vuelve a unir;
  - el pie que quedó pegado dentro de un párrafo (fichas ya publicadas) se
    quita igual, y `quita_pies` no toca nada más: ni tablas ni saltos de línea;
  - `plain_bodies` no publica el pie y no pierde el texto que venía detrás.

Uso: python3 tools/test/pies.py   (solo stdlib)
"""
from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "tools"))

from ingest.srd.items import Item, plain_bodies  # noqa: E402
from ingest.srd.pies import PIE_TEXTO, quita_pies, sin_pies  # noqa: E402

# (nombre del caso, texto crudo, texto que tiene que salir)
CASOS: list[tuple[str, str, str]] = [
    (
        "el pie cierra la ficha y sobra el párrafo",
        "Tendrás una velocidad nadando de 12 m mientras lleves puesto este anillo.\n"
        "\n"
        "Documento de referencia del sistema 5.1. 226\n",
        "Tendrás una velocidad nadando de 12 m mientras lleves puesto este anillo.",
    ),
    (
        "el pie lleva el número de página delante",
        "El anillo deja de estar almacenado en él, por lo que deja espacio libre.\n"
        "\n"
        "229 Documento de referencia del sistema 5.2.1\n",
        "El anillo deja de estar almacenado en él, por lo que deja espacio libre.",
    ),
    (
        "el pie partió la frase: se une con lo que sigue",
        "Al doblar la tela se cierra el agujero y cualquier\n"
        "criatura u objeto que haya en su interior\n"
        "Prohibida la reventa. Tienes permiso para imprimir\n"
        "o fotocopiar este documento solo para uso personal.\n"
        "\n"
        "permanecerá en el espacio extradimensional.\n",
        "Al doblar la tela se cierra el agujero y cualquier criatura u objeto que haya "
        "en su interior permanecerá en el espacio extradimensional.",
    ),
    (
        "el pie está pegado dentro de un párrafo ya publicado",
        "Este anillo almacena los conjuros que se lanzan sobre él y los conserva hasta "
        "que el portador Prohibida la reventa. Tienes permiso para imprimir o fotocopiar "
        "este documento solo para uso personal. sintonizado decida usarlos.\n",
        "Este anillo almacena los conjuros que se lanzan sobre él y los conserva hasta "
        "que el portador sintonizado decida usarlos.",
    ),
    (
        "un párrafo que ya cierra frase no se une al siguiente",
        "Este prisma tiene 50 cargas.\n"
        "Documento de referencia del sistema 5.1. 253\n"
        "\n"
        "Mientras lo sostienes, puedes usar una acción.\n",
        "Este prisma tiene 50 cargas.\n\nMientras lo sostienes, puedes usar una acción.",
    ),
]


def comprueba(caso: str, crudo: str, esperado: str) -> list[str]:
    fallos: list[str] = []
    salida = sin_pies(crudo).strip()
    if salida != esperado:
        fallos.append(f"{caso}: se esperaba {esperado!r} y salió {salida!r}")
    if sin_pies(salida).strip() != salida:
        fallos.append(f"{caso}: no es idempotente")
    for pie in PIE_TEXTO:
        if pie in salida:
            fallos.append(f"{caso}: sigue publicado «{pie}» en {salida!r}")
    return fallos


def comprueba_conservador() -> list[str]:
    """`quita_pies` borra el pie y no toca el formato: ni tabla ni saltos."""
    crudo = (
        "Este prisma tiene 50 cargas.\n"
        "\n"
        "| Elemental | Gema |\n"
        "| --- | --- |\n"
        "| Agua | Esmeralda |\n"
        "\n"
        "Documento de referencia del sistema 5.1. 253\n"
    )
    esperado = (
        "Este prisma tiene 50 cargas.\n"
        "\n"
        "| Elemental | Gema |\n"
        "| --- | --- |\n"
        "| Agua | Esmeralda |\n"
        "\n"
    )
    salida = quita_pies(crudo)
    if salida != esperado:
        return [f"quita_pies rompió el formato: {salida!r}"]
    return []


def comprueba_extraccion() -> list[str]:
    """El cuerpo extraído del plano no lleva el pie y conserva lo que venía detrás."""
    plano = (
        "Anillo de almacenamiento de conjuros\n"
        "\n"
        "Anillo, raro (requiere sintonización)\n"
        "Este anillo almacena los conjuros que se lanzan sobre él y los conserva hasta que el portador\n"
        "\n"
        "Prohibida la reventa. Tienes permiso para imprimir\n"
        "o fotocopiar este documento solo para uso personal.\n"
        "\n"
        "sintonizado decida usarlos. El anillo puede guardar cinco niveles.\n"
        "\n"
        "Anillo de natación\n"
        "\n"
        "Anillo, poco común\n"
        "Tendrás una velocidad nadando de 12 m.\n"
    )
    items = [
        Item("Anillo de almacenamiento de conjuros", "Anillo", "raro", True, "", 224),
        Item("Anillo de natación", "Anillo", "poco común", False, "", 226),
    ]
    cuerpos = plain_bodies(items, plano)
    fallos: list[str] = []
    primero = (cuerpos[0] or "").strip()
    esperado = (
        "Este anillo almacena los conjuros que se lanzan sobre él y los conserva hasta "
        "que el portador sintonizado decida usarlos. El anillo puede guardar cinco niveles."
    )
    if primero != esperado:
        fallos.append(f"el cuerpo extraído no es el esperado: {primero!r}")
    if "Anillo de natación" in primero:
        fallos.append("el cuerpo se lleva la cabecera del objeto siguiente")
    segundo = (cuerpos[1] or "").strip()
    if segundo != "Tendrás una velocidad nadando de 12 m.":
        fallos.append(f"el segundo cuerpo no es el esperado: {segundo!r}")
    return fallos


def main() -> int:
    fallos: list[str] = []
    for caso, crudo, esperado in CASOS:
        fallos += comprueba(caso, crudo, esperado)
    fallos += comprueba_conservador()
    fallos += comprueba_extraccion()
    if fallos:
        print(f"✗ {len(fallos)} fallos:")
        for f in fallos:
            print(f"  - {f}")
        return 1
    print(f"✓ {len(CASOS) + 2} comprobaciones del pie de página del PDF")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
