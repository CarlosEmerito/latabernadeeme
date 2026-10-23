"""Quita del texto del PDF los pies de página y el número suelto que los precede.

El texto linealizado trae, al final de cada página, la línea legal del documento
(«Documento de referencia del sistema 5.1. 226», «Prohibida la reventa. Tienes
permiso para imprimir…») y a veces el número de página en su propia línea. Con
la extracción de objetos —que toma el texto plano y corta por encabezados— ese
pie acaba publicado dentro de la descripción, y cuando cae a media frase se
lleva el final del párrafo: la ficha termina contando en qué página del PDF
estaba el objeto.

El filtro por coordenada ya existe para el flujo del PDF (`FOOTER_RE` e
`is_footer` en `tools/ingest/linearize.py`), pero no vale para el texto ya
linealizado, así que aquí se limpia el texto: se quitan el pie y el número de
página pegado a él y, si el pie había partido un párrafo, se vuelve a unir la
frase («…que haya en su interior» + «permanecerá en el espacio
extradimensional»). Un párrafo que ya cierra frase se queda cerrado: el pie solo
une cuando de verdad cortó el texto.
"""
from __future__ import annotations

import re

# Cadenas con las que empieza el pie del PDF en las dos ediciones.
PIE_TEXTO = (
    "Documento de referencia del sistema",
    "Prohibida la reventa",
    "Tienes permiso para imprimir",
    "o fotocopiar este documento",
)

# El número de página puede venir delante del pie, en la misma línea
# («229 Documento de referencia del sistema 5.2.1»).
PIE_RE = re.compile(r"^(?:\d{1,4}\s+)?(?:" + "|".join(re.escape(p) for p in PIE_TEXTO) + r")")

# El pie también aparece pegado dentro de un párrafo, sin salto de línea de por
# medio («…que haya en su interior Prohibida la reventa. Tienes permiso…»), que
# es como lo dejó la extracción de objetos: en la ficha hay que quitarlo igual.
PIE_EN_LINEA = re.compile(
    r"(?:\d{1,4}\s+)?Documento de referencia del sistema(?:\s+\d[\d.]*)*\.?"
    r"|Prohibida la reventa\.?"
    r"(?:\s*Tienes permiso para imprimir o fotocopiar este documento solo para uso personal\.?)?"
    r"|Tienes permiso para imprimir o fotocopiar este documento solo para uso personal\.?"
)
NUMERO_RE = re.compile(r"^\d{1,4}$")

# Con qué se da una frase por cerrada: un pie que cae detrás de esto no ha
# partido nada y no hay que unir párrafos.
CIERRE = ".!?:;»\"')]"


def _parrafo(lineas: list[str]) -> str:
    """Une las líneas de un párrafo sin espacios de más (el pie deja uno al irse)."""
    return " ".join(" ".join(lineas).split())


def es_pie(linea: str) -> bool:
    """¿La línea es el pie de página legal del documento?"""
    return bool(PIE_RE.match(linea.strip()))


def _numero_pegado(lineas: list[str], i: int) -> int | None:
    """Índice del número de página suelto más cercano al pie de la línea `i`."""
    for paso in (-1, 1):
        j = i + paso
        saltos = 0
        while 0 <= j < len(lineas) and saltos < 2:
            limpia = lineas[j].strip()
            if limpia:
                if NUMERO_RE.match(limpia):
                    return j
                break
            j += paso
            saltos += 1
    return None


def sin_pies(texto: str) -> str:
    """Devuelve el texto sin pies de página ni números sueltos y con las frases unidas.

    Vale para el pie que ocupa su propia línea (texto linealizado) y para el que
    quedó pegado dentro de un párrafo (fichas ya publicadas). Es idempotente: un
    texto ya limpio sale igual. Solo quita un número que esté pegado a un pie;
    un número suelto lejos de él puede ser parte del texto.
    """
    lineas: list[str] = []
    con_pie: list[bool] = []
    for linea in texto.split("\n"):
        if es_pie(linea):
            if lineas:
                con_pie[-1] = True
            else:
                lineas.append("")
                con_pie.append(True)
            continue
        resto = PIE_EN_LINEA.sub("", linea).rstrip()
        lineas.append(resto)
        con_pie.append(resto != linea.rstrip())

    quitar: set[int] = set(i for i, marca in enumerate(con_pie) if marca and not lineas[i].strip())
    for i, marca in enumerate(con_pie):
        if not marca:
            continue
        numero = _numero_pegado(lineas, i)
        if numero is not None:
            quitar.add(numero)
    if not any(con_pie):
        return texto

    parrafos: list[str] = []
    actual: list[str] = []
    blanco = True
    pie_visto = False
    for i, linea in enumerate(lineas):
        if i in quitar:
            if con_pie[i]:
                pie_visto = True
            continue
        if con_pie[i]:
            pie_visto = True
        limpia = linea.strip()
        if not limpia:
            blanco = True
            continue
        if limpia.startswith("|"):
            # Una fila de tabla es una línea: unirla con la de al lado la rompe.
            if actual:
                parrafos.append(_parrafo(actual))
                actual = []
            parrafos.append(limpia)
            blanco = True
            pie_visto = False
            continue
        if blanco and actual:
            if pie_visto and actual[-1][-1] not in CIERRE:
                # El pie partió el párrafo: se sigue escribiendo el mismo.
                actual.append(limpia)
                blanco = False
                pie_visto = False
                continue
            parrafos.append(_parrafo(actual))
            actual = []
            pie_visto = False
        blanco = False
        actual.append(limpia)
    if actual:
        parrafos.append(_parrafo(actual))
    return "\n\n".join(parrafos)


def quita_pies(texto: str) -> str:
    """Quita el pie sin tocar el formato: ni rehace párrafos ni une líneas de tabla.

    Es la versión conservadora, para cuerpos ya publicados que no se pueden
    recomponer desde el texto del PDF (una tabla, un bloque de estadísticas): se
    borra el pie y, si había partido una frase, se pega el trozo que sigue a la
    línea de encima; lo demás se queda como estaba.
    """
    lineas = texto.split("\n")
    restos: list[str] = []
    quitar: set[int] = set()
    for i, linea in enumerate(lineas):
        if es_pie(linea):
            quitar.add(i)
            restos.append("")
            continue
        resto = PIE_EN_LINEA.sub("", linea).rstrip()
        if resto != linea.rstrip() and not resto.strip():
            quitar.add(i)
        restos.append(resto)
    for i in sorted(quitar):
        numero = _numero_pegado(lineas, i)
        if numero is not None:
            quitar.add(numero)
    if not quitar:
        return texto

    salida: list[str] = []
    cortado = False
    for i, resto in enumerate(restos):
        if i in quitar:
            if salida and salida[-1].strip():
                cortado = True
            continue
        if not resto.strip():
            salida.append(resto)
            continue
        if cortado:
            j = len(salida) - 1
            while j >= 0 and not salida[j].strip():
                j -= 1
            if j >= 0 and salida[j][-1] not in CIERRE:
                del salida[j + 1 :]
                salida[j] = salida[j].rstrip() + " " + resto.strip()
                cortado = False
                continue
            cortado = False
        salida.append(resto)
    return "\n".join(salida)
