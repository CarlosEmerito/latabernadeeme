#!/usr/bin/env python3
"""Verifica la integridad de `data/` y escribe un informe.

Comprueba, por edición y tipo de contenido:
  - número de entradas frente a los recuentos de referencia del SRD,
  - campos obligatorios vacíos,
  - cuerpos vacíos o desproporcionados (síntoma de un corte mal hecho),
  - duplicados por nombre,
  - la tabla de recuentos del README frente a los ficheros reales.

Uso:
    .venv-ingest/bin/python tools/verify/validar.py
"""
from __future__ import annotations

import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parents[2]
DATOS = RAIZ / "data"
INFORME = RAIZ / "docs" / "informes" / "validacion.md"
README = RAIZ / "README.md"

# Recuentos del SRD en español, comprobados contra los documentos oficiales.
REFERENCIA = {
    ("ed51", "conjuros"): 319,
    ("ed51", "monstruos"): 317,
    ("ed52", "conjuros"): 339,
    ("ed52", "monstruos"): 330,
}

# Un cuerpo puede ser legítimamente largo (una clase con todas sus subclases
# ocupa 20 KB). El límite solo sirve para detectar un corte mal hecho.
LIMITE_CUERPO = {
    "conjuros": 9000,
    "monstruos": 7000,
    "objetos": 6000,
    "clases": 60000,
    "especies": 12000,
    "trasfondos": 8000,
    "dotes": 6000,
    "equipo": 6000,
    "reglas": 40000,
}

OBLIGATORIOS = {
    "conjuros": ["name", "level", "school", "castingTime", "range", "components", "duration"],
    "monstruos": ["name", "size", "type", "ac", "hp", "speed", "cr"],
    "objetos": ["name", "type"],
    "clases": ["name"],
    "especies": ["name"],
    "trasfondos": ["name"],
    "dotes": ["name"],
    "equipo": ["name"],
    "reglas": ["name"],
}


def leer(ruta: Path) -> tuple[dict, str] | None:
    raw = ruta.read_text(encoding="utf-8")
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?", raw)
    if not m:
        return None
    try:
        datos = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError as e:
        print(f"  YAML inválido en {ruta}: {e}")
        return None
    return datos, raw[m.end() :]


def sin_tildes(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn"
    ).strip()


