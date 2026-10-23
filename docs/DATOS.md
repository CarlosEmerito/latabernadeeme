# Modelo de datos de La Taberna de Eme

La fuente de verdad es **un fichero Markdown por entidad**, con frontmatter YAML.
No hay JSON gigantes: cada entrada se revisa y se corrige en su propio fichero,
el `git diff` de un cambio es legible y dos personas pueden editar entradas
distintas sin conflictos.

```
data/
  ed51/            # SRD 5.1 (reglas de 2014)
  ed52/            # SRD 5.2.1 (reglas de 2024, "5.5")
    conjuros/      slug.md
    monstruos/     slug.md
    objetos/       slug.md
    equipo/        slug.md
    clases/        slug.md
    especies/      slug.md
    trasfondos/    slug.md
    dotes/         slug.md
    reglas/        slug.md
```

El `slug` es el nombre en minúsculas, sin tildes ni signos, con guiones:
`Bola de fuego` → `bola-de-fuego.md`.

El identificador de un fichero lo decide **el orden de aparición en el PDF**, no
el objeto: las tablas del SRD se reordenaron entre ediciones y los ficheros se
renumeraron. Por eso el identificador no sirve para decir si dos entradas de
ediciones distintas son el mismo objeto —la «Vara» del 5.1 es la varita de 1 kg
y la del 5.2.1 la pértiga de 3 m—, y el emparejamiento del comparador va por
**identidad**: el nombre que le da el SRD, con el paréntesis final separado
como desambiguador. `src/lib/emparejar.ts` lo resuelve y
`tools/test/emparejar.mjs` lo vigila.

## Reglas de conversión

- El texto es **literal del SRD en español**. No se reescribe ni se resume.
- Los párrafos van separados por una línea en blanco.
- Los epígrafes internos (`A niveles superiores`, `Acciones`, `Rasgos`…) van
  como `##`.
- Las negritas del original se conservan con `**texto**` cuando marcan el
  nombre de un rasgo o una palabra clave del juego.
- Nada de HTML en el cuerpo.

## Esquemas

### conjuros (`data/ed5x/conjuros/*.md`)

```yaml
---
name: Bola de fuego
level: 3           # 0 = truco
school: Evocación  # Abjuración, Adivinación, Conjuración, Encantamiento,
                   # Evocación, Ilusionismo, Nigromancia, Transmutación
ritual: false
concentration: false
castingTime: 1 acción
range: 45 m
components: V, S, M (una pelotita de guano de murciélago y azufre)
duration: Instantáneo
classes: [Hechicero, Mago]
srd: "5.1"
---
```

### monstruos (`data/ed5x/monstruos/*.md`)

```yaml
---
name: Goblin
size: Pequeño
type: Humanoide
tags: trasgo
alignment: neutral malvado
ac: 15 (armadura de cuero, escudo)
hp: 7 (2d6)
speed: 9 m
initiative: ""            # solo 5.2
abilities: {fue: 8, des: 14, con: 10, int: 10, sab: 8, car: 8}
saves: ""
skills: Sigilo +6
resistances: ""
immunities: ""
conditionImmunities: ""
vulnerabilities: ""
senses: visión en la oscuridad 18 m, Percepción pasiva 9
languages: común, goblin
cr: "1/4"
xp: 50 PX
proficiency: ""
gear: ""
srd: "5.1"
---
```

Cuerpo: `## Rasgos`, `## Acciones`, `## Acciones adicionales`, `## Reacciones`,
`## Acciones legendarias`, cada rasgo como `**Nombre.** texto`.

`xp` se copia tal cual viene del SRD, con separador de millar y, en las criaturas con
guarida, un segundo valor: `50 PX`, `18 000 PX`, `50 000 PX o 62 000 en la guarida; BC +7`.
Quien lo lea tiene que quedarse con el valor base (lo que va antes del primer `PX`) y quitar
los separadores: `src/lib/xp.ts` lo hace para el índice JSON y para las herramientas de
`/mesa/`.

`saves`, `resistances`, `immunities`, `conditionImmunities`, `vulnerabilities` y `gear` salen
del perfil de la criatura, y cada edición lo escribe a su manera. El 5.1 los da con etiqueta
propia (`Tiradas de salvación:`, `Inmunidad a daño:`, `Inmunidad a estados:`…). El 5.2 usa **una
sola etiqueta por campo**, con los tipos de daño y los estados en la misma lista separados por
`;` (`Inmunidades: veneno; cansancio, envenenado`): lo de antes del `;` es daño y lo de después
estados, pero como hay criaturas que solo tienen estados (`Cieno gris`), el reparto se hace por
nombre contra la lista cerrada de estados, no por la posición. Las salvaciones del 5.2 no llevan
etiqueta: son la **tercera columna** de la tabla de características (`F 23 +6 +6`: puntuación,
modificador, salvación) y solo se publican cuando no coinciden con el modificador, que es cuando
la criatura tiene competencia; la del secuaz goblin se queda vacía, como en el SRD.

