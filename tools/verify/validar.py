#!/usr/bin/env python3
"""Verifica la integridad de `data/` y escribe un informe.

Comprueba, por edición y tipo de contenido:
  - número de entradas frente a los recuentos de referencia del SRD,
  - campos obligatorios vacíos,
  - cuerpos vacíos o desproporcionados (síntoma de un corte mal hecho),
  - duplicados por nombre dentro de la misma categoría,
  - palabras partidas por un rótulo que se cuela dentro del valor,
  - la línea de tipo de las criaturas (tipo, tamaño y alineamiento) mal partida,
  - la tabla de recuentos del README frente a los ficheros reales.

Uso:
    .venv-ingest/bin/python tools/verify/validar.py
"""
from __future__ import annotations

import re
import sys
import unicodedata
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

# Campos del perfil que el PDF parte en varias líneas dentro del mismo bloque.
# Una continuación que empieza por mayúscula («Percepción pasiva 22») se perdía
# entera: primero se recortaba el valor y después el trozo suelto se tiraba como
# si fuera un rasgo. Un valor cortado se queda acabado en coma o en palabra
# suelta, así que se vigilan las dos cosas: el final de cada valor y unas fichas
# testigo con el texto exacto que faltaba.
CAMPOS_PERFIL = (
    "saves",
    "skills",
    "senses",
    "languages",
    "immunities",
    "resistances",
    "conditionImmunities",
    "vulnerabilities",
    "gear",
)
COLAS_DE_CORTE = (",", " de", " y", " o", " con", " para")

PERFIL_TESTIGO = {
    ("ed51", "dragon-azul-adulto"): {"senses": "Percepción pasiva 22", "skills": "Percepción +12"},
    ("ed51", "dragon-rojo-adulto"): {"saves": "Des +6, Con +13, Sab +7, Car +11"},
    ("ed51", "espia"): {"skills": "Juego de Manos +4"},
    ("ed51", "liche"): {"skills": "Percepción +9, Perspicacia +9"},
    ("ed51", "naga-guardiana"): {"saves": "Des +8, Con +7, Int +7, Sab +8, Car +8"},
    ("ed52", "archimago"): {"skills": "Percepción +6"},
}


def perfil_completo() -> list[str]:
    """Valores del perfil cortados a mitad y fichas testigo incompletas."""
    problemas: list[str] = []
    for f in sorted(DATOS.glob("*/monstruos/*.md")):
        contenido = leer(f)
        if contenido is None:
            continue
        datos, _ = contenido
        for campo in CAMPOS_PERFIL:
            valor = str(datos.get(campo) or "").strip()
            if valor.endswith(COLAS_DE_CORTE):
                problemas.append(f"{f.parent.parent.name}/{f.stem}: {campo} acaba cortado («{valor[-40:]}»)")
    for (ed, ficha), esperado in PERFIL_TESTIGO.items():
        f = DATOS / ed / "monstruos" / f"{ficha}.md"
        contenido = leer(f)
        if contenido is None:
            problemas.append(f"{ed}/{ficha}: no existe la ficha testigo")
            continue
        datos, _ = contenido
        for campo, texto in esperado.items():
            valor = str(datos.get(campo) or "")
            if texto not in valor:
                problemas.append(f"{ed}/{ficha}: {campo} debería contener «{texto}» y dice «{valor}»")
    return problemas


