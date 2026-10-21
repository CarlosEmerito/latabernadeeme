# Extracción de reglas y estados

Reglas y estados de los dos SRD en español (`data/ed51/reglas/`, `data/ed52/reglas/`),
extraídos del PDF con `tools/ingest/import_rules.py` y el lector
`tools/ingest/srd/rules.py`.

## Cifras

| Edición | Entradas | Palabras | Con tabla | Páginas de origen |
|---|---|---|---|---|
| SRD 5.1 | 44 | 30 516 | 9 | 79-110, 209-220, 389-390 |
| SRD 5.2.1 | 174 | 34 005 | 20 | 5-20, 194-210, 211-222 |
| **Total** | **218** | **64 521** | **29** | |

### SRD 5.1 por categoría

| Categoría | Entradas |
|---|---|
| Condiciones | 16 |
| Combate | 8 |
| Características | 7 |
| Peligros | 4 |
| Exploración | 3 |
| Magia | 3 |
| Descanso | 2 |
| Equipo | 1 |

### SRD 5.2.1 por categoría

| Categoría | Entradas |
|---|---|
| Glosario | 142 |
| Condiciones | 15 |
| Peligros | 5 |
| Combate | 4 |
| Características | 3 |
| Exploración | 2 |
| Social | 2 |
| Básico | 1 |

Las 15 condiciones del 5.2.1 son las voces del glosario etiquetadas `[estado]`
(agarrado, apresado, asustado, aturdido, cansancio, cegado, derribado,
ensordecido, envenenado, hechizado, incapacitado, inconsciente, invisible,
paralizado y petrificado); el resto del glosario queda como `Glosario`.

## Cobertura

Se comparó, línea a línea, el texto de las páginas de origen con el de los
ficheros generados: no hay ninguna página con más de un 12 % de líneas sin
correspondencia en la salida (el umbral salta solo por los guiones de partición,
que se recomponen al unir líneas). Las palabras del origen que "faltan" son
fragmentos de palabra partida (`caracterís` / `tica`), ya unidos en el texto.

## Qué se ha dejado fuera

- **SRD 5.1, "Listas de conjuros" (págs. 111-119).** Son las listas de conjuros
  por clase, no una regla; su información ya está en `data/ed51/conjuros/`
  (`classes`).
- **SRD 5.1, "Descripciones de conjuros" (120-208), "Objetos mágicos" (221-273)
  y "Monstruos" (274-388).** Fuera del alcance: ya viven en `conjuros/`,
  `objetos/` y `monstruos/`. La entrada "Venenos" cierra en la página 220 con un
  fin de tramo explícito para no arrastrarlos.
- **SRD 5.2.1, "Cómo jugar" y "Herramientas del juego".** Son títulos de
  capítulo sin texto propio: no generan fichero (sus subapartados sí).
- **SRD 5.2.1, "Creación de personajes", "Clases", "Orígenes de personaje",
  "Dotes", "Equipo", "Conjuros", "Objetos mágicos" y "Monstruos".** Fuera del
  alcance, igual que en el 5.1.
- **SRD 5.1, "Combate" y "Aventuras".** Los rótulos de capítulo no existen como
  texto en el PDF (son imagen); las entradas cuelgan de sus subapartados
  ("Tiempo", "Movimiento", "Estructura de un combate"...).

## Entradas revisadas a mano

El PDF tiene las cajas de las palabras corruptas (la altura de la mayoría no
corresponde al cuerpo de la fuente), así que la geometría de las tablas solo es
fiable a nivel de palabra. La extracción resuelve 23 de las 29 tablas sin
intervención; estas seis se han revisado a mano:

- `data/ed51/reglas/cansancio.md` — el cuadro de cansancio salía como tabla de
  prosa; queda como párrafo + tabla "Nivel / Efecto".
- `data/ed52/reglas/convenciones-del-glosario.md` — la lista de abreviaturas
  venía en dos parejas por fila con la primera mal fundida; queda como tabla de
  dos columnas con las 33 abreviaturas.
- `data/ed52/reglas/miedo-y-estres-psicologico.md` — dos tablas de ejemplo con
  las celdas troceadas por línea.
- `data/ed52/reglas/combate.md` — tabla de cobertura ("Tres cuartos",
  "Completa" partidas en dos filas).
- `data/ed52/reglas/encuentros-de-combate.md` — cabecera agrupada
  ("——— Dificultad del encuentro ———").
- `data/ed52/reglas/estudiar.md` — "Conocimiento arcano" partido por un guion
  blando.

Las dos primeras se reaplican solas al regenerar (`tools/ingest/reglas_postfix.py`,
idempotente); las otras cuatro ya las resuelve el algoritmo con las reglas de
fusión de celdas. Las listas de palabras sueltas de algunas voces del glosario
("Atacar Esconderse Preparar una Ayudar…") son así en el original: son
diagramas de palabras, no texto corrido, y se han dejado literales.

## Muestras

- `data/ed51/reglas/ventaja-y-desventaja.md`
- `data/ed51/reglas/trampas.md`
- `data/ed52/reglas/derribado.md`

## Notas

- El SRD 5.2.1 titula "Competencia" tanto el apartado de "Cómo jugar" como la
  voz del glosario: la segunda queda como `competencia-2.md`, el mismo criterio
  que deja convivir "Bastón" arma con "Bastón" canalizador arcano en equipo. Un
  nombre puede repetirse si la categoría lo separa; `validar.py` solo suspende la
  pasada cuando dos fichas de la misma carpeta y la misma categoría comparten
  nombre.
- `tools/verify/validar.py` da las dos carpetas como OK (44 y 174 entradas) y el
  sitio compila con las 218 fichas nuevas (`npm run build`).
- Para regenerar solo las reglas: `npm run datos:reglas`.

## Reproducir

```sh
# pdftohtml -xml de cada SRD, en la caché de trabajo
pdftohtml -xml -stdout .cache/srd/srd-5.1-es.pdf > .cache/srd/work/es51.xml
pdftohtml -xml -stdout .cache/srd/srd-5.2.1-es.pdf > .cache/srd/work/es52.xml

.venv-ingest/bin/python tools/ingest/import_rules.py          # las dos ediciones
.venv-ingest/bin/python tools/ingest/import_rules.py ed52     # solo una
```
