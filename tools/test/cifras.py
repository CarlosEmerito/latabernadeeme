#!/usr/bin/env python3
"""Comprueba que los recuentos que declaran los informes cuadran con los datos.

Varios informes versionados se leen como fuente de datos y sus cifras se
quedaron atrás: `docs/informes/reglas.md` declaraba 44 entradas en el 5.1 y
218 en total (hoy hay 47 y 221), `docs/informes/monstruos.md` declaraba 302 y
315 criaturas (hoy 317 y 330) y `docs/DATOS.md` hablaba de 2.457 entradas y de
un índice de 306 KB (hoy 2.490 y unos 300 KB). Es el mismo hueco que la tabla
del README, que `validar.py` ya vigila: ningún paso miraba estos ficheros, así
que el siguiente lote de fichas volvió a dejar los informes mintiendo en
silencio, y quien los leyera se creería que el SRD 5.1 tiene 44 reglas y que
no existe la categoría Ambientación.

Este paso vuelve a medir cada cifra desde `data/` y desde `dist/datos/` y la
compara con la que declara el informe:

  - `docs/informes/reglas.md`: entradas, palabras y tablas de cada edición, el
    total y las dos tablas por categoría (al 5.1 le faltaba la fila de
    Ambientación, con tres entradas).
  - `docs/informes/monstruos.md`: las fichas de cada edición y las que no
    declaran apartado «Acciones».
  - `docs/informes/clases.md` y `docs/informes/origenes-equipo.md`: las cifras
    de monstruos que citan de paso, que seguían diciendo 302 y 315, y la
    tabla de ficheros por carpeta y el desglose de equipo.
  - `docs/informes/objetos.md`: los ficheros de cada edición.
  - `docs/DATOS.md`: el total de entradas, el tamaño del índice de cada
    edición con y sin comprimir, y las listas de categorías de equipo y de
    dotes.
  - `docs/VERIFICACION.md`: la cifra de comprobaciones que el paso 33 declara
    de `tools/test/commander.mjs` contra las que la suite publica al correrla.
    Decía 176 cuando ya eran 190, y es la misma familia de cifra escrita a mano
    que nadie compara con el dato.

Lo que no se puede derivar de `data/` —la fidelidad literal de las criaturas,
que sale de comparar cada ficha con el PDF— se queda como la instantánea que
dio la auditoría, y el informe lo dice.

Las cifras se miden siempre igual, que es lo que las hace comparables:
las entradas son los ficheros `.md` de la carpeta; las palabras, las que
cuenta `cat data/<edición>/reglas/*.md | wc -w`; y las tablas, las entradas
cuyo cuerpo trae alguna tabla Markdown.

El tamaño comprimido se mide con la zlib de Python, que no es bit a bit la
misma que la de `gzip` (cambia en unas decenas de bytes), así que ahí se
acepta un KB de margen: lo que se vigila es que el número siga siendo del
orden del real, no que coincida al byte.

Uso: .venv-ingest/bin/python tools/test/cifras.py   (necesita PyYAML, como validar.py)
"""
from __future__ import annotations

import gzip
import re
import shutil
import subprocess
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

# Las dos ediciones del corpus y el nombre con el que cada informe las llama.
EDICIONES = ("ed51", "ed52")
ETIQUETAS = {"ed51": "SRD 5.1", "ed52": "SRD 5.2.1"}

# Los espacios que separan los miles en un número escrito por un humano.
ESPACIOS = (" ", " ", " ", " ")

# Margen en KB para el tamaño comprimido: la zlib de Python y el `gzip` del
# sistema no comprimen igual, y el número que se publica es una aproximación.
MARGEN_GZIP = 1


# --------------------------------------------------------------------- medidas


def _ficheros(carpeta: Path) -> list[Path]:
    return sorted(carpeta.glob("*.md"))


def _palabras(carpeta: Path) -> int:
    """Palabras de la carpeta, como las cuenta `cat *.md | wc -w`.

    Los ficheros se concatenan tal cual, con lo que un fichero sin salto de
    línea final juntaría su última palabra con la primera del siguiente, que
    es justo lo que hace `cat`.
    """
    texto = "".join(f.read_text(encoding="utf-8") for f in _ficheros(carpeta))
    return len(texto.split())


def _con_tabla(carpeta: Path) -> int:
    """Ficheros cuyo cuerpo trae alguna tabla Markdown."""
    total = 0
    for f in _ficheros(carpeta):
        contenido = validar.leer(f)
        if contenido is None:
            continue
        _, cuerpo = contenido
        for linea in cuerpo.splitlines():
            s = linea.strip()
            if s.startswith("|") and s.endswith("|") and len(s) > 2:
                total += 1
                break
    return total


def _categorias(carpeta: Path) -> dict[str, int]:
    """Categoría del frontmatter de cada ficha, y cuántas hay de cada una.

    Las fichas sin categoría (los gastos del equipo, que el SRD no clasifica)
    no cuentan: el informe enumera las categorías que existen, no las que
    faltan.
    """
    conteo: dict[str, int] = {}
    for f in _ficheros(carpeta):
        contenido = validar.leer(f)
        if contenido is None:
            continue
        datos, _ = contenido
        categoria = str(datos.get("category") or "").strip()
        if not categoria:
            continue
        conteo[categoria] = conteo.get(categoria, 0) + 1
    return conteo


def _sin_categoria(carpeta: Path) -> int:
    """Fichas sin categoría en el frontmatter."""
    total = 0
    for f in _ficheros(carpeta):
        contenido = validar.leer(f)
        if contenido is None:
            continue
        datos, _ = contenido
        if not str(datos.get("category") or "").strip():
            total += 1
    return total


def _sin_acciones(carpeta: Path) -> int:
    """Ficheros cuyo cuerpo no trae el apartado «Acciones»."""
    total = 0
    for f in _ficheros(carpeta):
        contenido = validar.leer(f)
        if contenido is None:
            continue
        _, cuerpo = contenido
        if "## Acciones" not in cuerpo:
            total += 1
    return total


def _paginas_de_fichero(carpeta: Path) -> list[int]:
    """La página del PDF de la que sale cada ficha de la carpeta.

    El frontmatter de cada ficha lleva su `page`, que es de dónde se extrajo
    el texto.
    """
    paginas: list[int] = []
    for f in _ficheros(carpeta):
        contenido = validar.leer(f)
        if contenido is None:
            continue
        datos, _ = contenido
        pagina = datos.get("page")
        if isinstance(pagina, int):
            paginas.append(pagina)
    return paginas