### objetos (`data/ed5x/objetos/*.md`)

```yaml
---
name: Botas de los elfos
type: Objeto maravilloso
rarity: poco común
attunement: false
srd: "5.1"
---
```

### equipo (`data/ed5x/equipo/*.md`)

```yaml
---
name: Cota de malla
category: Armadura      # Arma, Armadura, Herramienta, Equipo de aventurero, Montura, Vehículo, Mercancía
price: 75 po
weight: 25 kg
srd: "5.1"
---
```

### clases (`data/ed5x/clases/*.md`)

```yaml
---
name: Bárbaro
hitDie: d12
primaryAbility: Fuerza
saves: [Fuerza, Constitución]
skillChoices: Elige dos entre...
armor: armaduras ligeras y medias, escudos
weapons: armas simples y marciales
tools: ninguna
srd: "5.1"
---
```

Cuerpo: `## Rasgos de clase` (uno por `### Nombre (nivel N)`) y
`## Subclases` (`### Nombre`).

`primaryAbility` solo lleva valor cuando el SRD de esa edición lo declara: 5.2.1
lo trae en la caja «Característica principal» y 5.1 no lo dice en ningún sitio
(ni en el bloque de atributos ni en una sección de creación rápida), así que en
`data/ed51/clases/` la cadena va vacía. No se copia de la otra edición: sería
dato de 5.2.1 bajo una ficha que cita la página de 5.1, y la próxima
regeneración lo borraría. Por eso los listados descartan las columnas cuyas
celdas son todas el guion de relleno —también `category` en las dotes de 5.1 y
`feat` en los trasfondos, que tampoco existen en ese SRD— y
`tools/test/columnas.mjs` lo vigila.

#### La caja de atributos de 5.2 y los rótulos partidos

La caja «Atributos básicos de …» de 5.2 tiene dos columnas: el rótulo a la
izquierda y el valor a la derecha. El PDF parte los rótulos largos en dos
líneas («Competencias en» / «habilidades») y el flujo de texto las deja en la
misma línea base que el valor, así que `tools/ingest/srd/classes.py` tiene que
descartar esos restos antes de unir el valor. Si se cuelan y el valor viene
partido con guion, el rótulo se mete a media palabra: «Conocimiento
arhabilidades cano», «Investigahabilidades ción». El arreglo va en el parser de
clases (`BOX_FRAGMENTS`), no en `pdf_stream.py`: ese flujo es común a conjuros,
monstruos, objetos y reglas, y separar ahí las columnas cambiaría la extracción
de todo el sitio por un fallo de una caja.

`tools/verify/validar.py` vigila el resultado: cualquier palabra que lleve
«habilidades» pegada por delante o por detrás hace fallar la validación y
aparece con su fichero en `docs/informes/validacion.md`. Un cambio de
maquetación del PDF volvería a colarlo, y un valor pegado no se puede arreglar
solo con una regla de texto.

Estos cinco ficheros (`mago`, `hechicero`, `explorador`, `clérigo` y `brujo`)
se parchearon a mano en su día y no se regeneró la carpeta entera: el flujo de
`.cache/srd/work/e52.jsonl` se había reconstruido después de extraer `data/` y
arrastraba cambios de prosa ajenos a la tarea. La corrección del parser impide
que el fallo vuelva en la próxima regeneración; el parche de datos solo arregla
lo que ya está publicado.

#### Los cortes de palabra del maquetador

El PDF parte palabras con guion al final de la línea, y en el 5.2 el trozo que sobra viaja a otra
frase (`de he-` / `la lista de conjuros de bardo` / `chizar persona`, con la negrita abriéndose en
mitad de la palabra en `bulette`). Los escritores recomponen ahora la palabra al unir líneas
(`stream.paragraphs` y `spells._extract_props`, más `srd/pies.py` para el texto plano), y
`tools/verify/validar.py` —el paso 1 de `npm run verificar`— vigila las dos formas del corte,
guion a fin de línea y guion dentro de la palabra, más cinco frases testigo completas: un corte
nuevo tumba la puerta.

`conjuros` y `monstruos` se regeneran con `tools/ingest/extract_core.py` y salen limpios.
`objetos`, `clases` y `reglas` no: se generaron con versiones anteriores del pipeline que ya no
reproducen `data/` (volver a pasarlas cambia cientos de fichas por motivos que no son este
arreglo), así que lo publicado se repara con `tools/ingest/reparar_cortes.py`. Ese script quita el
pie de página que parte una palabra, une los cortes y escribe enteras las frases en las que el
trozo se fue a otro sitio —el texto correcto está copiado de `.cache/srd/work/es5x.txt`, que sí lo
conserva en orden—. Es idempotente y falla si una frase testigo no aparece donde debería. Se pasa
después de cualquier regeneración:

