#!/usr/bin/env python3
"""Repara los cuerpos de objetos cuya transcripción no es literal.

El extractor de objetos usa dos fuentes: el flujo por coordenadas y, cuando
falla, el texto plano. En algunos casos el resultado sale reescrito, truncado o
con un pie de página dentro. Este script detecta esos ficheros (el cuerpo no
aparece literal en el texto del PDF), vuelve al texto plano página a página y
recompone el cuerpo entre el nombre del objeto y el siguiente.

Uso:
    .venv-ingest/bin/python tools/ingest/reparar_objetos.py [--seco]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rutas import CACHE, WORK  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2]
DATOS = RAIZ / "data"

PLANTILLAS = {"ed51": ("es51.txt", "e51.jsonl"), "ed52": ("es52.txt", "e52.jsonl")}
RUIDO = (
    "Documento de referencia del sistema",
    "Prohibida la reventa",
    "Tienes permiso para imprimir",
    "o fotocopiar este documento",
)


def leer(p: Path):
    s = p.read_text(encoding="utf-8")
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?", s)
    return yaml.safe_load(m.group(1)) or {}, s[m.end() :]


def normalizar(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip()


def es_ruido(linea: str) -> bool:
    return any(linea.startswith(r) for r in RUIDO) or bool(re.fullmatch(r"\d{1,3}", linea.strip()))


def parrafos(lineas: list[str]) -> list[str]:
    """Une líneas en párrafos: se corta cuando la anterior cierra frase."""
    salida: list[str] = []
    actual = ""
    for linea in lineas:
        linea = linea.strip()
        if not linea:
            if actual:
                salida.append(actual)
                actual = ""
            continue
        if actual.endswith("-"):
            actual = actual[:-1] + linea
        elif actual:
            actual += " " + linea
        else:
            actual = linea
        if re.search(r"[.:;!?»]$", linea) and len(linea) < 90:
            salida.append(actual)
            actual = ""
    if actual:
        salida.append(actual)
    return salida


def main() -> int:
    seco = "--seco" in sys.argv
    for ed, (plantilla, flujo_jsonl) in PLANTILLAS.items():
        texto = (WORK / plantilla).read_text(encoding="utf-8", errors="replace")
        paginas = texto.split("\f")
        flujo = normalizar(" ".join(l.text for l in _lineas(flujo_jsonl)))
        plano = normalizar(texto)
        carpeta = DATOS / ed / "objetos"
        nombres = {
            normalizar(leer(f)[0].get("name", "")).lower(): f for f in carpeta.glob("*.md")
        }
        reparados, revisados = 0, 0
        for f in sorted(carpeta.glob("*.md")):
            datos, cuerpo = leer(f)
            revisados += 1
            frag = normalizar(cuerpo)[:70]
            parece_tipo = bool(
                re.search(r"(infrecuente|poco común|raro|muy raro|legendario|varía|artefacto|común)", frag, re.I)
            ) and len(frag.split()) < 12
            if parece_tipo:
                pass  # el cuerpo es en realidad la línea de tipo: hay que rehacerlo
            elif len(frag.split()) < 6 or frag in flujo:
                continue
            pagina = int(datos.get("page") or 1)
            nombre = normalizar(str(datos.get("name", "")))
            lineas: list[str] = []
            capturando = False
            # Se prueban la página indicada y las dos siguientes, pero también
            # cualquier otra aparición del nombre seguida de una línea de tipo:
            # el índice del capítulo repite los nombres y despista.
            orden = list(range(pagina - 1, min(pagina + 2, len(paginas))))
            for n in orden:
                if capturando:
                    break
                for linea in paginas[n].split("\n"):
                    limpia = linea.strip()
                    if not capturando:
                        if normalizar(limpia).lower() == nombre.lower():
                            capturando = True
                        continue
                    if es_ruido(limpia):
                        continue
                    if normalizar(limpia).lower() in nombres and normalizar(limpia).lower() != nombre.lower():
                        capturando = False
                        break

                    lineas.append(limpia)
                if not capturando and lineas:
                    break
            nuevo = "\n\n".join(parrafos(lineas)).strip()
            if len(nuevo) < 40:
                print(f"  ? {f.name}: no se pudo reconstruir")
                continue
            if normalizar(nuevo)[:70] not in plano and normalizar(nuevo)[:70] not in flujo:
                print(f"  ✗ {f.name}: el texto reconstruido tampoco es literal")
                continue
            reparados += 1
            if not seco:
                meta = yaml.safe_dump(datos, allow_unicode=True, sort_keys=False, width=1000).strip()
                f.write_text(f"---\n{meta}\n---\n\n{nuevo}\n", encoding="utf-8")
        print(f"{ed}: {reparados} reparados de {revisados}")


def _lineas(fichero: str):
    from srd import stream

    return stream.load(WORK / fichero)


if __name__ == "__main__":
    raise SystemExit(main())
