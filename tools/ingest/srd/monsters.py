"""Extracción de monstruos de los SRD en español (5.1 y 5.2)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .stream import CIERRE_RE, Line, paragraphs

TYPES = (
    "Aberración",
    "Autómata",
    "Bestia",
    "Celestial",
    "Cieno",
    "Dragón",
    "Elemental",
    "Enjambre",
    "Feérico",
    "Infernal",
    "Gigante",
    "Humanoide",
    "Monstruosidad",
    "Muerto viviente",
    "Planta",
    "Semidiós",
)

SIZES = ("Diminuto", "Diminuta", "Pequeño", "Pequeña", "Mediano", "Mediana", "Grande", "Enorme", "Gigante", "Gargantuesco", "Gargantuesca")

TYPE_RE = re.compile(
    r"^(?:Enjambre de\s+)?(?:"
    + "|".join(TYPES)
    + r")\s+(?:"
    + "|".join(SIZES)
    + r")\b"
)

CR_RE = re.compile(r"^(?:Desafío|VD):\s*(?P<cr>[^()]+?)\s*\((?P<xp>[^)]*)\)")

STAT_LABELS = (
    "Tiradas de salvación:",
    "Habilidades:",
    "Resistencia a daño:",
    "Inmunidad a daño:",
    "Inmunidad a estados:",
    "Vulnerabilidad a daño:",
    # El 5.2 da los cuatro campos con una sola etiqueta por campo y los tipos de
    # daño y los estados dentro de la misma lista. Sin estas tres, la línea no
    # casa con ninguna etiqueta, cae en `body`, `_split_feature` no le ve el
    # «. » de un rasgo y se tira en silencio en las 330 fichas.
    "Inmunidades:",
    "Resistencias:",
    "Vulnerabilidades:",
    "Sentidos:",
    "Idiomas:",
    "PG:",
    "Desafío:",
    "VD:",
    "Competencia:",
    "Equipo:",
    "Iniciativa:",
)

FIELD_BY_LABEL = {
    "Tiradas de salvación": "saves",
    "Habilidades": "skills",
    "Resistencia a daño": "resistances",
    "Inmunidad a daño": "immunities",
    "Inmunidad a estados": "condition_immunities",
    "Vulnerabilidad a daño": "vulnerabilities",
    "Inmunidades": "immunities",
    "Resistencias": "resistances",
    "Vulnerabilidades": "vulnerabilities",
    "Sentidos": "senses",
    "Idiomas": "languages",
    "Competencia": "proficiency",
    "Equipo": "gear",
}

# Las tres etiquetas del 5.2 que llevan daño y estados en el mismo valor.
SPLIT_LABELS = ("Inmunidades", "Resistencias", "Vulnerabilidades")

# Los nombres que el SRD 5.2 usa en esos campos. Un trozo que abre con un estado
# va a `conditionImmunities` y el resto al campo de daño: es lo que reparte
# «veneno; cansancio, envenenado» y también «asustado, envenenado, hechizado»,
# que llega sin «;» porque la criatura solo tiene estados.
CONDITIONS = (
    "agarrado",
    "apresado",
    "asustado",
    "aturdido",
    "cansancio",
    "cegado",
    "derribado",
    "ensordecido",
    "envenenado",
    "hechizado",
    "incapacitado",
    "inconsciente",
    "invisible",
    "paralizado",
    "petrificado",
)

SECTION_HEADS = {
    "Acciones": "actions",
    "Acciones adicionales": "bonus_actions",
    "Reacciones": "reactions",
    "Acciones legendarias": "legendary",
    "Acciones de guarida": "lair",
    "Efectos de guarida": "lair",
    "Rasgos": "traits",
    "Atributos": "traits",
}

ABILITY_LINE_RE = re.compile(r"(Fue|Des|Con|Int|Sab|Car)\s*(-?\d+)\s*([+−-]\d+)")

# Fila de la tabla del 5.2: «F 21 +5 +5 D 9 −1 +3 …», puntuación, modificador y
# salvación. El lookbehind evita que el modificador se lea como puntuación de la
# siguiente característica.
ABILITY_TRIPLE_RE = re.compile(r"(?<![+\d−-])(\d{1,2})\s+([+−]?\d{1,2})\s+([+−]?\d{1,2})")


@dataclass
class Monster:
    name: str
    type_line: str
    size: str = ""
    kind: str = ""
    tags: str = ""
    alignment: str = ""
    ac: str = ""
    hp: str = ""
    speed: str = ""
    initiative: str = ""
    abilities: dict[str, int] = field(default_factory=dict)
    saves: str = ""
    skills: str = ""
    resistances: str = ""
    immunities: str = ""
    condition_immunities: str = ""
    vulnerabilities: str = ""
    senses: str = ""
    languages: str = ""
    gear: str = ""
    cr: str = ""
    xp: str = ""
    proficiency: str = ""
    traits: list[tuple[str, str]] = field(default_factory=list)
    actions: list[tuple[str, str]] = field(default_factory=list)
    bonus_actions: list[tuple[str, str]] = field(default_factory=list)
    reactions: list[tuple[str, str]] = field(default_factory=list)
    legendary: list[tuple[str, str]] = field(default_factory=list)
    lair: list[tuple[str, str]] = field(default_factory=list)
    page: int = 0


def _duplica_cabecera(lines: list[Line], i: int) -> bool:
    """El PDF repite el nombre de la criatura: cabecera de página y título.

    En el 5.2 la línea del nombre sale dos veces seguidas («Doppelganger» a
    156,2 y a 180,5 en la pág. 297) y solo la segunda lleva detrás la línea de
    tipo, así que `is_header()` no reconoce la primera y el nombre entraba en el
    cuerpo de la criatura anterior (T-0241).
    """
    return (
        i + 1 < len(lines)
        and lines[i].text.strip() == lines[i + 1].text.strip()
        and is_header(lines, i + 1)
    )


def is_header(lines: list[Line], i: int) -> bool:
    if i + 1 >= len(lines):
        return False
    head, nxt = lines[i], lines[i + 1]
    if TYPE_RE.match(head.text.strip()):
        return False
    return bool(TYPE_RE.match(nxt.text.strip())) and len(head.text) < 70


_SIZE_RE = "|".join(SIZES)
_KIND_RE = "(?:Enjambre de\\s+)?(?:" + "|".join(TYPES) + ")"

# La línea del perfil: «Humanoide Mediano o Pequeño (mago), neutral». El tamaño
# puede venir doble —el «o Pequeño» de las 36 fichas de 5.2.1— y la aclaración
# entre paréntesis va detrás del tamaño que sea, no solo del primero; en 5.1 la
# coma se cuela delante de ella («Infernal Diminuto, (diablo, cambiaformas),
# legal malvado»). Sin las dos cosas, el trozo que sobra no se pierde: se queda
# en el alineamiento y la ficha publica «Mediano humanoide, o Pequeño, neutral».
TYPE_LINE_RE = re.compile(
    r"^(?P<kind>" + _KIND_RE + ")"
    r"\s+(?P<size>" + _SIZE_RE + ")"
    r"(?:\s+[ou]\s+(?P<alt>" + _SIZE_RE + "))?"
    r"\s*,?\s*(?:\((?P<tags>[^)]*)\))?"
    r"\s*(?P<rest>.*)$",
)

# El complemento del tipo que el PDF pone suelto detrás del tamaño —«Enjambre
# Mediano de bestias Diminutas»— tampoco es alineamiento: va a `tags`, que es
# donde la ficha lo pinta entre paréntesis, y el tipo sigue siendo Enjambre, de
# donde sale el icono de la banda. Restringido a las dos formas que usa el SRD
# para no tragarse texto legítimo del alineamiento.
LOOSE_TAGS_RE = re.compile(r"^(?P<tags>de\s+(?:bestias|muertos vivientes)\s+\w+)\s*,?\s*")


def _split_type(text: str) -> tuple[str, str, str, str]:
    m = TYPE_LINE_RE.match(text)
    if not m:
        return "", "", "", text
    size = m.group("size")
    if m.group("alt"):
        size = f"{size} o {m.group('alt')}"
    tags = m.group("tags") or ""
    rest = m.group("rest")
    suelto = LOOSE_TAGS_RE.match(rest)
    if suelto:
        tags = ", ".join(t for t in (tags, suelto.group("tags")) if t)
        rest = rest[suelto.end() :]
    return m.group("kind"), size, tags, rest.strip(" ,")


def _split_feature(text: str) -> tuple[str, str]:
    """Separa 'Nombre. texto' en (nombre, texto)."""
    m = re.match(r"^([^.:]{2,70})\.\s+(.*)$", text, re.S)
    if m and not m.group(1).lower().startswith(("por ejemplo", "es decir")):
        return m.group(1).strip(), m.group(2).strip()
    return "", text.strip()


# Una etiqueta que el flujo deja suelta al final de la línea («Acierto:») y la
# tirada de daño a la que etiqueta. La etiqueta se recoloca delante del valor,
# que ya está publicado: si no, la acción acaba en una etiqueta sin número.
ETIQUETA_SUELTA_RE = re.compile(r"\s+([A-ZÁÉÍÓÚÑ][\wáéíóúüñÁÉÍÓÚÑ ]{0,25}:)$")
TIRO_DE_DANO_RE = re.compile(r"\d+ \(\d+d\d+(?:\s*[+−-]\s*\d+)?\)")


def _recoloca_etiqueta(detalle: str) -> str:
    """Mueve al sitio una etiqueta que el flujo puso detrás de su valor."""
    m = ETIQUETA_SUELTA_RE.search(detalle)
    if not m:
        return detalle
    sin = detalle[: m.start()].rstrip()
    tiro = None
    for tiro in TIRO_DE_DANO_RE.finditer(sin):
        pass
    if tiro is None:
        return detalle
    return f"{sin[: tiro.start()].rstrip()} {m.group(1)} {sin[tiro.start() :].strip()}"


def _between(text: str, start: str, stops: tuple[str, ...]) -> str:
    idx = text.find(start)
    if idx < 0:
        return ""
    rest = text[idx + len(start) :].strip(" :")
    for stop in stops:
        cut = rest.find(stop)
        if cut > 0:
            rest = rest[:cut]
    return rest.strip(" ,;")


ALL_LABELS = STAT_LABELS + ("Clase de Armadura:", "CA:", "Puntos de golpe:", "Velocidad:")

# Una etiqueta nueva del perfil («Inmunidades:», «VD:», «Equipo:») cierra el
# valor de la anterior, y una fila de la tabla de características («FUE DES
# CON...», «25 (+7) 10 (+0)...») tampoco es una continuación.
NEW_LABEL_RE = re.compile(r"^[A-ZÁÉÍÓÚÑ][\wáéíóúüñÁÉÍÓÚÑ .,'’/-]{0,45}:")
# Una fila de la tabla de características es una retahíla de "puntuación
# (modificador)": «25 (+7) 10 (+0) …». Un solo «0 (10 PX)» es el valor de
# Desafío de una criatura de VD 0, no una fila.
STAT_ROW_RE = re.compile(r"^(?:MOD\.\s*SAL\.|FUE\s|Fue\s|[FDCIS]\s+[−-]?\d|(?:[−-]?\d+\s*\([+−-]?\d+\)\s*){2,}$)")
STAT_ABBREV_RE = re.compile(r"^(?:Fue|Des|Con|Int|Sab|Car|FUE|DES|CON|INT|SAB|CAR)\b")


def _is_profile_value(text: str) -> bool:
    """¿La línea es un valor del perfil y no una etiqueta ni una fila de la tabla?"""
    t = text.strip()
    if not t or t in SECTION_HEADS or t.endswith(":"):
        return False
    if any(t.startswith(lbl) for lbl in ALL_LABELS):
        return False
    return not (NEW_LABEL_RE.match(t) or STAT_ROW_RE.match(t) or TYPE_RE.match(t))


def _same_paragraph(a: Line, b: Line) -> bool:
    """Mismo párrafo según el maquetador: misma página, columna y bloque."""
    return a.page == b.page and a.col == b.col and a.block >= 0 and a.block == b.block


def join_dangling_labels(lines: list[Line]) -> list[Line]:
    """Une 'Clase de Armadura:' con el valor de la línea siguiente."""
    out: list[Line] = []
    i = 0
    while i < len(lines):
        cur = lines[i]
        if cur.text.rstrip().endswith(":") and i + 1 < len(lines):
            nxt = lines[i + 1]
            # El valor empieza por dígito o por la abreviatura de una
            # característica («Des +6, Con +13»), o comparte párrafo con una
            # etiqueta del perfil y es un valor suyo. El rótulo de un rasgo o
            # una acción también acaba en «:» («Golpe. Ataque con arma cuerpo
            # a cuerpo:»), pero no es una etiqueta del perfil y unirlo aquí
            # partía el rasgo en dos párrafos y perdía el segundo.
            es_del_perfil = any(cur.text.strip().startswith(lbl) for lbl in ALL_LABELS)
            sigue_valor = nxt.text[:1].isdigit() or bool(STAT_ABBREV_RE.match(nxt.text.strip()))
            if _is_profile_value(nxt.text) and (sigue_valor or (es_del_perfil and _same_paragraph(cur, nxt))):
                # La línea unida ocupa dos renglones y `end_y` guarda dónde
                # acaba. Si solo se moviera la `y`, el hueco hasta la línea
                # siguiente valdría dos renglones y `stream.paragraphs()`
                # cortaría ahí el párrafo: el trozo suelto no empieza por
                # «Nombre. », `_split_feature()` lo descarta y la ficha publica
                # la acción a media frase (T-0241, el «Impacto:» del mordisco).
                out.append(
                    Line(
                        cur.page,
                        cur.col,
                        cur.x,
                        cur.y,
                        cur.size,
                        f"{cur.text} {nxt.text}".strip(),
                        cur.block,
                        end_y=nxt.y,
                    )
                )
                i += 2
                continue
        out.append(cur)
        i += 1
    return out


def merge_continuations(lines: list[Line]) -> list[Line]:
    """Une las líneas de continuación de las etiquetas del perfil.

    El PDF parte los valores largos ("Clase de Armadura: 11 en forma
    humanoide, 12" + "(armadura natural) en formas de lobo...") y también la
    línea de tipo de la criatura. El corte no siempre deja la continuación en
    minúscula: «Sentidos: ... 36 m,» + «Percepción pasiva 22» o «Habilidades:
    ... Historia +9,» + «Percepción +6» empiezan por mayúscula y comparten
    bloque con la etiqueta, así que el bloque del maquetador es la señal que
    distingue una continuación de una etiqueta nueva.
    """
    out: list[Line] = []
    i = 0
    while i < len(lines):
        cur = lines[i]
        text = cur.text.rstrip()
        if any(text.startswith(lbl) for lbl in ALL_LABELS) or TYPE_RE.match(text):
            j = i + 1
            while j < len(lines):
                nxt = lines[j].text.strip()
                if (
                    _is_profile_value(nxt)
                    and len(nxt) < 90
                    and (nxt[:1].islower() or nxt.startswith("(") or _same_paragraph(cur, lines[j]))
                ):
                    text = f"{text} {nxt}"
                    j += 1
                    continue
                break
            # `end_y` es la `y` de la última línea consumida, igual que en
            # `join_dangling_labels`: la línea unida ocupa varios renglones y el
            # hueco con la siguiente se mide desde ahí, no desde el principio.
            out.append(Line(cur.page, cur.col, cur.x, cur.y, cur.size, text, cur.block, end_y=lines[j - 1].y))
            i = j
            continue
        out.append(cur)
        i += 1
    return out


def _parse_abilities(blob: str) -> dict[str, int]:
    keys = ("fue", "des", "con", "int", "sab", "car")
    # Formato 5.1: "21 (+5) 9 (−1) 15 (+2) ..."
    vals = re.findall(r"(-?\d+)\s*\(([+−-]\d+)\)", blob)
    if len(vals) == 6:
        return {k: int(v[0]) for k, v in zip(keys, vals)}
    # Formato 5.2: "F 21 +5 +5 D 9 −1 +3 ..." (puntuación, modificador, salvación)
    triples = ABILITY_TRIPLE_RE.findall(blob)
    if len(triples) == 6:
        return {k: int(t[0]) for k, t in zip(keys, triples)}
    mods = ABILITY_LINE_RE.findall(blob)
    if len(mods) >= 6:
        return {k.lower(): int(v) for k, v, _ in mods[:6]}
    return {}


def _entero(valor: str) -> int:
    return int(valor.replace("−", "-").replace("+", ""))


def _con_signo(valor: str) -> str:
    """El SRD imprime siempre el signo de la salvación; una celda sin él se
    publica con «+», que es la convención de la columna («2» en la Int del
    dragón blanco joven, pág. 300, es la única del catálogo)."""
    return valor if valor[:1] in "+−-" else f"+{valor}"


def _parse_saves(blob: str) -> str:
    """Tiradas de salvación de la tercera columna de la tabla del 5.2.

    La caja de características del 5.2 trae tres columnas por característica
    —puntuación, modificador y salvación, con «MOD. SALV.» repetido en la
    cabecera— y la tabla del 5.1 solo dos, con la fila en su propia etiqueta.
    Se publica solo la salvación que no es el modificador, que es la que tiene
    competencia: el secuaz goblin («F 8 −1 −1») se queda sin fila, como en el
    SRD.
    """
    if len(re.findall(r"(-?\d+)\s*\(([+−-]\d+)\)", blob)) == 6:
        return ""
    triples = ABILITY_TRIPLE_RE.findall(blob)
    if len(triples) != 6:
        return ""
    partes = [
        f"{abrev} {_con_signo(salvacion)}"
        for abrev, (_, mod, salvacion) in zip(("Fue", "Des", "Con", "Int", "Sab", "Car"), triples)
        if _entero(mod) != _entero(salvacion)
    ]
    return ", ".join(partes)


def _split_damage_conditions(valor: str) -> tuple[str, str]:
    """«veneno, fuego; asustado, cansancio» → («veneno, fuego», «asustado, cansancio»)."""
    dano: list[str] = []
    estados: list[str] = []
    for trozo in valor.replace(";", ",").split(","):
        trozo = trozo.strip(" .,;")
        if not trozo:
            continue
        (estados if trozo.split()[0].lower() in CONDITIONS else dano).append(trozo)
    return ", ".join(dano), ", ".join(estados)


def parse(lines: list[Line]) -> list[Monster]:
    lines = merge_continuations(join_dangling_labels(lines))
    monsters: list[Monster] = []
    i = 0
    while i < len(lines):
        if not is_header(lines, i):
            i += 1
            continue

        head, type_line = lines[i], lines[i + 1]
        m = Monster(name=head.text.strip(), type_line=type_line.text.strip(), page=head.page)
        m.kind, m.size, m.tags, m.alignment = _split_type(m.type_line)

        # Bloque de datos: desde CA hasta la primera etiqueta de habilidades. El
        # «Equipo:» del 5.2 va antes de «Sentidos:», así que sin nombrarlo aquí
        # la línea entra en la cabecera, que solo saca CA, Iniciativa, PG,
        # Velocidad y la tabla, y el equipo se pierde (13 de las 44 criaturas).
        j = i + 2
        hdr: list[str] = []
        while j < len(lines) and not is_header(lines, j) and not _duplica_cabecera(lines, j):
            text = lines[j].text.strip()
            if text.startswith(("Habilidades:", "Tiradas de salvación:", "Sentidos:", "Equipo:", "Resistencia a daño:", "Inmunidad a daño:", "Inmunidad a estados:", "Vulnerabilidad a daño:", "Inmunidades:", "Resistencias:", "Vulnerabilidades:", "Idiomas:", "Desafío:", "VD:")):
                break
            if text in SECTION_HEADS:
                break
            hdr.append(text)
            j += 1

        blob = " ".join(hdr)
        m.ac = _between(blob, "Clase de Armadura:", ("Iniciativa:", "PG:", "Puntos de golpe:", "Velocidad:")) or _between(
            blob, "CA:", ("Iniciativa:", "PG:", "Puntos de golpe:", "Velocidad:")
        )
        m.initiative = _between(blob, "Iniciativa:", ("PG:", "Puntos de golpe:", "Velocidad:"))
        m.hp = _between(blob, "Puntos de golpe:", ("Velocidad:",)) or _between(blob, "PG:", ("Velocidad:",))
        m.speed = _between(blob, "Velocidad:", ("MOD. SALV.", "FUE ", "Fue "))
        if not m.speed and "Velocidad:" in blob:
            m.speed = re.split(r"\s(?:MOD\.|FUE|[FDCIS]\s\d)", _between(blob, "Velocidad:", ()))[0]
        m.abilities = _parse_abilities(blob)
        saves_tabla = _parse_saves(blob)

        # Algunas páginas parten la etiqueta («CA: Iniciativa:» y los valores
        # en la línea siguiente). Se reparte aquí.
        if "Iniciativa" in (m.ac or ""):
            mm = re.search(r"Iniciativa:\s*(\d+)\s*([+−-]\d+)\s*\((\d+)\)", m.ac)
            if mm:
                m.ac = mm.group(1)
                m.initiative = f"{mm.group(2)} ({mm.group(3)})"

        # Resto del perfil: etiquetas de datos y rasgos/acciones.
        body: list[Line] = []
        last_field = ""
        while j < len(lines) and not is_header(lines, j) and not _duplica_cabecera(lines, j):
            text = lines[j].text.strip()
            matched = False
            for label in STAT_LABELS:
                if text.startswith(label):
                    key = label.rstrip(":")
                    if key in SPLIT_LABELS:
                        # «Inmunidades: veneno; cansancio, envenenado»: el daño
                        # va al campo de la etiqueta y los estados a
                        # `conditionImmunities`.
                        dano, estados = _split_damage_conditions(_between(text, label, ()))
                        last_field = FIELD_BY_LABEL[key]
                        setattr(m, last_field, dano)
                        if estados:
                            m.condition_immunities = ", ".join(
                                t for t in (m.condition_immunities, estados) if t
                            )
                    elif key in FIELD_BY_LABEL:
                        last_field = FIELD_BY_LABEL[key]
                        setattr(m, last_field, _between(text, label, ()))
                    elif key == "PG":
                        last_field = ""
                        m.hp = m.hp or _between(text, "PG:", ("Velocidad:",))
                        if "Velocidad:" in text and not m.speed:
                            m.speed = _between(text, "Velocidad:", ())
                    else:
                        last_field = ""
                        mm = CR_RE.match(text)
                        if mm:
                            m.cr = mm.group("cr").strip()
                            m.xp = mm.group("xp").strip()
                        else:
                            m.cr = _between(text, label, ())
                    matched = True
                    break
            if matched:
                j += 1
                continue
            if last_field and text[:1].islower():
                # Continuación de un campo largo (idiomas, sentidos...).
                setattr(m, last_field, f"{getattr(m, last_field)} {text}".strip())
                j += 1
                continue
            last_field = ""
            body.append(lines[j])
            j += 1

        # La etiqueta «Tiradas de salvación:» del 5.1 manda; en el 5.2 la fila
        # sale de la tercera columna de la tabla.
        m.saves = m.saves or saves_tabla

        current = "traits"
        for para in paragraphs(body):
            text = para.strip()
            if text in SECTION_HEADS:
                current = SECTION_HEADS[text]
                continue
            name, detail = _split_feature(text)
            if name:
                getattr(m, current).append((name, _recoloca_etiqueta(detail)))
                continue
            # Un párrafo que no empieza por «Nombre. » es la continuación del
            # rasgo anterior —llega con la frase abierta, o es prosa larga que
            # el maquetador sangró— y descartarlo publicaba la ficha cortada sin
            # que fallara ninguna puerta (T-0241). Lo que se queda fuera son las
            # cabeceras de página y los títulos de sección del PDF, que son
            # cortos: «Doppelganger», «Monstruos (D) Demonios».
            seccion = getattr(m, current)
            # Se pega si el rasgo anterior está a media frase, o si es prosa
            # entera (cierra frase y tiene cuerpo): la introducción de una
            # variante («Los piratas son los bandidos del mar…») llega así. Las
            # cabeceras de página y las filas de tabla del PDF, que se cuelan en
            # el cuerpo, no acaban en punto y se quedan fuera.
            if seccion and (
                not CIERRE_RE.search(seccion[-1][1].rstrip())
                or (len(text.split()) > 6 and bool(CIERRE_RE.search(text)))
            ):
                nombre_previo, detalle_previo = seccion[-1]
                seccion[-1] = (nombre_previo, f"{detalle_previo} {text}".strip())

        monsters.append(m)
        i = j
    return monsters