# Las tiradas de salvación del 5.2 viajan en la tercera columna de la tabla de
# características («F 23 +6 +6»: puntuación, modificador, salvación) y
# `_parse_abilities` solo lee la puntuación, así que las 330 fichas del 5.2 se
# publican sin la fila «Tiradas de salvación» mientras el 5.1 sí la trae (92 de
# 317). La tabla del PDF no se versiona (`.cache/`), así que las líneas crudas
# que se perdían van escritas aquí, ficha a ficha, y el mínimo por edición deja
# que el catálogo crezca sin poner la puerta en rojo.
SALVACIONES_TESTIGO = {
    ("ed52", "archimago"): "Int +9, Sab +6",
    ("ed52", "dragon-rojo-joven"): "Des +4, Sab +4",
    ("ed52", "dragon-rojo-anciano"): "Des +7, Sab +9",
    ("ed51", "dragon-rojo-adulto"): "Des +6, Con +13, Sab +7, Car +11",
}
SALVACIONES_MINIMO = {"ed51": 90, "ed52": 40}
SALVACION = re.compile(r"^(?:Fue|Des|Con|Int|Sab|Car) [+−-]\d+$")


def _salvaciones(valor: object) -> set[str]:
    """«Des +7, Sab +9» → {"Des +7", "Sab +9"}, sin depender del orden."""
    return {trozo.strip() for trozo in str(valor or "").split(",") if trozo.strip()}


def salvaciones_completas() -> list[str]:
    """Fichas que deberían declarar tiradas de salvación y no las declaran."""
    problemas: list[str] = []
    for (ed, ficha), esperado in SALVACIONES_TESTIGO.items():
        f = DATOS / ed / "monstruos" / f"{ficha}.md"
        if not f.exists():
            problemas.append(f"{ed}/{ficha}: no existe la ficha testigo")
            continue
        contenido = leer(f)
        if contenido is None:
            problemas.append(f"{ed}/{ficha}: la ficha testigo no tiene frontmatter válido")
            continue
        datos, _ = contenido
        valor = str(datos.get("saves") or "")
        tiene = _salvaciones(valor)
        falta = sorted(_salvaciones(esperado) - tiene)
        if falta:
            problemas.append(
                f"{ed}/{ficha}: saves debería declarar {', '.join(falta)} y dice «{valor}»"
            )
        for trozo in sorted(tiene):
            if not SALVACION.match(trozo):
                problemas.append(
                    f"{ed}/{ficha}: saves trae «{trozo}», que no es «Abreviatura +N»"
                )
    for ed, minimo in SALVACIONES_MINIMO.items():
        con = 0
        for f in sorted(DATOS.glob(f"{ed}/monstruos/*.md")):
            contenido = leer(f)
            if contenido is not None and str(contenido[0].get("saves") or "").strip():
                con += 1
        if con < minimo:
            problemas.append(
                f"{ed}: solo {con} fichas declaran tiradas de salvación y la tabla del SRD "
                f"da al menos {minimo}"
            )
    return problemas


# Las inmunidades, resistencias y vulnerabilidades del 5.2 llevan **una sola
# etiqueta** por campo, con los tipos de daño y los estados separados por «;»
# («Inmunidades: veneno; cansancio, envenenado»), y `STAT_LABELS` solo conoce
# las de 2014 («Inmunidad a daño:», «Inmunidad a estados:»…), así que las
# cuatro filas salen vacías en las 330 fichas y el DM no ve que el esqueleto es
# inmune al veneno y vulnerable al contundente. El equipo se pierde por la misma
# puerta cuando la línea «Equipo:» cae antes de «Sentidos:». La tabla del PDF no
# se versiona, así que los valores van escritos aquí, ficha a ficha.
PERFIL_TESTIGO_5_2 = {
    ("ed52", "esqueleto"): {
        "immunities": "veneno",
        "conditionImmunities": "cansancio, envenenado",
        "vulnerabilities": "contundente",
        "gear": "arco corto, espada corta",
    },
    ("ed52", "couatl"): {
        "resistances": "contundente, cortante, perforante",
        "immunities": "psíquico, radiante",
    },
    ("ed52", "behir"): {"immunities": "relámpago"},
    ("ed52", "elemental-de-tierra"): {
        "immunities": "veneno",
        "conditionImmunities": "cansancio, envenenado, inconsciente, paralizado, petrificado",
        "vulnerabilities": "trueno",
    },
}
# El flujo del PDF da 148 criaturas con «Inmunidades:», 70 con «Resistencias:»,
# 15 con «Vulnerabilidades:» y 44 con «Equipo:». El mínimo deja crecer el
# catálogo sin poner la puerta en rojo por una ficha nueva.
CAMPO_MINIMO_5_2 = {"immunities": 140, "resistances": 65, "vulnerabilities": 14, "gear": 40}