def recuentos_readme() -> tuple[dict[tuple[str, str], int], list[str]]:
    """Lee la tabla de «Estado» del README: (edición, tipo) -> recuento.

    Devuelve también los errores de formato. Una celda que no sea un número
    deja ese recuento sin comprobar, así que cuenta como incidencia igual que
    un descuadre: el README es público y la tabla es el dato que se lee.
    """
    if not README.exists():
        return {}, ["no existe README.md"]
    filas = README.read_text(encoding="utf-8").splitlines()
    inicio = next(
        (
            i
            for i, fila in enumerate(filas)
            if fila.lstrip().startswith("|") and "edicion" in sin_tildes(fila)
        ),
        None,
    )
    if inicio is None:
        return {}, ["no encuentro la tabla de recuentos en README.md"]

    columnas = [sin_tildes(c) for c in filas[inicio].strip().strip("|").split("|")][1:]
    recuentos: dict[tuple[str, str], int] = {}
    errores: list[str] = []
    for fila in filas[inicio + 1 :]:
        if not fila.lstrip().startswith("|"):
            break
        celdas = [c.strip() for c in fila.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-+:?", c) for c in celdas):
            continue
        if len(celdas) != len(columnas) + 1:
            errores.append(
                f"fila del README con {len(celdas)} celdas; la cabecera tiene {len(columnas) + 1}"
            )
            continue
        etiqueta = sin_tildes(celdas[0])
        if etiqueta.startswith("5.5"):
            ed = "ed52"
        elif etiqueta.startswith("5e"):
            ed = "ed51"
        else:
            errores.append(f"fila del README sin edición reconocible: {celdas[0]!r}")
            continue
        for tipo, celda in zip(columnas, celdas[1:]):
            if not re.fullmatch(r"\d+", celda):
                errores.append(f"{ed}/{tipo}: «{celda}» no es un número")
                continue
            recuentos[(ed, tipo)] = int(celda)
    return recuentos, errores


def main() -> int:
    lineas = ["# Informe de validación", "", "Generado por `tools/verify/validar.py`.", ""]
    problemas = 0
    total = 0
    reales: dict[tuple[str, str], int] = {}

    for ed in sorted(p.name for p in DATOS.iterdir() if p.is_dir()):
        for carpeta in sorted(p for p in (DATOS / ed).iterdir() if p.is_dir()):
            tipo = carpeta.name
            ficheros = sorted(carpeta.glob("*.md"))
            total += len(ficheros)
            reales[(ed, tipo)] = len(ficheros)
            vacios: list[str] = []
            faltan: list[str] = []
            largos: list[str] = []
            nombres: Counter[str] = Counter()

            for f in ficheros:
                contenido = leer(f)
                if contenido is None:
                    faltan.append(f"{f.name} (sin frontmatter válido)")
                    continue
                datos, cuerpo = contenido
                nombres[str(datos.get("name", "")).strip().lower()] += 1
                for campo in OBLIGATORIOS.get(tipo, ["name"]):
                    if datos.get(campo) in (None, "", []):
                        faltan.append(f"{f.name}: {campo}")
                # En equipo y objetos la ficha puede vivir solo en el
                # frontmatter (precio, peso, rareza): no es un error.
                if len(cuerpo.strip()) == 0 and tipo not in ("equipo", "objetos"):
                    vacios.append(f.name)
                elif len(cuerpo) > LIMITE_CUERPO.get(tipo, 20_000):
                    largos.append(f"{f.name} ({len(cuerpo)} caracteres)")

            duplicados = [n for n, c in nombres.items() if c > 1 and n]
            referencia = REFERENCIA.get((ed, tipo))
            estado = "OK"
            if referencia is not None and len(ficheros) != referencia:
                estado = f"DESCUADRE ({len(ficheros)} de {referencia})"
                problemas += 1
            # Solo son fallos los campos obligatorios vacíos y los cuerpos
            # vacíos; un cuerpo largo es un aviso para revisar.
            if faltan or vacios:
                problemas += 1

            lineas.append(f"## {ed} · {tipo} — {len(ficheros)} entradas · {estado}")
            if faltan:
                lineas.append(f"- Campos vacíos: **{len(faltan)}**")
                lineas += [f"  - `{x}`" for x in faltan[:15]]
                if len(faltan) > 15:
                    lineas.append(f"  - …y {len(faltan) - 15} más")
            if vacios:
                lineas.append(f"- Cuerpos vacíos: **{len(vacios)}** ({', '.join(vacios[:10])})")
            if largos:
                lineas.append(f"- Aviso, cuerpos más largos de lo esperado: {len(largos)} ({', '.join(largos[:5])})")
            if duplicados:
                lineas.append(f"- Nombres repetidos: {len(duplicados)} ({', '.join(duplicados[:8])})")
            lineas.append("")

    # La tabla del README es el dato que se lee de un vistazo y ya se quedó
    # atrás una vez: se compara con los ficheros reales en cada pasada.
    declarados, errores_readme = recuentos_readme()
    descuadres = [
        f"{ed}/{tipo}: README dice {declarados[(ed, tipo)]}, hay {n}"
        for (ed, tipo), n in sorted(reales.items())
        if (ed, tipo) in declarados and declarados[(ed, tipo)] != n
    ]
    sin_celda = sorted(clave for clave in reales if clave not in declarados)
    sobrantes = sorted(clave for clave in declarados if clave not in reales)
    lineas += ["## README — tabla de recuentos", ""]
    if errores_readme or descuadres or sin_celda or sobrantes:
        problemas += 1
        lineas += [f"- {e}" for e in errores_readme]
        lineas += [f"- Descuadre: {d}" for d in descuadres]
        lineas += [f"- Sin celda en el README: `{ed}/{tipo}`" for ed, tipo in sin_celda]
        lineas += [f"- Celda sin carpeta en `data/`: `{ed}/{tipo}`" for ed, tipo in sobrantes]
    else:
        lineas.append(f"- Las {len(declarados)} celdas coinciden con los ficheros de `data/`.")
    lineas.append("")

    lineas.insert(3, f"Total de entradas: **{total}**. Apartados con incidencias: **{problemas}**.")
    INFORME.parent.mkdir(parents=True, exist_ok=True)
    INFORME.write_text("\n".join(lineas), encoding="utf-8")
    print("\n".join(lineas[:8]))
    print(f"\nInforme completo en {INFORME}")
    return 1 if problemas else 0


if __name__ == "__main__":
    raise SystemExit(main())