def _tramos(celda: str) -> list[tuple[int, int]] | None:
    """Los tramos de página que declara una celda del tipo «79-110, 209-220»."""
    tramos: list[tuple[int, int]] = []
    for parte in celda.split(","):
        parte = parte.strip()
        if not parte:
            continue
        m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", parte)
        if m:
            tramos.append((int(m.group(1)), int(m.group(2))))
            continue
        if re.fullmatch(r"\d+", parte):
            tramos.append((int(parte), int(parte)))
            continue
        return None
    return tramos


def _kib(bytes_: int) -> int:
    """Los KB que declara un informe: el tamaño redondeado a la unidad."""
    return int(bytes_ / 1024 + 0.5)


# ----------------------------------------------------------------- lectura md


def _celdas(linea: str) -> list[str]:
    return [c.strip() for c in linea.strip().strip("|").split("|")]


def _entero(celda: str) -> int | None:
    """El número de una celda, con los miles separados por punto o espacio."""
    limpio = celda.replace("*", "")
    for espacio in ESPACIOS:
        limpio = limpio.replace(espacio, "")
    limpio = limpio.replace(" ", "").replace(".", "")
    return int(limpio) if re.fullmatch(r"\d+", limpio) else None


def _kilos(celda: str) -> int | None:
    """Los kilobytes que declara una celda del tipo «293 KB»."""
    m = re.search(r"(\d+)\s*KB", celda)
    return int(m.group(1)) if m else None


def tabla(lineas: list[str], ancla: str) -> tuple[list[str], list[list[str]]] | None:
    """La tabla Markdown que va después de la línea que contiene `ancla`.

    Devuelve la cabecera y las filas, con la línea de separadores quitada.
    """
    for i, linea in enumerate(lineas):
        if ancla not in linea:
            continue
        cabecera: list[str] | None = None
        filas: list[list[str]] = []
        for siguiente in lineas[i + 1 :]:
            s = siguiente.strip()
            if not s:
                if cabecera is not None:
                    break
                continue
            if not s.startswith("|"):
                break
            celdas = _celdas(s)
            if all(re.fullmatch(r":?-+:?", c) for c in celdas):
                continue
            if cabecera is None:
                cabecera = celdas
            else:
                filas.append(celdas)
        if cabecera is None:
            return None
        return cabecera, filas
    return None


def _columna(cabecera: list[str], nombre: str) -> int | None:
    """La posición de una columna, por su nombre."""
    for i, c in enumerate(cabecera):
        if c.strip().lower() == nombre.lower():
            return i
    return None


def _columna_por_prefijo(cabecera: list[str], prefijo: str) -> int | None:
    """La posición de una columna, cuyo nombre empieza por `prefijo`.

    Las tablas que se comparan con `data/` titulan la columna de la edición
    con su nombre y su SRD —«ed51 (SRD 5.1)»—, así que el nombre exacto no
    sirve: lo que identifica la columna es su comienzo.
    """
    for i, c in enumerate(cabecera):
        if c.strip().lower().startswith(prefijo.lower()):
            return i
    return None


def _celda(fila: list[str], indice: int | None) -> str | None:
    """La celda de una fila en una columna, o `None` si la columna no está."""
    if indice is None or indice >= len(fila):
        return None
    return fila[indice]


def _etiqueta(celda: str) -> str:
    """El texto de una celda de etiqueta, sin el adorno de Markdown."""
    return celda.strip().strip("`*").rstrip("/").strip()


# ------------------------------------------------------------------ informes


def revisar_reglas(raiz: Path) -> list[str]:
    """Las cifras de `docs/informes/reglas.md` frente a `data/*/reglas/`."""
    problemas: list[str] = []
    ruta = raiz / "docs" / "informes" / "reglas.md"
    if not ruta.exists():
        return [f"no existe {ruta}"]
    lineas = ruta.read_text(encoding="utf-8").splitlines()

    cifras = tabla(lineas, "## Cifras")
    if cifras is None:
        return ["reglas.md: no encuentro la tabla de cifras"]
    cabecera, filas = cifras
    columnas = {n: _columna(cabecera, n) for n in ("Entradas", "Palabras", "Con tabla")}
    if any(v is None for v in columnas.values()):
        return [f"reglas.md: la tabla de cifras no tiene las columnas {sorted(columnas)}"]
    columna_paginas = _columna(cabecera, "Páginas de origen")

    reales: dict[str, dict[str, int]] = {}
    for ed in EDICIONES:
        carpeta = raiz / "data" / ed / "reglas"
        reales[ed] = {
            "Entradas": len(_ficheros(carpeta)),
            "Palabras": _palabras(carpeta),
            "Con tabla": _con_tabla(carpeta),
        }

    def fila_de(etiqueta: str) -> list[str] | None:
        for f in filas:
            if f and f[0].strip() == etiqueta:
                return f
        return None

    for ed in EDICIONES:
        etiqueta = ETIQUETAS[ed]
        fila = fila_de(etiqueta)
        if fila is None:
            problemas.append(f"reglas.md: falta la fila «{etiqueta}» en la tabla de cifras")
            continue
        for nombre, indice in columnas.items():
            celda = _celda(fila, indice)
            if celda is None:
                problemas.append(f"reglas.md, {etiqueta}: la fila no tiene la columna «{nombre}»")
                continue
            declarado = _entero(celda)
            if declarado is None:
                problemas.append(f"reglas.md, {etiqueta}: «{celda}» no es un número")
            elif declarado != reales[ed][nombre]:
                problemas.append(
                    f"reglas.md, {etiqueta}: declara {declarado} de {nombre.lower()} "
                    f"y hay {reales[ed][nombre]}"
                )
        celda_paginas = _celda(fila, columna_paginas)
        if celda_paginas is not None:
            declarados = _tramos(celda_paginas)
            if declarados is None:
                problemas.append(f"reglas.md, {etiqueta}: «{celda_paginas}» no son páginas")
            else:
                # La columna no lista la página de cada ficha, sino los tramos
                # del PDF de los que salen: lo que se comprueba es que ninguna
                # ficha venga de una página que el informe no menciona. Así
                # las tres entradas de Ambientación —páginas 380, 391 y 394—
                # quedarían fuera en un informe que solo citaba «79-110,
                # 209-220, 389-390».
                fuera = [
                    pagina
                    for pagina in _paginas_de_fichero(raiz / "data" / ed / "reglas")
                    if not any(desde <= pagina <= hasta for desde, hasta in declarados)
                ]
                if fuera:
                    problemas.append(
                        f"reglas.md, {etiqueta}: las páginas {sorted(set(fuera))} no están "
                        f"en las declaradas ({celda_paginas})"
                    )

    total = fila_de("**Total**")
    if total is None:
        problemas.append("reglas.md: falta la fila «**Total**» en la tabla de cifras")
    else:
        for nombre, indice in columnas.items():
            celda = _celda(total, indice)
            if celda is None:
                continue
            declarado = _entero(celda)
            esperado = sum(reales[ed][nombre] for ed in EDICIONES)
            if declarado is None:
                problemas.append(f"reglas.md, total: «{celda}» no es un número")
            elif declarado != esperado:
                problemas.append(
                    f"reglas.md, total: declara {declarado} de {nombre.lower()} y hay {esperado}"
                )

    for ed in EDICIONES:
        seccion = f"### {ETIQUETAS[ed]} por categoría"
        por_categoria = tabla(lineas, seccion)
        if por_categoria is None:
            problemas.append(f"reglas.md: no encuentro la tabla «{seccion}»")
            continue
        _, filas_categoria = por_categoria
        declarados = {f[0].strip(): _entero(f[1]) for f in filas_categoria if len(f) > 1}
        reales_categoria = _categorias(raiz / "data" / ed / "reglas")
        for categoria, n in sorted(reales_categoria.items()):
            if categoria not in declarados:
                problemas.append(
                    f"reglas.md, {ETIQUETAS[ed]}: falta la categoría «{categoria}» ({n} entradas)"
                )
            elif declarados[categoria] != n:
                problemas.append(
                    f"reglas.md, {ETIQUETAS[ed]}, «{categoria}»: declara "
                    f"{declarados[categoria]} entradas y hay {n}"
                )
        for categoria in sorted(declarados):
            if categoria not in reales_categoria:
                problemas.append(
                    f"reglas.md, {ETIQUETAS[ed]}: la categoría «{categoria}» no está en `data/`"
                )
    return problemas


