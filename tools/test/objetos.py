#!/usr/bin/env python3
"""Que las fichas de objetos no acaben a mitad de frase.

El cuerpo de un objeto se corta en el límite de página o de columna del PDF y
no sigue en la siguiente, así que la ficha se publica sin el final de su propia
descripción: `pocion-de-veneno` acaba en «Sin embargo,» y no llega a decir el
daño ni la CD, `piedra-ioun` se queda sin ocho de sus piedras, y
`varita-de-detectar-enemigos` pierde su último párrafo y lleva dentro la tabla
de `varita-de-las-maravillas`.

La comprobación tiene tres partes, y las tres son necesarias:

1. **Anclas positivas.** El texto que hoy falta, buscado literal en la ficha.
   Es lo que demuestra que el arreglo recompone el cuerpo y no solo lo disimula.
2. **Anclas negativas.** La ficha no puede llevar texto de otro objeto. Se
   acompaña del contrapeso: la tabla sigue en la ficha a la que pertenece, así
   que el arreglo no puede consistir en borrarla de las dos.
3. **La firma del corte.** Un cuerpo no acaba en palabra funcional suelta ni en
   coma. Es la regla general, la que vigila las fichas que nadie ha mirado: las
   cuatro que hoy fallan por aquí son las cuatro que se cortan a media frase
   (`…una vez que`, `…en la que`, `…alrededor de tu`, `…Sin embargo,`), y las
   que acaban en una celda de tabla o en una lista de nombres —legítimas— no
   entran.

No lee `.cache/` (no se versiona): las anclas viven aquí, como en `pies.py` y
en las fichas testigo de `validar.py`.
"""
import glob
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATOS = os.path.join(RAIZ, "data")
EDICIONES = ("ed51", "ed52")

# Texto que hoy se pierde, por ficha. Cada cadena es una frase del SRD que la
# ficha publicada no llega a tener.
ANCLAS = {
    ("ed51", "estatuilla-de-poder-maravilloso"): [
        "se utilice, no podrá volver a usarse hasta que hayan pasado 2 días",
        "Cabras de marfil",
    ],
    ("ed51", "varita-de-detectar-enemigos"): [
        "se encuentra la criatura hostil más cercana a ti que esté a 18 m o menos",
    ],
    ("ed52", "pocion-de-veneno"): [
        "4d6 de daño de veneno",
        "CD 13",
    ],
    ("ed52", "bolsa-de-contencion"): [
        "abre un portal al Plano Astral",
    ],
    ("ed52", "piedra-ioun"): [
        "bonificador por competencia aumenta en 1",
        "Regeneración",
    ],
    ("ed52", "botas-de-velocidad"): [
        "desventaja en la tirada de ataque",
        "un total de 10 minutos",
    ],
    ("ed52", "pergamino-de-conjuro"): [
        "el pergamino de conjuro se destruirá",
    ],
}

# Texto de otro objeto que hoy está dentro de una ficha y no le toca.
AJENO = {
    ("ed51", "varita-de-detectar-enemigos"): [
        "Lanzas ralentizar",
        "Lanzas fuego feérico",
        "Crees que algo asombroso acaba de ocurrir",
    ],
}

# Contrapeso de lo anterior: la tabla tiene que seguir donde sí va.
CONTRAPESO = {
    ("ed51", "varita-de-las-maravillas"): ["Lanzas ralentizar", "Lanzas fuego feérico"],
}

# Una frase que se corta acaba en una de estas palabras: son las que piden algo
# detrás («…una vez que», «…la dirección en la que», «…alrededor de tu»).
FUNCIONALES = {
    "que", "de", "del", "la", "el", "los", "las", "y", "e", "o", "u", "en", "con", "por",
    "para", "su", "sus", "un", "una", "unos", "unas", "tu", "tus", "cualquier", "segun",
    "como", "al", "se", "no", "mas", "muy", "este", "esta", "estos", "estas", "otro",
    "otra", "entre", "desde", "hacia", "sobre",
}

CIERRE = (".", ";", ":", "!", "?", "»", ")", "]", "…")


def cuerpo_de(ruta):
    """El cuerpo de la ficha, sin el frontmatter."""
    with open(ruta, encoding="utf-8") as f:
        texto = f.read()
    if not texto.startswith("---"):
        return ""
    partes = texto.split("---", 2)
    return partes[2].strip() if len(partes) == 3 else ""


def ultima_linea_de_prosa(cuerpo):
    """La última línea del cuerpo que no es tabla ni encabezado."""
    for linea in reversed(cuerpo.splitlines()):
        limpia = linea.strip()
        if not limpia or limpia.startswith(("|", "#", "---")):
            continue
        return limpia
    return ""


def fichas():
    """(edición, slug, ruta) de todas las fichas de objetos."""
    for ed in EDICIONES:
        for ruta in sorted(glob.glob(os.path.join(DATOS, ed, "objetos", "*.md"))):
            yield ed, os.path.splitext(os.path.basename(ruta))[0], ruta


def comprobar():
    problemas = []
    total = 0
    for ed, slug, ruta in fichas():
        total += 1
        cuerpo = cuerpo_de(ruta)

        for frase in ANCLAS.get((ed, slug), []):
            if frase not in cuerpo:
                problemas.append(
                    f"{ed}/objetos/{slug}: falta «{frase}» — el cuerpo se corta antes de su propio final."
                )

        for frase in AJENO.get((ed, slug), []):
            if frase in cuerpo:
                problemas.append(
                    f"{ed}/objetos/{slug}: lleva texto de otro objeto («{frase}»)."
                )

        for frase in CONTRAPESO.get((ed, slug), []):
            if frase not in cuerpo:
                problemas.append(
                    f"{ed}/objetos/{slug}: ha perdido «{frase}», que sí es suyo."
                )

        if not cuerpo:
            problemas.append(f"{ed}/objetos/{slug}: la ficha no tiene cuerpo.")
            continue

        ultima = ultima_linea_de_prosa(cuerpo)
        if not ultima or ultima.endswith(CIERRE):
            continue
        palabras = re.findall(r"[a-záéíóúüñ]+", re.sub(r"[.,;:]+$", "", ultima).lower())
        if ultima.endswith(",") or (palabras and palabras[-1] in FUNCIONALES):
            problemas.append(
                f"{ed}/objetos/{slug}: acaba a media frase («…{ultima[-60:]}»)."
            )

    return total, problemas


def main():
    total, problemas = comprobar()
    if problemas:
        print(f"✗ Fichas de objetos cortadas o con texto ajeno: {len(problemas)} problema(s) en {total} fichas.")
        for p in problemas:
            print(f"  ✗ {p}")
        print(
            "  El cuerpo de un objeto no puede acabar donde acaba la página: "
            "sigue en la columna o la hoja siguiente (mira `(page, col, y)` en el JSONL)."
        )
        return 1
    print(f"✓ Objetos completos: {total} fichas con su texto entero, sin texto de otro objeto y sin cortes a media frase.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