def perfil_del_5_2() -> list[str]:
    """Inmunidades, resistencias, vulnerabilidades y equipo del SRD 5.2."""
    problemas: list[str] = []
    for (ed, ficha), esperado in PERFIL_TESTIGO_5_2.items():
        f = DATOS / ed / "monstruos" / f"{ficha}.md"
        if not f.exists():
            problemas.append(f"{ed}/{ficha}: no existe la ficha testigo")
            continue
        contenido = leer(f)
        if contenido is None:
            problemas.append(f"{ed}/{ficha}: la ficha testigo no tiene frontmatter válido")
            continue
        datos, _ = contenido
        for campo, texto in esperado.items():
            valor = str(datos.get(campo) or "").strip()
            if valor != texto:
                problemas.append(f"{ed}/{ficha}: {campo} debería ser «{texto}» y dice «{valor}»")
        for campo in ("immunities", "conditionImmunities", "resistances", "vulnerabilities"):
            if campo not in datos:
                problemas.append(f"{ed}/{ficha}: la ficha no declara el campo {campo}")
    for campo, minimo in CAMPO_MINIMO_5_2.items():
        con = 0
        for f in sorted(DATOS.glob("ed52/monstruos/*.md")):
            contenido = leer(f)
            if contenido is not None and str(contenido[0].get(campo) or "").strip():
                con += 1
        if con < minimo:
            problemas.append(
                f"ed52: solo {con} fichas declaran {campo} y el flujo del SRD da al menos {minimo}"
            )
    return problemas



# Los doce objetos del SRD que faltaban en el catálogo de equipo: los siete
# paquetes del 5.1 (pág. 71, que en el PDF salen en prosa y no en tabla) y las
# cinco municiones del 5.2 (pág. 106, con su propia tabla). El nombre y el
# precio van aquí para que una regeneración no los vuelva a perder: el
# recuento del README se actualiza a partir de los ficheros, así que un hueco
# no se veía por ningún lado.
EQUIPO_TESTIGO = {
    ("ed51", "paquete-de-artista"): ("Paquete de artista", "40 po"),
    ("ed51", "paquete-de-diplomatico"): ("Paquete de diplomático", "39 po"),
    ("ed51", "paquete-de-erudito"): ("Paquete de erudito", "40 po"),
    ("ed51", "paquete-de-explorador"): ("Paquete de explorador", "10 po"),
    ("ed51", "paquete-de-explorador-de-mazmorras"): ("Paquete de explorador de mazmorras", "12 po"),
    ("ed51", "paquete-de-ladron"): ("Paquete de ladrón", "16 po"),
    ("ed51", "paquete-de-sacerdote"): ("Paquete de sacerdote", "19 po"),
    ("ed52", "balas-de-arma-de-fuego-10"): ("Balas de arma de fuego (10)", "3 po"),
    ("ed52", "dardos-50"): ("Dardos (50)", "1 po"),
    ("ed52", "flechas-20"): ("Flechas (20)", "1 po"),
    ("ed52", "proyectiles-de-honda-20"): ("Proyectiles de honda (20)", "4 pc"),
    ("ed52", "virotes-20"): ("Virotes (20)", "1 po"),
}

# Un nombre de equipo que acaba en preposición está cortado: «Paquete de
# explorador de» es la fila del PDF partida en dos líneas, con la
# continuación («mazmorras») en la línea siguiente.
COLAS_DE_CORTE_EQUIPO = (" de", " y", " o", " con", " para")


