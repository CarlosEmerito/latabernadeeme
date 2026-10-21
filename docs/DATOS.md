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
  2.490 entradas no se revisa.
- El cliente necesita otra cosa: para filtrar, comparar y buscar no puede leer 2.490 ficheros. Por
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
  | 5e | 293 KB | 37 KB |
  | 5.5 | 313 KB | 38 KB |

  Cabe en una visita. `tools/test/cifras.py` vuelve a medir estos números desde
  `dist/datos/` en cada pasada, así que no pueden quedar atrás cuando crecen las
  fichas.

Regla: si un dato se puede derivar, se deriva. El JSON nunca es la fuente de la verdad.