def revisar_monstruos(raiz: Path) -> list[str]:
    """Las cifras de `docs/informes/monstruos.md` frente a `data/*/monstruos/`."""
    problemas: list[str] = []
    ruta = raiz / "docs" / "informes" / "monstruos.md"
    if not ruta.exists():
        return [f"no existe {ruta}"]
    lineas = ruta.read_text(encoding="utf-8").splitlines()

    resultado = tabla(lineas, "## Resultado")
    if resultado is None:
        return ["monstruos.md: no encuentro la tabla de resultado"]
    cabecera, filas = resultado
    columna_fichas = _columna(cabecera, "Fichas")
    columna_sin = _columna(cabecera, "Sin acciones")
    if columna_fichas is None or columna_sin is None:
        return ["monstruos.md: la tabla de resultado no tiene las columnas «Fichas» y «Sin acciones»"]

    for fila in filas:
        etiqueta = fila[0].strip()
        ed = "ed51" if etiqueta.startswith("5e") else "ed52"
        carpeta = raiz / "data" / ed / "monstruos"
        for indice, nombre, real in (
            (columna_fichas, "Fichas", len(_ficheros(carpeta))),
            (columna_sin, "Sin acciones", _sin_acciones(carpeta)),
        ):
            celda = _celda(fila, indice)
            if celda is None:
                problemas.append(f"monstruos.md, {etiqueta}: la fila no tiene la columna «{nombre}»")
                continue
            declarado = _entero(celda)
            if declarado is None:
                problemas.append(f"monstruos.md, {etiqueta}: «{celda}» no es un número")
            elif declarado != real:
                problemas.append(
                    f"monstruos.md, {etiqueta}: declara {declarado} de «{nombre}» y hay {real}"
                )
    return problemas


def revisar_mencion_de_monstruos(raiz: Path) -> list[str]:
    """Las cifras de monstruos que citan `clases.md` y `origenes-equipo.md`.

    Los dos informes mencionan de pasada cuántas criaturas hay, y seguían
    diciendo 302 y 315: los mismos números que quedaron atrás en
    `monstruos.md`, en otra parte del repo y con la misma consecuencia.
    """
    problemas: list[str] = []
    reales = {ed: len(_ficheros(raiz / "data" / ed / "monstruos")) for ed in EDICIONES}

    # clases.md: «(319/302 y 339/315 ficheros)» — conjuros y monstruos de cada
    # edición, en ese orden.
    ruta = raiz / "docs" / "informes" / "clases.md"
    if not ruta.exists():
        problemas.append(f"no existe {ruta}")
    else:
        texto = ruta.read_text(encoding="utf-8")
        m = re.search(r"\((\d+)/(\d+) y (\d+)/(\d+) ficheros\)", texto)
        if m is None:
            problemas.append("clases.md: no encuentro la mención de los ficheros por edición")
        else:
            declarados = {"ed51": int(m.group(2)), "ed52": int(m.group(4))}
            for ed, declarado in declarados.items():
                if declarado != reales[ed]:
                    problemas.append(
                        f"clases.md: declara {declarado} monstruos en {ed} y hay {reales[ed]}"
                    )

    # origenes-equipo.md: «`monstruos/` 302 y 315».
    ruta = raiz / "docs" / "informes" / "origenes-equipo.md"
    if not ruta.exists():
        problemas.append(f"no existe {ruta}")
    else:
        texto = ruta.read_text(encoding="utf-8").replace("`", "")
        m = re.search(r"monstruos/ (\d+) y (\d+)", texto)
        if m is None:
            problemas.append("origenes-equipo.md: no encuentro la mención de los monstruos")
        else:
            declarados = {"ed51": int(m.group(1)), "ed52": int(m.group(2))}
            for ed, declarado in declarados.items():
                if declarado != reales[ed]:
                    problemas.append(
                        f"origenes-equipo.md: declara {declarado} monstruos en {ed} "
                        f"y hay {reales[ed]}"
                    )
    return problemas