def equipo_completo() -> list[str]:
    """Los doce objetos que faltaban y los nombres de equipo cortados."""
    problemas: list[str] = []
    for (ed, ficha), (nombre, precio) in EQUIPO_TESTIGO.items():
        f = DATOS / ed / "equipo" / f"{ficha}.md"
        # `leer` revienta si el fichero no existe: aquí el que falta es
        # justamente lo que hay que decir.
        if not f.exists():
            problemas.append(f"{ed}/equipo/{ficha}: no existe la ficha testigo")
            continue
        contenido = leer(f)
        if contenido is None:
            problemas.append(f"{ed}/equipo/{ficha}: la ficha testigo no tiene frontmatter")
            continue
        datos, _ = contenido
        if str(datos.get("name") or "") != nombre:
            problemas.append(
                f"{ed}/equipo/{ficha}: debería llamarse «{nombre}» y se llama «{datos.get('name')}»"
            )
        if str(datos.get("price") or "") != precio:
            problemas.append(
                f"{ed}/equipo/{ficha}: debería costar «{precio}» y cuesta «{datos.get('price')}»"
            )
    for f in sorted(DATOS.glob("*/equipo/*.md")):
        contenido = leer(f)
        if contenido is None:
            continue
        datos, _ = contenido
        nombre = str(datos.get("name") or "").strip()
        if nombre.endswith(COLAS_DE_CORTE_EQUIPO):
            problemas.append(
                f"{f.parent.parent.name}/{f.stem}: el nombre acaba en preposición («{nombre}»), está cortado"
            )
    return problemas


# El rótulo «(Competencias en) habilidades» de la caja de 5.2 se cuela a veces
# dentro del valor de al lado cuando este parte con guion: «Conocimiento
# ar-habilidades cano», «Investigahabilidades ción». Es texto público y la
# validación lo daba por bueno, así que se buscan las palabras que lleven
# «habilidades» pegada por delante o por detrás.
HABILIDADES = re.compile(r"(?i)\b\w*habilidades\w*\b")
# Voces que acaban igual y no son un resto de rótulo.
HABILIDADES_VALIDAS = {"habilidades", "inhabilidades", "responsabilidades"}

# Los tamaños del SRD. Una palabra de esta lista dentro del alineamiento es un
# trozo de la línea de tipo que se quedó en el campo de al lado.
TAMANOS_SRD = (
    "Diminuto",
    "Diminuta",
    "Pequeño",
    "Pequeña",
    "Mediano",
    "Mediana",
    "Grande",
    "Enorme",
    "Gigante",
    "Gargantuesco",
    "Gargantuesca",
)
TAMANO_EN_ALINEAMIENTO = re.compile(r"(?i)\b(?:" + "|".join(TAMANOS_SRD) + r")\b")
# El complemento que el PDF pone suelto detrás del tamaño («de bestias
# Diminutas», «de muertos vivientes Diminutos») pertenece a `tags`.
COMPLEMENTO_DEL_TIPO = re.compile(r"(?i)^de\s+(?:bestias|muertos vivientes)\b")


def _cadenas(valor: object) -> list[str]:
    """Todo el texto de un valor del frontmatter, por anidado que venga."""
    if isinstance(valor, str):
        return [valor]
    if isinstance(valor, dict):
        return [s for v in valor.values() for s in _cadenas(v)]
    if isinstance(valor, list):
        return [s for v in valor for s in _cadenas(v)]
    return []


def palabras_pegadas() -> list[str]:
    """Palabras donde el rótulo «habilidades» se ha metido dentro del valor."""
    problemas: list[str] = []
    for f in sorted(DATOS.glob("*/*/*.md")):
        contenido = leer(f)
        if contenido is None:
            continue
        datos, cuerpo = contenido
        texto = "\n".join([*_cadenas(datos), cuerpo])
        vistas: set[str] = set()
        for m in HABILIDADES.finditer(texto):
            palabra = m.group(0)
            if palabra.lower() in HABILIDADES_VALIDAS or palabra.lower() in vistas:
                continue
            vistas.add(palabra.lower())
            problemas.append(f"{f.parent.parent.name}/{f.parent.name}/{f.stem}: «{palabra}»")
    return problemas