```bash
python3 tools/ingest/reparar_cortes.py            # repara data/
python3 tools/ingest/reparar_cortes.py --check    # solo cuenta, no escribe
```

#### El pie de página del PDF

El texto linealizado trae, al final de cada hoja, la línea legal del documento —«Documento de
referencia del sistema 5.1. 226», «Prohibida la reventa. Tienes permiso para imprimir o fotocopiar
este documento solo para uso personal.»— y a veces el número de página. El flujo por coordenadas ya
lo descartaba (`FOOTER_RE` e `is_footer` en `tools/ingest/linearize.py`), pero el capítulo de
objetos se extrae del **texto plano**, así que el pie viajaba con el objeto y se publicaba como
último párrafo de la descripción: 93 fichas lo llevaban, y en las que cayó a media frase la
descripción se quedó sin el final del texto (`anillo-de-almacenamiento-de-conjuros` acababa en «…y
los conserva hasta que el portador»).

`tools/ingest/srd/pies.py` limpia el texto antes de cortar los cuerpos (`sin_pies`, que llama
`items.plain_bodies`): quita el pie —también el que quedó pegado dentro de un párrafo—, quita el
número que lo precede y, si el pie había partido una frase, vuelve a unirla. Lo ya publicado se
arregló con `tools/ingest/reparar_pies.py`, que recompone cada ficha desde el texto del PDF (de la
cabecera del objeto al objeto siguiente) y, si el cuerpo tiene una tabla y no se puede recomponer
sin perderla, solo quita el pie (`quita_pies`). Antes de escribir comprueba que el texto nuevo está
literal en el PDF y que no se pierde ningún párrafo del viejo; si no se cumple, deja la ficha como
estaba y lo dice.

```bash
python3 tools/ingest/reparar_pies.py            # repara data/
python3 tools/ingest/reparar_pies.py --seco     # solo cuenta, no escribe
```

Lo vigila `tools/test/pies.py` (un paso de `npm run verificar`) con las líneas crudas del PDF, y el
paso 1 (`tools/verify/validar.py`, `pies_de_pagina()`) tumba la puerta si una ficha de `data/` vuelve
a publicar el pie.

### especies / trasfondos / dotes / reglas

```yaml
---
name: Enano
srd: "5.1"
---
```

Dotes: `category` (Origen, General, Estilo de combate, Épica), `prerequisite`.
Reglas: `category` (Combate, Exploración, Magia, Condiciones, Glosario…).

---

## Por qué Markdown, y por qué además hay JSON

Decisión: **el Markdown es la fuente; el JSON es un derivado que se genera en cada build.**

- Una entrada por fichero, con frontmatter YAML, es lo que permite revisar un cambio en un diff,
  corregir una errata a mano y saber qué licencia y qué página tiene cada texto. Un JSON único de
  2.502 entradas no se revisa.
- El cliente necesita otra cosa: para filtrar, comparar y buscar no puede leer 2.502 ficheros. Por
  eso existe un índice por edición en `src/pages/datos/[ed].json.ts`, generado en el mismo build,
  con nombre, slug, tipo, facetas y datos clave. Nada de eso se escribe a mano: se calcula desde
  los Markdown, así que no puede desincronizarse.
- Las facetas que se filtran y ordenan (`r`) van en número: el PX de un monstruo es un entero con
  el valor base de `xp`, no el texto del frontmatter — que se conserva en `d.xp` para mostrarlo
  tal cual.
- La faceta del tamaño (`f.tamano`) va agrupada, como en el filtro del listado: la forma canónica y,
  si la criatura admite dos, separadas con `|` («Mediano|Pequeño»). `d.tamano` conserva la palabra
  del SRD —«Mediana»— para enseñarla tal cual. La agrupación vive en `src/lib/tamano.ts` y la usan
  el listado y este JSON, así que las dos facetas no pueden divergir.
- Tamaño real del índice, que se genera en cada build:

  | Edición | Sin comprimir | Con gzip |
  |---|---|---|
  | 5e | 296 KB | 37 KB |
  | 5.5 | 316 KB | 38 KB |

  Cabe en una visita. `tools/test/cifras.py` vuelve a medir estos números desde
  `dist/datos/` en cada pasada, así que no pueden quedar atrás cuando crecen las
  fichas.

Regla: si un dato se puede derivar, se deriva. El JSON nunca es la fuente de la verdad.