def revisar_carpetas_de_origenes(raiz: Path) -> list[str]:
    """La tabla de ficheros por carpeta y el desglose de equipo de `origenes-equipo.md`."""
    problemas: list[str] = []
    ruta = raiz / "docs" / "informes" / "origenes-equipo.md"
    if not ruta.exists():
        return problemas
    lineas = ruta.read_text(encoding="utf-8").splitlines()

    t = tabla(lineas, "## Ficheros por carpeta y edición")
    if t is not None:
        cabecera, filas = t
        col51 = _columna_por_prefijo(cabecera, "ed51")
        col52 = _columna_por_prefijo(cabecera, "ed52")
        if col51 is None or col52 is None:
            problemas.append("origenes-equipo.md: la tabla de carpetas no tiene las columnas de edición")
        else:
            for fila in filas:
                carpeta = _etiqueta(fila[0])
                if carpeta.startswith("Total"):
                    continue
                for ed, indice in (("ed51", col51), ("ed52", col52)):
                    celda = _celda(fila, indice)
                    if celda is None:
                        continue
                    declarado = _entero(celda)
                    real = len(_ficheros(raiz / "data" / ed / carpeta))
                    if declarado is None:
                        problemas.append(f"origenes-equipo.md, {carpeta}: «{celda}» no es un número")
                    elif declarado != real:
                        problemas.append(
                            f"origenes-equipo.md, {carpeta} en {ed}: declara {declarado} y hay {real}"
                        )

    desglose = tabla(lineas, "### Desglose de `equipo/`")
    if desglose is not None:
        cabecera, filas = desglose
        col51 = _columna_por_prefijo(cabecera, "ed51")
        col52 = _columna_por_prefijo(cabecera, "ed52")
        if col51 is not None and col52 is not None:
            sumas = {"ed51": 0, "ed52": 0}
            for fila in filas:
                etiqueta = fila[0].split("(")[0].strip().strip("`*")
                for ed, indice in (("ed51", col51), ("ed52", col52)):
                    celda = _celda(fila, indice)
                    if celda is None:
                        continue
                    declarado = _entero(celda)
                    if declarado is None:
                        continue
                    sumas[ed] += declarado
                    reales = _categorias(raiz / "data" / ed / "equipo")
                    if etiqueta in reales and reales[etiqueta] != declarado:
                        problemas.append(
                            f"origenes-equipo.md, equipo «{etiqueta}» en {ed}: declara "
                            f"{declarado} y hay {reales[etiqueta]}"
                        )
            for ed in EDICIONES:
                real = len(_ficheros(raiz / "data" / ed / "equipo"))
                if sumas[ed] != real:
                    problemas.append(
                        f"origenes-equipo.md: el desglose de equipo en {ed} suma {sumas[ed]} "
                        f"y hay {real} fichas"
                    )
    return problemas


def revisar_objetos(raiz: Path) -> list[str]:
    """Los ficheros de cada edición de `docs/informes/objetos.md`."""
    problemas: list[str] = []
    ruta = raiz / "docs" / "informes" / "objetos.md"
    if not ruta.exists():
        return [f"no existe {ruta}"]
    lineas = ruta.read_text(encoding="utf-8").splitlines()

    recuento = tabla(lineas, "## Recuento")
    if recuento is None:
        return problemas
    cabecera, filas = recuento
    columna = _columna_por_prefijo(cabecera, "Ficheros")
    if columna is None:
        return problemas
    for fila in filas:
        etiqueta = fila[0].strip()
        celda = _celda(fila, columna)
        if celda is None:
            continue
        declarado = _entero(celda)
        if declarado is None:
            problemas.append(f"objetos.md, {etiqueta}: «{celda}» no es un número")
            continue
        if etiqueta.startswith("**Total**"):
            esperado = sum(
                len(_ficheros(raiz / "data" / ed / "objetos")) for ed in EDICIONES
            )
        else:
            ed = "ed51" if etiqueta.startswith("5.1") else "ed52"
            esperado = len(_ficheros(raiz / "data" / ed / "objetos"))
        if declarado != esperado:
            problemas.append(f"objetos.md, {etiqueta}: declara {declarado} ficheros y hay {esperado}")
    return problemas


def revisar_datos(raiz: Path) -> list[str]:
    """Las cifras de `docs/DATOS.md` frente a `data/` y `dist/datos/`."""
    problemas: list[str] = []
    ruta = raiz / "docs" / "DATOS.md"
    if not ruta.exists():
        return [f"no existe {ruta}"]
    texto = ruta.read_text(encoding="utf-8")
    lineas = texto.splitlines()

    total_real = len(list(raiz.glob("data/*/*/*.md")))
    for patron, que in (
        (r"Un JSON único de\s+([\d .]+?)\s+entradas", "el JSON único"),
        (r"no puede leer\s+([\d .]+?)\s+ficheros", "los ficheros"),
    ):
        m = re.search(patron, texto)
        if not m:
            problemas.append(f"DATOS.md: no encuentro el recuento de {que}")
            continue
        declarado = _entero(m.group(1))
        if declarado is None:
            problemas.append(f"DATOS.md: «{m.group(1)}» no es un número")
        elif declarado != total_real:
            problemas.append(
                f"DATOS.md: declara {declarado} entradas en {que} y hay {total_real}"
            )

    tamanos = tabla(lineas, "Tamaño real del índice")
    if tamanos is None:
        problemas.append("DATOS.md: no encuentro la tabla del tamaño del índice")
    else:
        cabecera, filas = tamanos
        col_crudo = _columna(cabecera, "Sin comprimir")
        col_gzip = _columna(cabecera, "Con gzip")
        if col_crudo is None or col_gzip is None:
            problemas.append("DATOS.md: la tabla del tamaño no tiene las columnas esperadas")
        for fila in filas:
            ed = fila[0].strip()
            indice_json = raiz / "dist" / "datos" / f"{ed}.json"
            if not indice_json.exists():
                problemas.append(f"DATOS.md: no existe `{indice_json}` (falta compilar el sitio)")
                continue
            datos = indice_json.read_bytes()
            comprimido = gzip.compress(datos, 6, mtime=0)
            for indice, nombre, bytes_, margen in (
                (col_crudo, "sin comprimir", len(datos), 0),
                (col_gzip, "con gzip", len(comprimido), MARGEN_GZIP),
            ):
                celda = _celda(fila, indice)
                if celda is None:
                    problemas.append(f"DATOS.md, {ed}: la fila no tiene la columna «{nombre}»")
                    continue
                declarado = _kilos(celda)
                real = _kib(bytes_)
                if declarado is None:
                    problemas.append(f"DATOS.md, {ed}: «{celda}» no dice cuántos KB son")
                elif abs(declarado - real) > margen:
                    problemas.append(
                        f"DATOS.md, {ed}: declara {declarado} KB {nombre} y son {real} KB"
                    )

    equipo = categorias_de_ejemplo(lineas)
    if not equipo:
        problemas.append("DATOS.md: no encuentro la lista de categorías de equipo")
    else:
        reales = set()
        for ed in EDICIONES:
            reales |= set(_categorias(raiz / "data" / ed / "equipo"))
        if equipo != reales:
            problemas.append(
                "DATOS.md: las categorías de equipo del ejemplo son "
                f"{sorted(equipo)} y en `data/` hay {sorted(reales)}"
            )

    dotes = categorias_de_dotes(lineas)
    if not dotes:
        problemas.append("DATOS.md: no encuentro la lista de categorías de las dotes")
    else:
        reales = set()
        for ed in EDICIONES:
            reales |= set(_categorias(raiz / "data" / ed / "dotes"))
        if dotes != reales:
            problemas.append(
                f"DATOS.md: las categorías de las dotes son {sorted(dotes)} "
                f"y en `data/` hay {sorted(reales)}"
            )
    return problemas


