"""Extrae los panteones del apéndice del SRD 5.1 y los convierte en una entrada.

El PDF maqueta las tablas en columnas; `pdftotext -layout` conserva su alineación,
así que las filas se reconstruyen por posición de columna y las continuaciones
(líneas sin nombre, con texto en las columnas de dominios o símbolo) se pegan a la
fila anterior.

Uso: .venv-ingest/bin/python tools/ingest/extraer_panteones.py [--dry-run]
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
PDF = RAIZ / ".cache/srd/srd-5.1-es.pdf"
DESTINO = RAIZ / "data/ed51/reglas/panteones.md"

PANTEONES = ["celtas", "egipcias", "griegas", "nórdicas"]


def texto_apendice() -> str:
    salida = subprocess.run(
        ["pdftotext", "-layout", "-f", "391", "-l", "394", str(PDF), "-"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return salida


def bloques_tabla(texto: str) -> dict[str, list[list[str]]]:
    """Devuelve {panteón: filas} con las cuatro columnas de cada deidad."""
    lineas = texto.split("\n")
    tablas: dict[str, list[list[str]]] = {}

    for panteon in PANTEONES:
        cabecera_titulo = f"Deidades {panteon}"
        try:
            i = next(k for k, l in enumerate(lineas) if l.strip() == cabecera_titulo)
        except StopIteration:
            continue
        cabecera = lineas[i + 1]
        cols = {}
        for etiqueta in ("Alineamiento", "Dominios", "Símbolo"):
            cols[etiqueta] = cabecera.find(etiqueta)
        cols["Deidad"] = cabecera.find("Deidad")
        cortes = sorted(cols.items(), key=lambda kv: kv[1])

        filas: list[list[str]] = []
        for linea in lineas[i + 2 :]:
            if not linea.strip() or "Prohibida la reventa" in linea or "Documento de referencia" in linea:
                # El pie de página no cierra la tabla: sigue en la página siguiente.
                continue
            if re.match(r"^\s*(Deidades \w+|Apéndice|El panteón)", linea):
                break
            celdas = []
            for n, (_, x) in enumerate(cortes):
                fin = cortes[n + 1][1] if n + 1 < len(cortes) else None
                celdas.append(linea[x:fin].strip() if x >= 0 else "")
            if not any(celdas):
                continue
            if celdas[0]:
                filas.append(celdas)
            elif filas:
                # continuación de la fila anterior
                for n, valor in enumerate(celdas):
                    if valor:
                        filas[-1][n] = (filas[-1][n] + " " + valor).strip()
        tablas[panteon] = filas
    return tablas


def markdown(tablas: dict[str, list[list[str]]]) -> str:
    partes = [
        "Estos panteones son interpretaciones fantásticas de religiones históricas. Sirven para "
        "elegir deidad de clérigo o paladín, y para dar trasfondo a cultos y templos.",
        "",
    ]
    for panteon, filas in tablas.items():
        partes.append(f"## Deidades {panteon}")
        partes.append("")
        partes.append("| Deidad | Alineamiento | Dominios recomendados | Símbolo |")
        partes.append("| --- | --- | --- | --- |")
        for f in filas:
            partes.append("| " + " | ".join(c.replace("|", "/") for c in f) + " |")
        partes.append("")
    return "\n".join(partes)


def main() -> int:
    tablas = bloques_tabla(texto_apendice())
    for p, filas in tablas.items():
        print(f"{p}: {len(filas)} deidades")
    cuerpo = markdown(tablas)
    if "--dry-run" in sys.argv:
        print(cuerpo[:1200])
        return 0
    DESTINO.write_text(
        "---\n"
        "name: Panteones\n"
        "category: Ambientación\n"
        'srd: "5.1"\n'
        "page: 391\n"
        "---\n\n" + cuerpo + "\n",
        encoding="utf-8",
    )
    print(f"escrito {DESTINO.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
