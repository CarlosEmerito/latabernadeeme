#!/usr/bin/env python3
"""Quita el pie de página del PDF que se publicó dentro de los objetos.

El capítulo de objetos se extrajo del texto linealizado y ahí viaja el pie de
página de cada hoja («Documento de referencia del sistema 5.1. 226», «Prohibida
la reventa…»), así que 93 fichas lo publican dentro de su descripción: es lo
último que lee quien abre la ficha y lo que se lleva el botón de Markdown. En
las que el pie cayó a media frase, además, la ficha se quedó sin el final del
texto: en `anillo-de-almacenamiento-de-conjuros` la descripción acaba en «…y los
conserva hasta que el portador».

El parser ya no lo va a repetir —`srd/pies.py` limpia el texto antes de cortar
los cuerpos— y este script arregla lo ya publicado. Para cada ficha con pie:

1. Recompone el cuerpo desde el texto plano de su edición, entre la cabecera del
   objeto (nombre + línea de tipo) y el nombre del siguiente, que es donde está
   el texto que falta.
2. Le pasa `sin_pies`, que quita el pie y el número de página y vuelve a unir la
   frase que el pie había partido.
3. Antes de escribir, comprueba dos cosas: que el cuerpo nuevo está literal en
   el texto del PDF y que no se ha perdido nada del viejo (cada párrafo antiguo
   —el pie aparte— sigue apareciendo en el nuevo). Si una ficha no cumple, se
   deja como está y se avisa: no se cambia texto por una conjetura.

Uso:
    python3 tools/ingest/reparar_pies.py [--seco]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

from reparar_objetos import PLANTILLAS, leer, normalizar  # noqa: E402
from rutas import WORK  # noqa: E402
from srd.items import TYPE_RE  # noqa: E402
from srd.pies import PIE_TEXTO, quita_pies, sin_pies  # noqa: E402

RAIZ = AQUI.parents[1]
DATOS = RAIZ / "data"

# El objeto puede empezar en una página y seguir en la siguiente, y el pie cae
# justo en el salto: se busca el final en un margen amplio y lo que manda es el
# nombre del objeto siguiente, no la página.
PAGINAS_DE_MARGEN = 8
# La línea de tipo puede venir partida en dos («Armadura (media o pesada, pero
# no de pieles),» + «infrecuente»): se prueban hasta tres líneas seguidas.
LINEAS_DE_TIPO = 3


def _lineas_de_tipo(planas: list[str], i: int) -> int:
    """Cuántas líneas ocupa la línea de tipo que empieza en `i` (0 si no hay)."""
    trozos: list[str] = []
    for n in range(i, min(i + LINEAS_DE_TIPO, len(planas))):
        if not planas[n]:
            continue
        trozos.append(planas[n])
        if TYPE_RE.match(" ".join(trozos)):
            return len(trozos)
    return 0


def _lineas_del_nombre(planas: list[str], i: int, busca: str) -> int:
    """Cuántas líneas ocupa el nombre que empieza en `i` (0 si no es el nombre).

    El plano corta las líneas por el ancho de la columna, así que un nombre
    largo («Brasero para controlar elementales de fuego») llega partido.
    """
    trozos: list[str] = []
    for n in range(i, min(i + 3, len(planas))):
        if not planas[n]:
            continue
        trozos.append(planas[n])
        junto = normalizar(" ".join(trozos)).lower()
        if junto == busca:
            return len(trozos)
        if not busca.startswith(junto):
            return 0
    return 0


def cuerpo_desde_plano(paginas: list[str], nombre: str, pagina: int, nombres: set[str]) -> str | None:
    """Texto del objeto en el plano: de su cabecera al objeto siguiente, sin el pie."""
    planas: list[str] = []
    for n in range(max(0, pagina - 1), min(pagina + PAGINAS_DE_MARGEN, len(paginas))):
        planas += [l.strip() for l in paginas[n].split("\n")]

    busca = normalizar(nombre).lower()
    inicio = None
    for i in range(len(planas)):
        lineas_nombre = _lineas_del_nombre(planas, i, busca)
        if not lineas_nombre:
            continue
        # Un nombre mencionado dentro de otro objeto no es una cabecera: la
        # cabecera lleva la línea de tipo detrás.
        salto = 0
        for n in range(i + lineas_nombre, min(i + lineas_nombre + 5, len(planas))):
            if planas[n]:
                salto = n
                break
        if not salto:
            continue
        lineas_tipo = _lineas_de_tipo(planas, salto)
        if lineas_tipo:
            inicio = salto + lineas_tipo
            break
    if inicio is None:
        return None

    cuerpo: list[str] = []
    for linea in planas[inicio:]:
        if normalizar(linea).lower() in nombres and normalizar(linea).lower() != busca:
            break
        cuerpo.append(linea)
    texto = sin_pies("\n".join(cuerpo)).strip()
    return texto or None


def parrafos(texto: str) -> list[str]:
    return [normalizar(p) for p in re.split(r"\n\s*\n", texto) if p.strip()]


def main() -> int:
    seco = "--seco" in sys.argv
    tocadas = recortadas = fallos = 0
    for ed, (plantilla, _flujo) in PLANTILLAS.items():
        carpeta = DATOS / ed / "objetos"
        paginas = (WORK / plantilla).read_text(encoding="utf-8", errors="replace").split("\f")
        plano = normalizar(sin_pies("\n".join(paginas)))
        nombres = {normalizar(leer(f)[0].get("name", "")).lower() for f in carpeta.glob("*.md")}
        arregladas = 0
        for f in sorted(carpeta.glob("*.md")):
            datos, cuerpo = leer(f)
            if not any(pie in cuerpo for pie in PIE_TEXTO):
                continue
            nombre = normalizar(str(datos.get("name", "")))
            nuevo = cuerpo_desde_plano(paginas, nombre, int(datos.get("page") or 1), nombres)
            motivo = ""
            if not nuevo:
                motivo = "no se pudo recomponer desde el texto plano"
            elif normalizar(nuevo) not in plano:
                motivo = "el texto recompuesto no es literal del PDF"
            elif len(nuevo.split()) > len(cuerpo.split()) * 1.25 + 40:
                # Última página de una sección: detrás no hay otro objeto, así
                # que la captura se lleva el capítulo siguiente por delante.
                motivo = "el texto recompuesto es mucho más largo que la ficha"
            else:
                perdido = [p for p in parrafos(sin_pies(cuerpo)) if p not in normalizar(nuevo)]
                if perdido:
                    motivo = f"se perdería texto ({perdido[0][:50]}…)"
            if motivo:
                # El cuerpo no se puede rehacer sin arriesgar texto (una tabla,
                # un objeto que el plano pinta en otro orden): se quita el pie
                # del cuerpo que hay y se avisa de que no se ha recuperado nada.
                nuevo = quita_pies(cuerpo).strip()
                if not nuevo or any(pie in nuevo for pie in PIE_TEXTO):
                    print(f"  ? {f.name}: {motivo}, y el pie sigue dentro")
                    fallos += 1
                    continue
                recortadas += 1
                print(f"  · {f.name}: {motivo}; se quita el pie sin recomponer")
            arregladas += 1
            tocadas += 1
            if not seco:
                meta = yaml.safe_dump(datos, allow_unicode=True, sort_keys=False, width=1000).strip()
                f.write_text(f"---\n{meta}\n---\n\n{nuevo}\n", encoding="utf-8")
        print(f"{ed}: {arregladas} fichas sin pie")
    verbo = "arreglaría" if seco else "arregladas"
    print(f"{verbo} {tocadas} fichas ({recortadas} solo quitando el pie), {fallos} sin tocar")
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