def categorias_de_ejemplo(lineas: list[str]) -> set[str]:
    """Las categorías que enumera el comentario del ejemplo de equipo."""
    for linea in lineas:
        if "category: Armadura" in linea and "#" in linea:
            return {c.strip() for c in linea.split("#", 1)[1].split(",") if c.strip()}
    return set()


def categorias_de_dotes(lineas: list[str]) -> set[str]:
    """Las categorías que enumera la línea de las dotes."""
    for linea in lineas:
        m = re.search(r"Dotes: `category` \(([^)]*)\)", linea)
        if m:
            return {c.strip() for c in m.group(1).split(",") if c.strip()}
    return set()


def revisar_documentos_de_plan(raiz: Path) -> list[str]:
    """Las cifras de «lo que tenemos hoy» en los documentos de plan.

    `PLAN-5ETOOLS.md`, `ANALISIS-5ETOOLS.md` y `PLAN-IMAGENES.md` comparan el
    proyecto con 5etools y citan cuántas entradas y cuántas páginas tiene el
    sitio. Son documentos de trabajo con fecha, pero su cifra se leía como la
    del proyecto y se quedó atrás igual que los informes.
    """
    problemas: list[str] = []
    entradas = len(list(raiz.glob("data/*/*/*.md")))

    # «3.510 páginas, 2.457 entradas» — el número de páginas del sitio sale de
    # `dist/`, que solo existe si el sitio está compilado.
    ruta = raiz / "docs" / "PLAN-5ETOOLS.md"
    if ruta.exists():
        texto = ruta.read_text(encoding="utf-8")
        m = re.search(r"([\d.]+) páginas, ([\d.]+) entradas", texto)
        if m is None:
            problemas.append("PLAN-5ETOOLS.md: no encuentro la línea de «lo que tenemos hoy»")
        else:
            declaradas = _entero(m.group(2))
            if declaradas is None:
                problemas.append(f"PLAN-5ETOOLS.md: «{m.group(2)}» no es un número")
            elif declaradas != entradas:
                problemas.append(
                    f"PLAN-5ETOOLS.md: declara {declaradas} entradas y hay {entradas}"
                )
            dist = raiz / "dist"
            if dist.exists():
                paginas = sum(1 for _ in dist.rglob("*.html"))
                declaradas_pag = _entero(m.group(1))
                if declaradas_pag is None:
                    problemas.append(f"PLAN-5ETOOLS.md: «{m.group(1)}» no es un número")
                elif declaradas_pag != paginas:
                    problemas.append(
                        f"PLAN-5ETOOLS.md: declara {declaradas_pag} páginas y hay {paginas}"
                    )

    # «Sí, 2.457 entradas» — la comparativa de estado.
    ruta = raiz / "docs" / "ANALISIS-5ETOOLS.md"
    if ruta.exists():
        texto = ruta.read_text(encoding="utf-8")
        m = re.search(r"S[ií], ([\d.]+) entradas", texto)
        if m is None:
            problemas.append("ANALISIS-5ETOOLS.md: no encuentro el recuento de la comparativa")
        else:
            declaradas = _entero(m.group(1))
            if declaradas is None:
                problemas.append(f"ANALISIS-5ETOOLS.md: «{m.group(1)}» no es un número")
            elif declaradas != entradas:
                problemas.append(
                    f"ANALISIS-5ETOOLS.md: declara {declaradas} entradas y hay {entradas}"
                )

    # «cubre las 2.457 entradas» — la comparación de las opciones de imagen.
    ruta = raiz / "docs" / "PLAN-IMAGENES.md"
    if ruta.exists():
        texto = ruta.read_text(encoding="utf-8")
        m = re.search(r"cubre las ([\d.]+) entradas", texto)
        if m is None:
            problemas.append("PLAN-IMAGENES.md: no encuentro el recuento de las entradas")
        else:
            declaradas = _entero(m.group(1))
            if declaradas is None:
                problemas.append(f"PLAN-IMAGENES.md: «{m.group(1)}» no es un número")
            elif declaradas != entradas:
                problemas.append(
                    f"PLAN-IMAGENES.md: declara {declaradas} entradas y hay {entradas}"
                )
    return problemas


# La frase con la que cierra su recuento el paso 33 de `docs/VERIFICACION.md` y
# la línea con la que `tools/test/commander.mjs` publica el suyo. Se leen de su
# sitio y se comparan: es la cifra que se quedó en 176 con la suite en 190.
RE_CIFRA_DEL_PASO_33 = re.compile(r"Son ([\d.]+) comprobaciones sin navegador")
RE_TOTAL_DE_COMMANDER = re.compile(r"([\d.]+) comprobaciones correctas")


def _total_de_la_suite(salida: str) -> int | None:
    """El total que anuncia `commander.mjs`, también cuando acaba en rojo.

    En verde la última línea dice «✓ …: 190 comprobaciones correctas.»; en
    rojo, «189/190 comprobaciones correctas». En los dos casos el número que
    interesa es el total —el que declara la documentación—, y el patrón salta
    el recuento de las acertadas porque detrás de él viene una barra.
    """
    m = RE_TOTAL_DE_COMMANDER.search(salida)
    return _entero(m.group(1)) if m else None


