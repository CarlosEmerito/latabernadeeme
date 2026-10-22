"""
Repara el paquete de explorador de mazmorras del 5.2, cuyo nombre sale truncado.

En el PDF la fila del paquete viene partida en dos líneas:

    Paquete de explorador de 27,5 kg 12 po
    mazmorras

El nombre se corta en «Paquete de explorador de» porque la continuación
empieza por minúscula y el extractor de equipo no la une. La ficha publicaba
«Paquete de explorador de» y el buscador la indexaba así.

Aquí se lee la fila por coordenadas (`.cache/srd/work/e52.jsonl`), se juntan las
continuaciones con el mismo criterio del resto de la ingesta —una línea que
empieza por minúscula y va en la columna del nombre— y se reescribe la ficha
con el nombre entero, su precio, su peso y el cuerpo literal del SRD.

Uso: python3 tools/ingest/reparar_paquete.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from rutas import WORK  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2]
DATOS = RAIZ / "data"

EDICION = "ed52"
PAGINA = 103
# La fila del paquete: «Paquete de explorador de 27,5 kg 12 po».
FILA = re.compile(r"^(?P<nombre>.+?)\s+(?P<peso>[\d,]+(?:,\d+)? kg)\s+(?P<precio>\d+ (?:po|pp|pc))$")


def leer(fichero: Path):
    texto = fichero.read_text(encoding="utf-8")
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?", texto)
    return (yaml.safe_load(m.group(1)) or {}), texto[m.end() :]


def fila_del_pdf() -> tuple[str, str, str]:
    """La fila del paquete con el nombre ya unido: (nombre, peso, precio)."""
    lineas = []
    with (WORK / "e52.jsonl").open(encoding="utf-8") as f:
        for linea in f:
            d = json.loads(linea)
            if d.get("page") == PAGINA and d.get("col") == 1:
                lineas.append(d)
    lineas.sort(key=lambda d: d["y"])

    inicio = next(
        (n for n, d in enumerate(lineas) if d["text"].strip().startswith("Paquete de explorador de ")),
        None,
    )
    if inicio is None:
        raise LookupError("no se encuentra la fila del paquete en el PDF")
    partes = [lineas[inicio]["text"].strip()]
    for d in lineas[inicio + 1 :]:
        texto = d["text"].strip()
        if texto[:1].islower():
            partes.append(texto)
        else:
            break
    m = FILA.match(partes[0])
    if not m:
        raise ValueError(f"no se entiende la fila: {' '.join(partes)!r}")
    # La continuación va detrás del precio: «Paquete de explorador de 27,5 kg
    # 12 po» + «mazmorras». El nombre es lo que va antes del peso.
    nombre = m.group("nombre").strip()
    for parte in partes[1:]:
        nombre = f"{nombre} {parte}".strip()
    return nombre, m.group("peso"), m.group("precio")


def cuerpo_del_srd(nombre: str) -> str:
    """El párrafo literal del SRD que describe el paquete."""
    texto = (WORK / "es52.txt").read_text(encoding="utf-8", errors="replace")
    i = texto.find(f"{nombre}\n")
    if i == -1:
        i = texto.find(nombre)
    if i == -1:
        raise LookupError(f"no se encuentra {nombre!r} en el texto del SRD")
    # El cuerpo empieza tras el nombre y el precio, en el párrafo siguiente.
    j = texto.find("\n\n", i)
    cuerpo = texto[j + 2 :]
    fin = cuerpo.find("\n\n")
    plano = " ".join(cuerpo[:fin].split())
    # El SRD usa el guion blando (\u00ad) para partir palabras al final de la
    # línea; el resto de la ingesta lo quita.
    return plano.replace("­", "")


def main() -> int:
    nombre, peso, precio = fila_del_pdf()
    esperado = "Paquete de explorador de mazmorras"
    if nombre != esperado:
        print(f"el nombre del PDF es {nombre!r} y se esperaba {esperado!r}")
        return 1

    carpeta = DATOS / EDICION / "equipo"
    origen = carpeta / "paquete-de-explorador-de.md"
    destino = carpeta / "paquete-de-explorador-de-mazmorras.md"
    if not origen.exists():
        print(f"no existe {origen}")
        return 1

    frente, _ = leer(origen)
    cuerpo = cuerpo_del_srd(nombre)
    meta = {
        "name": nombre,
        "category": frente.get("category") or "Equipo de aventurero",
        "price": precio,
        "weight": peso,
        "srd": "5.2",
        "page": PAGINA,
    }
    texto = yaml.safe_dump(meta, allow_unicode=True, sort_keys=False, width=1000).strip()
    destino.write_text(f"---\n{texto}\n---\n\n{cuerpo}\n", encoding="utf-8")
    origen.unlink()
    print(f"  {nombre} ({precio}, {peso}) -> {destino.name}")
    print(f"  cuerpo: {cuerpo[:90]}...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