def linea_de_tipo() -> list[str]:
    """La línea del perfil (tipo, tamaño, alineamiento) bien partida.

    El parser separa los tres campos con una expresión regular y lo que no
    reconoce no se pierde: se queda en el campo de al lado. Así publicaron 50
    fichas «Mediano humanoide, o Pequeño, neutral» y «Grande enjambre, de
    bestias Diminutas, sin alineamiento» sin que nada fallara —el frontmatter
    era válido—, y el tamaño alternativo no llegaba al filtro. Se vigila el
    resultado, que es lo que se lee: el alineamiento no lleva palabras de
    tamaño, ni el complemento suelto del tipo, ni una aclaración entre
    paréntesis que en realidad pertenece a `tags`.
    """
    problemas: list[str] = []
    for f in sorted(DATOS.glob("*/monstruos/*.md")):
        contenido = leer(f)
        if contenido is None:
            continue
        datos, _ = contenido
        alineamiento = str(datos.get("alignment") or "").strip()
        etiqueta = f"{f.parent.parent.name}/{f.stem}"
        tamano = TAMANO_EN_ALINEAMIENTO.search(alineamiento)
        if tamano:
            problemas.append(
                f"{etiqueta}: `alignment` lleva el tamaño «{tamano.group(0)}» («{alineamiento}»)"
            )
        elif alineamiento.startswith("("):
            problemas.append(
                f"{etiqueta}: `alignment` empieza con una aclaración del tipo («{alineamiento}»)"
            )
        elif COMPLEMENTO_DEL_TIPO.match(alineamiento):
            problemas.append(
                f"{etiqueta}: `alignment` lleva el complemento del tipo («{alineamiento}»)"
            )
    return problemas


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


def nombres_repetidos(fichas: list[tuple[str, str]]) -> list[str]:
    """Nombres que se repiten dentro de la misma carpeta y categoría.

    Dos fichas pueden compartir nombre si son cosas distintas: el SRD 5.2 titula
    «Competencia» al apartado de características (pág. 8) y a la voz del glosario
    (pág. 198), y los dos SRD titulan «Bastón» al arma y al canalizador arcano.
    Mientras la categoría las separe, el listado enseña la columna que las
    distingue y no engaña a nadie.

    Lo que no puede pasar es que dos fichas de la misma carpeta y la misma
    categoría compartan nombre: `/5.5/equipo/` publicó dos «Vara» —la pértiga de
    3 m de la tabla de equipo y el canalizador arcano, las dos como «Equipo de
    aventurero»— y el validador las apuntaba en el informe sin suspender la
    pasada, así que la web mostraba dos filas idénticas y nada fallaba.
    """
    vistas: dict[tuple[str, str], tuple[str, str, int]] = {}
    for nombre, categoria in fichas:
        nombre = nombre.strip()
        categoria = categoria.strip()
        if not nombre:
            continue
        clave = (nombre.casefold(), categoria.casefold())
        previa = vistas.get(clave)
        vistas[clave] = (nombre, categoria, 1 + (previa[2] if previa else 0))
    return sorted(
        f"{nombre} — {categoria or 'sin categoría'}"
        for nombre, categoria, veces in vistas.values()
        if veces > 1
    )