def comprobaciones_de_commander(raiz: Path) -> int | None:
    """Corre `tools/test/commander.mjs` y devuelve el total que publica.

    Cuesta medio segundo y no llama a Scryfall, así que se ejecuta en vez de
    fiarse de una cifra apuntada en otro fichero, que es justo lo que se
    desincronizó. Devuelve `None` si no se puede medir.
    """
    guion = raiz / "tools" / "test" / "commander.mjs"
    node = shutil.which("node")
    if node is None or not guion.exists():
        return None
    try:
        salida = subprocess.run(
            [node, str(guion)],
            cwd=raiz,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return _total_de_la_suite(salida.stdout + salida.stderr)


def revisar_verificacion(raiz: Path) -> list[str]:
    """La cifra de comprobaciones que el paso 33 de VERIFICACION.md declara.

    El paso describe lo que cubre `tools/test/commander.mjs` y cerraba con «Son
    176 comprobaciones sin navegador y sin llamar a Scryfall» mientras la suite
    publicaba 190: quien leyera la documentación de las puertas se creía 14
    comprobaciones menos de las que hay.
    """
    ruta = raiz / "docs" / "VERIFICACION.md"
    if not ruta.exists():
        return [f"no existe {ruta.relative_to(raiz)}"]

    problemas: list[str] = []
    m = RE_CIFRA_DEL_PASO_33.search(ruta.read_text(encoding="utf-8"))
    declaradas = _entero(m.group(1)) if m else None
    if m is None:
        problemas.append("VERIFICACION.md: no encuentro la cifra de comprobaciones del paso 33")
    elif declaradas is None:
        problemas.append(f"VERIFICACION.md: «{m.group(1)}» no es un número")

    medidas = comprobaciones_de_commander(raiz)
    if medidas is None:
        problemas.append(
            "VERIFICACION.md: no se ha podido medir la suite de Commander para "
            "contrastar la cifra del paso 33 (¿falta node o el guion?)"
        )
    elif declaradas is not None and declaradas != medidas:
        problemas.append(
            f"VERIFICACION.md: el paso 33 declara {declaradas} comprobaciones y la "
            f"suite de Commander publica {medidas}"
        )
    return problemas


def revisar(raiz: Path) -> list[str]:
    """Todos los descuadres de los informes, en orden."""
    problemas: list[str] = []
    problemas += revisar_reglas(raiz)
    problemas += revisar_monstruos(raiz)
    problemas += revisar_mencion_de_monstruos(raiz)
    problemas += revisar_carpetas_de_origenes(raiz)
    problemas += revisar_objetos(raiz)
    problemas += revisar_datos(raiz)
    problemas += revisar_documentos_de_plan(raiz)
    problemas += revisar_verificacion(raiz)
    return problemas


# ------------------------------------------------------- casos de prueba


def _ficha(nombre: str, categoria: str, cuerpo: str, pagina: int = 1) -> str:
    return (
        f"---\nname: {nombre}\ncategory: {categoria}\nsrd: '5.2'\npage: {pagina}\n"
        f"---\n\n{cuerpo}\n"
    )


def _mini_arbol(raiz: Path) -> dict[str, int]:
    """Monta un árbol mínimo con sus informes ya correctos.

    Devuelve los valores escritos, que son los que luego se perturban para
    comprobar que la puerta se pone en rojo.
    """
    reglas = {
        "ed51": [
            ("condiciones", "Condiciones", "texto", 1),
            ("combate", "Combate", "texto", 2),
        ],
        "ed52": [
            ("combate", "Combate", "texto", 3),
            ("glosario", "Glosario", "texto", 4),
        ],
    }
    for ed, fichas in reglas.items():
        carpeta = raiz / "data" / ed / "reglas"
        carpeta.mkdir(parents=True)
        for nombre, categoria, cuerpo, pagina in fichas:
            (carpeta / f"{nombre}.md").write_text(
                _ficha(nombre, categoria, cuerpo, pagina), encoding="utf-8"
            )

    monstruos = {
        "ed51": [("aguila", "Aguila", "## Acciones\n\nAtaca."), ("rana", "Rana", "Se queda quieta.")],
        "ed52": [("hongo", "Hongo chillón", "Se queda quieto.")],
    }
    for ed, fichas in monstruos.items():
        carpeta = raiz / "data" / ed / "monstruos"
        carpeta.mkdir(parents=True)
        for nombre, categoria, cuerpo in fichas:
            (carpeta / f"{nombre}.md").write_text(_ficha(nombre, categoria, cuerpo), encoding="utf-8")

    for ed, fichas in (("ed51", [("saco", "Arma"), ("carro", "Vehículo")]), ("ed52", [])):
        carpeta = raiz / "data" / ed / "equipo"
        carpeta.mkdir(parents=True)
        for nombre, categoria in fichas:
            (carpeta / f"{nombre}.md").write_text(_ficha(nombre, categoria, "cuerpo"), encoding="utf-8")

    dotes = raiz / "data" / "ed52" / "dotes"
    dotes.mkdir(parents=True)
    (dotes / "dote.md").write_text(_ficha("Dote", "Épica", "cuerpo"), encoding="utf-8")

    objetos = raiz / "data" / "ed51" / "objetos"
    objetos.mkdir(parents=True)
    (objetos / "capa.md").write_text(_ficha("Capa", "", "cuerpo"), encoding="utf-8")

    especies = raiz / "data" / "ed51" / "especies"
    especies.mkdir(parents=True)
    (especies / "enano.md").write_text(_ficha("Enano", "", "cuerpo"), encoding="utf-8")

    indice = raiz / "dist" / "datos"
    indice.mkdir(parents=True)
    (indice / "5e.json").write_bytes(b'{"ed":"5e","entradas":[]}')
    (indice / "5.5.json").write_bytes(b'{"ed":"5.5","entradas":[]}')
    # Una página del sitio, para que el recuento de páginas del plan tenga
    # algo que medir en el árbol de ejemplo.
    (raiz / "dist" / "index.html").write_text("<html></html>\n", encoding="utf-8")

    valores: dict[str, int] = {}
    for ed in EDICIONES:
        carpeta = raiz / "data" / ed / "reglas"
        valores[f"entradas-{ed}"] = len(_ficheros(carpeta))
        valores[f"palabras-{ed}"] = _palabras(carpeta)
        valores[f"tablas-{ed}"] = _con_tabla(carpeta)
    valores["total-entradas"] = len(list(raiz.glob("data/*/*/*.md")))
    valores["paginas"] = sum(1 for _ in (raiz / "dist").rglob("*.html"))
    for ed in EDICIONES:
        carpeta = raiz / "data" / ed / "monstruos"
        valores[f"fichas-{ed}"] = len(_ficheros(carpeta))
        valores[f"sin-acciones-{ed}"] = _sin_acciones(carpeta)
    for ed in ("5e", "5.5"):
        datos = (indice / f"{ed}.json").read_bytes()
        valores[f"crudo-{ed}"] = _kib(len(datos))
        valores[f"gzip-{ed}"] = _kib(len(gzip.compress(datos, 6, mtime=0)))

    informes = raiz / "docs" / "informes"
    informes.mkdir(parents=True)
    (informes / "reglas.md").write_text(
        f"""# Extracción de reglas y estados

## Cifras

| Edición | Entradas | Palabras | Con tabla | Páginas de origen |
|---|---|---|---|---|
| SRD 5.1 | {valores['entradas-ed51']} | {valores['palabras-ed51']} | {valores['tablas-ed51']} | 1-2 |
| SRD 5.2.1 | {valores['entradas-ed52']} | {valores['palabras-ed52']} | {valores['tablas-ed52']} | 3-4 |
| **Total** | **{valores['entradas-ed51'] + valores['entradas-ed52']}** | **{valores['palabras-ed51'] + valores['palabras-ed52']}** | **{valores['tablas-ed51'] + valores['tablas-ed52']}** | |

### SRD 5.1 por categoría

| Categoría | Entradas |
|---|---|
| Combate | 1 |
| Condiciones | 1 |

### SRD 5.2.1 por categoría

| Categoría | Entradas |
|---|---|
| Combate | 1 |
| Glosario | 1 |
""",
        encoding="utf-8",
    )
    (informes / "monstruos.md").write_text(
        f"""# Repaso de los perfiles de monstruo

## Resultado

| Edición | Fichas | Sin campos | Características mal | Sin acciones | No literales |
|---|---:|---:|---:|---:|---:|
| 5e (SRD 5.1) | {valores['fichas-ed51']} | 0 | 0 | {valores['sin-acciones-ed51']} | 0 |
| 5.5 (SRD 5.2.1) | {valores['fichas-ed52']} | 0 | 0 | {valores['sin-acciones-ed52']} | 0 |
""",
        encoding="utf-8",
    )
    (informes / "clases.md").write_text(
        f"""# Extracción de clases

`data/*/conjuros` y `data/*/monstruos` no se han modificado
(319/{valores['fichas-ed51']} y 339/{valores['fichas-ed52']} ficheros).
""",
        encoding="utf-8",
    )
    (informes / "origenes-equipo.md").write_text(
        f"""# Extracción de orígenes y equipo

## Ficheros por carpeta y edición

| Carpeta | ed51 (SRD 5.1) | ed52 (SRD 5.2.1) |
| --- | ---: | ---: |
| `especies/` | 1 | 0 |
| `trasfondos/` | 0 | 0 |
| `dotes/` | 0 | 1 |
| `equipo/` | 2 | 0 |

### Desglose de `equipo/`

| Categoría | ed51 | ed52 |
| --- | ---: | ---: |
| Arma | 1 | 0 |
| Vehículo | 1 | 0 |

Sin cambios (no se han tocado): `conjuros/` 319 y 339,
`monstruos/` {valores['fichas-ed51']} y {valores['fichas-ed52']}.
""",
        encoding="utf-8",
    )
    (informes / "objetos.md").write_text(
        """# Informe: extracción de objetos mágicos

## Recuento

| Edición | Ficheros `.md` | Entradas detectadas |
|---------|----------------|---------------------|
| 5.1     | 1              | 1                   |
| 5.2     | 0              | 0                   |
""",
        encoding="utf-8",
    )
    (raiz / "docs" / "DATOS.md").write_text(
        f"""# DATOS

- Un JSON único de {valores['total-entradas']} entradas no se revisa.
- El cliente necesita otra cosa: no puede leer {valores['total-entradas']} ficheros.
- Tamaño real del índice, que se genera en cada build:

  | Edición | Sin comprimir | Con gzip |
  |---|---|---|
  | 5e | {valores['crudo-5e']} KB | {valores['gzip-5e']} KB |
  | 5.5 | {valores['crudo-5.5']} KB | {valores['gzip-5.5']} KB |

### equipo

```yaml
category: Armadura      # Arma, Vehículo
```

Dotes: `category` (Épica).
""",
        encoding="utf-8",
    )
    (raiz / "docs" / "PLAN-5ETOOLS.md").write_text(
        f"""# Plan

### 4.3 Lo que nosotros tenemos hoy

{valores['paginas']} páginas, {valores['total-entradas']} entradas, 0 imágenes.
""",
        encoding="utf-8",
    )
    (raiz / "docs" / "ANALISIS-5ETOOLS.md").write_text(
        f"""# Análisis

| Capacidad | 5etools | La Taberna de Eme |
|---|---|---|
| Contenido del SRD completo en español | — | Sí, {valores['total-entradas']} entradas |
""",
        encoding="utf-8",
    )
    (raiz / "docs" / "PLAN-IMAGENES.md").write_text(
        f"""# Imágenes

- **A favor:** cubre las {valores['total-entradas']} entradas sin una sola licencia discutible.
""",
        encoding="utf-8",
    )

    # El paso 33 de la documentación de las puertas declara cuántas
    # comprobaciones publica la suite de Commander. El árbol de ejemplo trae una
    # suite de mentira que imprime su total, que es lo que la puerta tiene que
    # leer y contrastar con el documento.
    valores["comprobaciones"] = 7
    (raiz / "docs" / "VERIFICACION.md").write_text(
        f"""# Comprobaciones

33. `tools/test/commander.mjs`: que la herramienta de MTG Commander no se rompa.

Son {valores['comprobaciones']} comprobaciones sin navegador y sin llamar a Scryfall.
""",
        encoding="utf-8",
    )
    pruebas = raiz / "tools" / "test"
    pruebas.mkdir(parents=True)
    (pruebas / "commander.mjs").write_text(
        f"console.log('✓ Parser, roles y resolver: {valores['comprobaciones']} "
        "comprobaciones correctas.');\n",
        encoding="utf-8",
    )
    return valores


def _perturbaciones(valores: dict[str, int]) -> list[tuple[str, str, str, str]]:
    """(descripción, fichero, texto viejo, texto nuevo) de cada cifra vigilada."""
    reglas = "docs/informes/reglas.md"
    monstruos = "docs/informes/monstruos.md"
    clases = "docs/informes/clases.md"
    origenes = "docs/informes/origenes-equipo.md"
    objetos = "docs/informes/objetos.md"
    datos = "docs/DATOS.md"
    return [
        (
            "las entradas del 5.1",
            reglas,
            f"| SRD 5.1 | {valores['entradas-ed51']} |",
            f"| SRD 5.1 | {valores['entradas-ed51'] + 1} |",
        ),
        (
            "las palabras del 5.1",
            reglas,
            f"| SRD 5.1 | {valores['entradas-ed51']} | {valores['palabras-ed51']} |",
            f"| SRD 5.1 | {valores['entradas-ed51']} | {valores['palabras-ed51'] + 1} |",
        ),
        (
            "las tablas del 5.2.1",
            reglas,
            f"| SRD 5.2.1 | {valores['entradas-ed52']} | {valores['palabras-ed52']} | {valores['tablas-ed52']} |",
            f"| SRD 5.2.1 | {valores['entradas-ed52']} | {valores['palabras-ed52']} | {valores['tablas-ed52'] + 1} |",
        ),
        (
            "el total de entradas",
            reglas,
            f"| **Total** | **{valores['entradas-ed51'] + valores['entradas-ed52']}** |",
            f"| **Total** | **{valores['entradas-ed51'] + valores['entradas-ed52'] + 1}** |",
        ),
        (
            "el recuento de una categoría",
            reglas,
            "| Combate | 1 |",
            "| Combate | 2 |",
        ),
        (
            "las páginas de origen",
            reglas,
            f"| SRD 5.1 | {valores['entradas-ed51']} | {valores['palabras-ed51']} "
            f"| {valores['tablas-ed51']} | 1-2 |",
            f"| SRD 5.1 | {valores['entradas-ed51']} | {valores['palabras-ed51']} "
            f"| {valores['tablas-ed51']} | 1 |",
        ),
        (
            "las fichas de monstruos",
            monstruos,
            f"| 5e (SRD 5.1) | {valores['fichas-ed51']} |",
            f"| 5e (SRD 5.1) | {valores['fichas-ed51'] + 1} |",
        ),
        (
            "las fichas sin acciones",
            monstruos,
            f"| 5e (SRD 5.1) | {valores['fichas-ed51']} | 0 | 0 | {valores['sin-acciones-ed51']} |",
            f"| 5e (SRD 5.1) | {valores['fichas-ed51']} | 0 | 0 | {valores['sin-acciones-ed51'] + 1} |",
        ),
        (
            "la mención de monstruos de clases.md",
            clases,
            f"319/{valores['fichas-ed51']} y 339/{valores['fichas-ed52']}",
            f"319/{valores['fichas-ed51'] + 1} y 339/{valores['fichas-ed52']}",
        ),
        (
            "la mención de monstruos de origenes-equipo.md",
            origenes,
            f"`monstruos/` {valores['fichas-ed51']} y {valores['fichas-ed52']}",
            f"`monstruos/` {valores['fichas-ed51'] + 1} y {valores['fichas-ed52']}",
        ),
        (
            "los ficheros por carpeta de origenes-equipo.md",
            origenes,
            "| `equipo/` | 2 | 0 |",
            "| `equipo/` | 3 | 0 |",
        ),
        (
            "el desglose de equipo de origenes-equipo.md",
            origenes,
            "| Arma | 1 | 0 |",
            "| Arma | 2 | 0 |",
        ),
        (
            "los ficheros de objetos.md",
            objetos,
            "| 5.1     | 1              | 1                   |",
            "| 5.1     | 2              | 1                   |",
        ),
        (
            "el total de entradas de DATOS.md",
            datos,
            f"de {valores['total-entradas']} entradas",
            f"de {valores['total-entradas'] + 1} entradas",
        ),
        (
            "el tamaño sin comprimir",
            datos,
            f"| 5e | {valores['crudo-5e']} KB |",
            f"| 5e | {valores['crudo-5e'] + 1} KB |",
        ),
        (
            "el tamaño con gzip",
            datos,
            f"| 5e | {valores['crudo-5e']} KB | {valores['gzip-5e']} KB |",
            f"| 5e | {valores['crudo-5e']} KB | {valores['gzip-5e'] + 4} KB |",
        ),
        (
            "las categorías de equipo",
            datos,
            "# Arma, Vehículo",
            "# Arma",
        ),
        (
            "las categorías de las dotes",
            datos,
            "Dotes: `category` (Épica).",
            "Dotes: `category` (Épica, Legendaria).",
        ),
        (
            "las entradas de PLAN-5ETOOLS.md",
            "docs/PLAN-5ETOOLS.md",
            f"{valores['total-entradas']} entradas",
            f"{valores['total-entradas'] + 1} entradas",
        ),
        (
            "las páginas de PLAN-5ETOOLS.md",
            "docs/PLAN-5ETOOLS.md",
            f"{valores['paginas']} páginas",
            f"{valores['paginas'] + 1} páginas",
        ),
        (
            "las entradas de ANALISIS-5ETOOLS.md",
            "docs/ANALISIS-5ETOOLS.md",
            f"Sí, {valores['total-entradas']} entradas",
            f"Sí, {valores['total-entradas'] + 1} entradas",
        ),
        (
            "las entradas de PLAN-IMAGENES.md",
            "docs/PLAN-IMAGENES.md",
            f"cubre las {valores['total-entradas']} entradas",
            f"cubre las {valores['total-entradas'] + 1} entradas",
        ),
        (
            "la cifra de comprobaciones del paso 33",
            "docs/VERIFICACION.md",
            f"Son {valores['comprobaciones']} comprobaciones sin navegador",
            f"Son {valores['comprobaciones'] + 14} comprobaciones sin navegador",
        ),
        (
            "el total que publica la suite de Commander",
            "tools/test/commander.mjs",
            f"{valores['comprobaciones']} comprobaciones correctas",
            f"{valores['comprobaciones'] + 1} comprobaciones correctas",
        ),
        (
            "la frase que declara la cifra del paso 33",
            "docs/VERIFICACION.md",
            f"Son {valores['comprobaciones']} comprobaciones sin navegador",
            "Son comprobaciones sin navegador",
        ),
    ]


def casos_de_prueba() -> tuple[int, list[str]]:
    """Comprueba que la puerta ve los recuentos que no cuadran."""
    fallos: list[str] = []
    comprobados = 0
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp) / "base"
        base.mkdir()
        valores = _mini_arbol(base)

        if revisar(base):
            fallos.append("el árbol de ejemplo, con sus informes correctos, ya sale con problemas")
        comprobados += 1

        for descripcion, fichero, viejo, nuevo in _perturbaciones(valores):
            caso = Path(tmp) / "caso"
            shutil.rmtree(caso, ignore_errors=True)
            shutil.copytree(base, caso)
            ruta = caso / fichero
            texto = ruta.read_text(encoding="utf-8")
            if viejo not in texto:
                fallos.append(f"«{descripcion}»: no encuentro «{viejo}» en {fichero}")
                continue
            ruta.write_text(texto.replace(viejo, nuevo, 1), encoding="utf-8")
            if not revisar(caso):
                fallos.append(f"«{descripcion}»: la puerta no ve el recuento descuadrado")
            comprobados += 1
    return comprobados, fallos


# ------------------------------------------------------------------- programa


def main() -> int:
    comprobados, fallos = casos_de_prueba()
    if fallos:
        print("✗ La comprobación de las cifras de los informes no se comporta como debe:")
        for f in fallos:
            print(f"   - {f}")
        return 1
    print(f"Cifras de los informes: {comprobados} casos comprobados; una cifra alterada se ve.")

    problemas = revisar(RAIZ)
    if problemas:
        print("✗ Los informes declaran recuentos que no cuadran con los datos:")
        for p in problemas:
            print(f"   - {p}")
        return 1
    print(
        "Cifras de los informes: reglas, monstruos, clases, orígenes, objetos, DATOS.md y los "
        "documentos de plan cuadran con `data/` y `dist/datos/`, y la cifra del paso 33 de "
        "VERIFICACION.md con lo que publica la suite de Commander."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
