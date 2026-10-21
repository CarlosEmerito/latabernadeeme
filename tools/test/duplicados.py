#!/usr/bin/env python3
"""Comprueba que un duplicado de `data/` suspende la validación.

`validar.py` contaba los nombres repetidos de cada carpeta y los escribía en el
informe, pero no los sumaba a `problemas`: `/5.5/equipo/` publicó dos «Vara»
—la pértiga de 3 m de la tabla de equipo (pág. 103) y el canalizador arcano
(pág. 105), las dos como «Equipo de aventureros»— y `npm run verificar` seguía
en verde con dos filas idénticas en el listado.

La regla que se fija aquí es la que el corpus ya aplicaba a mano —lo cuenta
`docs/informes/origenes-equipo.md`—: dos fichas pueden compartir nombre si la
categoría las separa («Bastón» arma y «Bastón» canalizador arcano, «Competencia»
de características y del glosario), porque el listado publica la columna
Categoría y el lector sabe cuál abre. Lo que no puede pasar es que coincidan
nombre **y** categoría dentro de la misma carpeta.

Los casos montan una carpeta temporal con sus ficheros y llaman a
`validar.revisar_carpeta`, que es donde vive la cuenta de incidencias; los dos
últimos leen las carpetas reales de equipo, que es la regresión de la «Vara»:
si alguien vuelve a dejar dos fichas iguales, esto se pone en rojo.

Uso: .venv-ingest/bin/python tools/test/duplicados.py   (necesita PyYAML, como validar.py)
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

# Importar `validar` deja su `__pycache__` en `tools/verify/`, y el árbol tiene
# que quedar limpio después de pasar las puertas: el revisor lee cualquier
# fichero sin commitear como trabajo a medias.
sys.dont_write_bytecode = True

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "tools" / "verify"))

import validar  # noqa: E402

# (descripción, [(name, category)], duplicados esperados, incidencias esperadas)
CASOS: list[tuple[str, list[tuple[str, str]], int, int]] = [
    (
        "dos fichas con el mismo nombre y la misma categoría",
        [("Vara", "Equipo de aventurero"), ("Vara", "Equipo de aventurero")],
        1,
        1,
    ),
    (
        "el mismo nombre en dos categorías distintas",
        [("Bastón", "Arma"), ("Bastón", "Equipo de aventurero")],
        0,
        0,
    ),
    (
        "el mismo nombre en departamentos distintos del glosario",
        [("Competencia", "Características"), ("Competencia", "Glosario")],
        0,
        0,
    ),
    (
        "la caja no distingue dos fichas del mismo nombre",
        [("Vara", "Equipo de aventurero"), ("vara", "Equipo de aventurero")],
        1,
        1,
    ),
    (
        "tres fichas iguales son un solo nombre repetido",
        [
            ("Vara", "Equipo de aventurero"),
            ("Vara", "Equipo de aventurero"),
            ("Vara", "Equipo de aventurero"),
        ],
        1,
        1,
    ),
    (
        "un nombre distinto en la misma categoría no es un duplicado",
        [("Vara", "Equipo de aventurero"), ("Vara (3 m)", "Equipo de aventurero")],
        0,
        0,
    ),
]


def fichas_en(carpeta: Path, fichas: list[tuple[str, str]]) -> None:
    """Escribe una ficha por par (nombre, categoría) con su frontmatter."""
    for i, (nombre, categoria) in enumerate(fichas):
        (carpeta / f"ficha-{i}.md").write_text(
            f"---\nname: {nombre}\ncategory: {categoria}\nsrd: '5.2'\npage: 1\n---\n",
            encoding="utf-8",
        )


def repetidos(lineas: list[str]) -> int:
    """Cuántos nombres repetidos declara el bloque del informe, o -1 si no lo dice."""
    marca = "Nombres repetidos en la misma categoría: **"
    for linea in lineas:
        if marca in linea:
            resto = linea.split(marca, 1)[1]
            return int(resto.split("**", 1)[0])
    return 0


fallos = 0
comprobados = 0
for descripcion, fichas, esperados, incidencias_esperadas in CASOS:
    with tempfile.TemporaryDirectory() as tmp:
        carpeta = Path(tmp) / "equipo"
        carpeta.mkdir()
        fichas_en(carpeta, fichas)
        lineas, entradas, incidencias = validar.revisar_carpeta("ed52", carpeta)
    comprobados += 1
    if (repetidos(lineas), incidencias, entradas) != (
        esperados,
        incidencias_esperadas,
        len(fichas),
    ):
        fallos += 1
        print(f"✗ {descripcion}")
        print(f"    da       repetidos={repetidos(lineas)} incidencias={incidencias} entradas={entradas}")
        print(f"    esperaba repetidos={esperados} incidencias={incidencias_esperadas} entradas={len(fichas)}")

# Las carpetas reales: el corpus no puede tener dos fichas iguales en su
# categoría, y las que comparten nombre (Bastón arma / Bastón canalizador) no
# pueden contarse como duplicado.
for ed in ("ed51", "ed52"):
    carpeta = validar.DATOS / ed / "equipo"
    lineas, entradas, incidencias = validar.revisar_carpeta(ed, carpeta)
    comprobados += 1
    if incidencias or repetidos(lineas):
        fallos += 1
        print(f"✗ {ed}/equipo publica un nombre repetido en su categoría")
        print(f"    incidencias={incidencias} · {lineas[1:]}")

if fallos:
    print(f"\nFallos: {fallos} de {comprobados} comprobaciones.")
    raise SystemExit(1)

print(
    f"Casos comprobados: {comprobados} · dos fichas con el mismo nombre y la misma "
    "categoría suspenden la validación; un homónimo en otra categoría, no."
)