def revisar_carpeta(ed: str, carpeta: Path) -> tuple[list[str], int, int]:
    """Revisa una carpeta de `data/`: devuelve (líneas, entradas, incidencias)."""
    tipo = carpeta.name
    ficheros = sorted(carpeta.glob("*.md"))
    vacios: list[str] = []
    faltan: list[str] = []
    largos: list[str] = []
    fichas: list[tuple[str, str]] = []

    for f in ficheros:
        contenido = leer(f)
        if contenido is None:
            faltan.append(f"{f.name} (sin frontmatter válido)")
            continue
        datos, cuerpo = contenido
        fichas.append((str(datos.get("name") or ""), str(datos.get("category") or "")))
        for campo in OBLIGATORIOS.get(tipo, ["name"]):
            if datos.get(campo) in (None, "", []):
                faltan.append(f"{f.name}: {campo}")
        # En equipo y objetos la ficha puede vivir solo en el
        # frontmatter (precio, peso, rareza): no es un error.
        if len(cuerpo.strip()) == 0 and tipo not in ("equipo", "objetos"):
            vacios.append(f.name)
        elif len(cuerpo) > LIMITE_CUERPO.get(tipo, 20_000):
            largos.append(f"{f.name} ({len(cuerpo)} caracteres)")

    duplicados = nombres_repetidos(fichas)
    referencia = REFERENCIA.get((ed, tipo))
    estado = "OK"
    incidencias = 0
    if referencia is not None and len(ficheros) != referencia:
        estado = f"DESCUADRE ({len(ficheros)} de {referencia})"
        incidencias += 1
    # Son fallos los campos obligatorios vacíos, los cuerpos vacíos y dos fichas
    # con el mismo nombre en la misma categoría; un cuerpo largo solo es un
    # aviso para revisar.
    if faltan or vacios or duplicados:
        incidencias += 1

    lineas = [f"## {ed} · {tipo} — {len(ficheros)} entradas · {estado}"]
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
        lineas.append(
            f"- Nombres repetidos en la misma categoría: **{len(duplicados)}** "
            f"({'; '.join(duplicados[:8])})"
        )
    lineas.append("")
    return lineas, len(ficheros), incidencias


