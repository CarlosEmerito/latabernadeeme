"""Auditoría de cobertura: qué hay en el SRD que no esté en data/.

Compara el índice del PDF (marcadores en 5.1, tabla de contenido en 5.2) con las
entradas de `data/ed51` y `data/ed52`, y lista lo que falta por sección.

Uso: .venv-ingest/bin/python tools/verify/cobertura.py [5e|5.5]
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CACHE = RAIZ / ".cache/srd"
PDF = {
    "5e": CACHE / "srd-5.1-es.pdf",
    "5.5": CACHE / "srd-5.2.1-es.pdf",
}
TXT = {
    "5e": CACHE / "work/es51.txt",
    "5.5": CACHE / "work/es52.txt",
}
DATOS = {"5e": "ed51", "5.5": "ed52"}

# Secciones del índice que corresponden a un tipo de nuestra base.
SECCIONES = {
    "razas": "especies",
    "clases": "clases",
    "trasfondos": "trasfondos",
    "dotes": "dotes",
    "conjuros": "conjuros",
    "objetos mágicos": "objetos",
    "monstruos": "monstruos",
}


def normaliza(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s.lower())
    return s.strip()


def slug(s: str) -> str:
    return re.sub(r"-+", "-", normaliza(s).replace(" ", "-")).strip("-")


def entradas(ed: str) -> dict[str, set[str]]:
    salida: dict[str, set[str]] = {}
    base = RAIZ / "data" / DATOS[ed]
    for tipo_dir in base.iterdir():
        if not tipo_dir.is_dir():
            continue
        nombres = set()
        for f in tipo_dir.glob("*.md"):
            texto = f.read_text(encoding="utf-8")
            m = re.search(r"^name:\s*(.+)$", texto, re.M)
            nombres.add(normaliza(m.group(1) if m else f.stem))
            nombres.add(normaliza(f.stem.replace("-", " ")))
        salida[tipo_dir.name] = nombres
    return salida


def indice_51() -> list[tuple[int, str, int]]:
    import pypdf

    r = pypdf.PdfReader(PDF["5e"])
    salida: list[tuple[int, str, int]] = []

    def walk(nivel, items):
        for it in items:
            if isinstance(it, list):
                walk(nivel + 1, it)
            else:
                try:
                    p = r.get_destination_page_number(it) + 1
                except Exception:
                    p = 0
                salida.append((nivel, it.title, p))

    walk(0, r.outline)
    return salida


def indice_52() -> list[tuple[int, str, int]]:
    """El PDF 5.2.1 no trae marcadores: se lee su tabla de contenido."""
    texto = TXT["5.5"].read_text(encoding="utf-8")
    inicio = texto.find("Contenido")
    fin = texto.find("\f", inicio + 20)
    toc = texto[inicio:fin]
    salida: list[tuple[int, str, int]] = []
    for linea in toc.split("\n"):
        linea = linea.strip()
        m = re.match(r"^(.*?)\.{2,}\s*(\d+)$", linea)
        if not m:
            continue
        titulo = m.group(1).strip()
        pagina = int(m.group(2))
        salida.append((0, titulo, pagina))
    return salida


def seccion_de(titulo: str) -> str | None:
    t = normaliza(titulo)
    for clave, tipo in SECCIONES.items():
        if t == clave or t.startswith(clave):
            return tipo
    if "objetos magicos de la a a la z" in t:
        return "objetos"
    return None


def main():
    ed = sys.argv[1] if len(sys.argv) > 1 else "5.5"
    datos = entradas(ed)
    indice = indice_51() if ed == "5e" else indice_52()

    # Recorre el índice agrupando por sección vigente.
    actual = None
    por_tipo: dict[str, list[str]] = {}
    for nivel, titulo, _pagina in indice:
        tipo = seccion_de(titulo)
        if tipo:
            actual = tipo
            continue
        if nivel > 1 and actual is None:
            continue
        if actual and nivel <= 1:
            por_tipo.setdefault(actual, []).append(titulo)

    print(f"== {ed} · {DATOS[ed]}")
    for tipo, nombres in por_tipo.items():
        conocidos = datos.get(tipo, set())
        faltan = [n for n in nombres if normaliza(n) not in conocidos and slug(n) not in conocidos]
        print(f"\n{tipo}: {len(nombres)} en el índice, {len(conocidos)} en la web, faltan {len(faltan)}")
        for n in faltan[:40]:
            print("   ·", n)


if __name__ == "__main__":
    main()
