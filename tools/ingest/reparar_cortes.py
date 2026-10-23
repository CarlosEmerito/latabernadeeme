#!/usr/bin/env python3
"""Recompone en `data/` las palabras que el guion del maquetador dejó partidas.

El parser (`tools/ingest/srd/`) ya las recompone al extraer, pero solo dos
carpetas se regeneran con él: `conjuros` y `monstruos` salen de
`extract_core.py`. `objetos`, `clases` y `reglas` se generaron con versiones
anteriores del pipeline que no reproducen `data/` —volver a pasarlas cambia
cientos de fichas por motivos que no son este arreglo—, así que la reparación
se aplica sobre las fichas publicadas:

1. Las frases en las que el trozo del guion viajó a otra línea se escriben
   enteras: unirlas sin más da «hela lista» o «heroísnivel». El texto correcto
   está tomado del texto linealizado (`.cache/srd/work/es5x.txt`), que sí lo
   conserva en orden.
2. Se quita el pie de página del PDF que cae dentro de la descripción (el
   número de página y la línea legal) cuando el texto continúa detrás.
3. Se une la palabra partida al final de la línea («transfor-» + «mas») y la
   que se partió dentro de la línea («intermina- ble»).

Es idempotente: lo que ya está reparado no se toca, y si una frase testigo no
aparece donde debería el script falla en vez de dejar el fichero a medias.

Uso:
  python3 tools/ingest/reparar_cortes.py            # repara data/
  python3 tools/ingest/reparar_cortes.py --check    # solo cuenta, no escribe
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DATOS = RAIZ / "data"

LETRAS = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ"

PIE_TEXTO = (
    "Prohibida la reventa",
    "Tienes permiso para imprimir",
    "o fotocopiar este documento",
    "Documento de referencia del sistema",
)

# Frases en las que el trozo que sobra no continúa la palabra de delante sino
# que pertenece a otra parte de la frase. Se escribe el texto correcto entero.
VIAJADOS: tuple[tuple[str, str, str], ...] = (
    (
        "ed52/clases/bardo.md",
        "de nivel 1 de he- la lista",
        "de nivel 1 de la lista",
    ),
    (
        "ed52/clases/bardo.md",
        "Se recomiendan chizar persona",
        "Se recomiendan hechizar persona",
    ),
    (
        "ed52/clases/clerigo.md",
        "de nivel 1 de ben- la lista",
        "de nivel 1 de la lista",
    ),
    (
        "ed52/clases/clerigo.md",
        "Se recomiendan dición",
        "Se recomiendan bendición",
    ),
    (
        "ed52/clases/druida.md",
        "con los animales, por hablar con los ani- lo que siempre tienes el conjuro males preparado",
        "con los animales, por lo que siempre tienes el conjuro hablar con los animales preparado",
    ),
    (
        "ed52/clases/paladin.md",
        "de castigo abrasador heroís- nivel 1. Se recomiendan y mo.",
        "de nivel 1. Se recomiendan castigo abrasador y heroísmo.",
    ),
    # El texto de la varita se corta en «determi-» y el final no llegó a la
    # ficha: la descripción termina a media palabra.
    (
        "ed52/objetos/varita-del-mago-de-guerra-1-2-o-3.md",
        "de conjuro determi-",
        "de conjuro determinado por la rareza de la varita. Además, ignorarás la cobertura media "
        "cuando realices una tirada de ataque de conjuro.",
    ),
    (
        "ed51/conjuros/conocer-las-leyendas.md",
        "solo si pronun-\n\nRudnogg”. cian sus labios la palabra sagrada",
        "solo si pronuncian sus labios la palabra sagrada Rudnogg”.",
    ),
    # El parser une «capaz para habl-» con «tuaciones» y el párrafo resultante
    # se queda sin «Nombre.» delante, así que `monsters.parse` lo tira entero
    # (bug aparte, ver docs/DATOS.md): aquí se devuelve el texto del rasgo.
    (
        "ed51/monstruos/dragon-de-oropel-anciano.md",
        "a elección del dragón.",
        "a elección del dragón. Mientras asuma su nueva forma, el dragón mantendrá su alineamiento, "
        "puntos de golpe, Dados de Golpe, capacidad para hablar, competencias, Resistencia Legendaria, "
        "acciones en guarida y puntuaciones de Inteligencia, Sabiduría y Carisma, así como esta acción. "
        "El resto de su perfil y capacidades son reemplazadas por las de la nueva forma, aunque no "
        "obtiene ni los rasgos de clase ni las acciones legendarias de esta.",
    ),
)

CORTE_FIN = re.compile(rf"([{LETRAS}])-[ \t]*\n[ \t\n]*([a-záéíóúüñ])")
CORTE_MEDIO = re.compile(rf"([{LETRAS}]+)-[ \t]+([a-záéíóúüñ])")


def sin_pies(texto: str) -> str:
    """Quita el pie de página que se cuela entre una palabra partida y su final.

    Solo se toca el pie que rompe una palabra («…El esca-» + «252» +
    «Documento de referencia del sistema 5.2.1» + «rabajo se convertirá en
    polvo»). El pie que cae entre dos frases enteras es otro problema —se
    publica dentro de la descripción de 96 fichas— y no se toca aquí.
    """
    lineas = texto.split("\n")
    cortes: set[int] = set()
    for i, linea in enumerate(lineas):
        if not re.search(rf"[{LETRAS}]-[ \t]*$", linea):
            continue
        j = i + 1
        pies: list[int] = []
        while j < len(lineas):
            limpia = lineas[j].strip()
            if not limpia:
                j += 1
                continue
            if limpia.isdigit() or limpia.startswith(PIE_TEXTO):
                pies.append(j)
                j += 1
                continue
            break
        if pies and j < len(lineas) and lineas[j].strip()[:1].islower():
            cortes.update(pies)
    return "\n".join(l for n, l in enumerate(lineas) if n not in cortes)


def repara_viajados(ruta: Path, texto: str) -> str:
    for fichero, antes, despues in VIAJADOS:
        if ruta.relative_to(DATOS).as_posix() != fichero:
            continue
        if despues in texto:
            continue
        if antes not in texto:
            raise SystemExit(f"{fichero}: no encuentro la frase a reparar ({antes!r})")
        texto = texto.replace(antes, despues, 1)
    return texto


def main() -> int:
    solo_comprobar = "--check" in sys.argv
    tocados = 0
    cortes = 0
    for ruta in sorted(DATOS.glob("*/*/*.md")):
        original = ruta.read_text(encoding="utf-8")
        texto = repara_viajados(ruta, original)
        texto = sin_pies(texto)
        un_fin = len(CORTE_FIN.findall(texto))
        un_medio = len(CORTE_MEDIO.findall(texto))
        texto = CORTE_FIN.sub(r"\1\2", texto)
        texto = CORTE_MEDIO.sub(r"\1\2", texto)
        if texto != original:
            tocados += 1
            cortes += un_fin + un_medio
            if not solo_comprobar:
                ruta.write_text(texto, encoding="utf-8")
    verbo = "repararía" if solo_comprobar else "reparado"
    print(f"{verbo} {cortes} cortes en {tocados} fichas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