def main() -> int:
    lineas = ["# Informe de validación", "", "Generado por `tools/verify/validar.py`.", ""]
    problemas = 0
    total = 0
    reales: dict[tuple[str, str], int] = {}

    for ed in sorted(p.name for p in DATOS.iterdir() if p.is_dir()):
        for carpeta in sorted(p for p in (DATOS / ed).iterdir() if p.is_dir()):
            bloque, entradas, incidencias = revisar_carpeta(ed, carpeta)
            lineas += bloque
            total += entradas
            problemas += incidencias
            reales[(ed, carpeta.name)] = entradas

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

    # El perfil de las criaturas es lo que el DM consulta en la mesa: un valor
    # cortado se publica tal cual, así que se comprueba en cada pasada.
    perfil = perfil_completo()
    lineas += ["## Perfil de las criaturas", ""]
    if perfil:
        problemas += 1
        lineas.append(f"- Valores cortados o fichas testigo incompletas: **{len(perfil)}**")
        lineas += [f"  - {p}" for p in perfil[:15]]
        if len(perfil) > 15:
            lineas.append(f"  - …y {len(perfil) - 15} más")
    else:
        lineas.append("- Ningún campo del perfil acaba cortado y las fichas testigo están completas.")
    lineas.append("")

    # Las tiradas de salvación del 5.2 viven en la tercera columna de la tabla
    # de características y no en una etiqueta, así que el parser las perdía sin
    # romper nada: la ficha salía más corta y en paz. Se vigilan las fichas
    # testigo y un mínimo por edición.
    salvaciones = salvaciones_completas()
    lineas += ["## Tiradas de salvación", ""]
    if salvaciones:
        problemas += 1
        lineas.append(f"- Fichas sin las salvaciones que les da el SRD: **{len(salvaciones)}**")
        lineas += [f"  - {p}" for p in salvaciones[:15]]
        if len(salvaciones) > 15:
            lineas.append(f"  - …y {len(salvaciones) - 15} más")
    else:
        lineas.append(
            "- Las fichas testigo declaran sus salvaciones y cada edición pasa su mínimo."
        )
    lineas.append("")

    # Las inmunidades, resistencias y vulnerabilidades del 5.2 se perdían por la
    # misma puerta que las salvaciones: el parser no conoce las etiquetas de
    # 2024 y las tiraba en silencio. Se vigilan las fichas testigo y un mínimo.
    perfil52 = perfil_del_5_2()
    lineas += ["## Inmunidades, resistencias y vulnerabilidades del 5.2", ""]
    if perfil52:
        problemas += 1
        lineas.append(f"- Campos del perfil del 5.2 perdidos: **{len(perfil52)}**")
        lineas += [f"  - {p}" for p in perfil52[:15]]
        if len(perfil52) > 15:
            lineas.append(f"  - …y {len(perfil52) - 15} más")
    else:
        lineas.append(
            "- Las fichas testigo del 5.2 declaran sus inmunidades, resistencias, "
            "vulnerabilidades y equipo, y el catálogo pasa sus mínimos."
        )
    lineas.append("")

    # El catálogo de equipo tiene que seguir cubriendo el capítulo del SRD:
    # los siete paquetes del 5.1 y las cinco municiones del 5.2 se perdían
    # porque el extractor de equipo solo leía tablas, y una regeneración los
    # volvería a perder sin que ningún recuento lo notara.
    equipo = equipo_completo()
    lineas += ["## Catálogo de equipo", ""]
    if equipo:
        problemas += 1
        lineas.append(f"- Objetos que faltaban o nombres cortados: **{len(equipo)}**")
        lineas += [f"  - {p}" for p in equipo[:15]]
        if len(equipo) > 15:
            lineas.append(f"  - …y {len(equipo) - 15} más")
    else:
        lineas.append(
            "- Los doce objetos que faltaban están y ningún nombre de equipo acaba cortado."
        )
    lineas.append("")

    # La caja de atributos de 5.2 parte los rótulos en dos líneas y el
    # linealizador los puede meter dentro del valor vecino, a media palabra.
    pegadas = palabras_pegadas()
    lineas += ["## Rótulos dentro del valor", ""]
    if pegadas:
        problemas += 1
        lineas.append(f"- Palabras con «habilidades» pegada a otra: **{len(pegadas)}**")
        lineas += [f"  - {p}" for p in pegadas[:15]]
        if len(pegadas) > 15:
            lineas.append(f"  - …y {len(pegadas) - 15} más")
    else:
        lineas.append("- Ninguna palabra lleva «habilidades» pegada por delante ni por detrás.")
    lineas.append("")

    # La línea de tipo es lo primero que se lee de una ficha y lo que más se
    # rompe al regenerar `data/`: si el parser no reconoce una forma, el trozo
    # que sobra se queda en el alineamiento y nadie se entera.
    tipos = linea_de_tipo()
    lineas += ["## Línea de tipo (tipo, tamaño y alineamiento)", ""]
    if tipos:
        problemas += 1
        lineas.append(f"- Alineamientos con un trozo de la línea de tipo: **{len(tipos)}**")
        lineas += [f"  - {p}" for p in tipos[:15]]
        if len(tipos) > 15:
            lineas.append(f"  - …y {len(tipos) - 15} más")
    else:
        lineas.append(
            "- Ningún alineamiento lleva el tamaño, una aclaración del tipo ni su complemento suelto."
        )
    lineas.append("")

    lineas.insert(3, f"Total de entradas: **{total}**. Apartados con incidencias: **{problemas}**.")
    INFORME.parent.mkdir(parents=True, exist_ok=True)
    INFORME.write_text("\n".join(lineas), encoding="utf-8")
    print("\n".join(lineas[:8]))
    print(f"\nInforme completo en {INFORME}")
    return 1 if problemas else 0


if __name__ == "__main__":
    raise SystemExit(main())
