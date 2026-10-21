# Extracción de clases (SRD 5.1 y 5.2)

Generado con `tools/ingest/srd/classes.py` a partir de los flujos
`e51.jsonl` / `e52.jsonl`. Un fichero Markdown por clase y edición, con el
esquema de `docs/DATOS.md`.

```
.venv-ingest/bin/python tools/ingest/srd/classes.py            # ambas ediciones
.venv-ingest/bin/python tools/ingest/srd/classes.py --ed 51    # solo 5.1
```

## Verificación

```
$ cd data/ed51/clases && ls | wc -l     → 12
$ cd data/ed52/clases && ls | wc -l     → 12
```

Comprobado además, fichero a fichero: 20 filas `| N |` en cada tabla de
progresión, un `## Subclases` con al menos una subclase en las 24 clases y
todos los rasgos con su nivel en el encabezado. `data/*/conjuros` y
`data/*/monstruos` no se han modificado (319/317 y 339/330 ficheros).

## Recuento

| Edición | Ficheros | Tablas de 20 niveles | Subclases |
|---|---|---|---|
| 5.1 (`data/ed51/clases/`) | 12 | 12/12 | 1 por clase (12) |
| 5.2 (`data/ed52/clases/`) | 12 | 12/12 | 1 por clase (12) |

Clases: Bárbaro, Bardo, Brujo, Clérigo, Druida, Explorador, Guerrero,
Hechicero, Mago, Monje, Paladín, Pícaro.

Subclases extraídas: Senda del Berserker, Colegio del Conocimiento, El
Infernal, Dominio de la Vida, Círculo de la Tierra, Cazador, Campeón, Linaje
Dracónico, Escuela de Evocación, Camino de la Mano Abierta, Juramento de
Entrega, Ladrón (5.1); senda del berserker, colegio del conocimiento,
patrón infernal, dominio de la vida, círculo de la tierra, cazador, campeón,
hechicería dracónica, evocador, guerrero de la mano abierta, juramento de
entrega, ladrón (5.2).

## Estructura de cada fichero

- Frontmatter: `name`, `hitDie`, `primaryAbility`, `saves`, `skillChoices`,
  `armor`, `weapons`, `tools`, `srd`, `page`.
- `## Atributos básicos`: dados de golpe, competencias (armadura, armas,
  herramientas, tiradas de salvación, habilidades) y equipo inicial.
- `## Progresión`: tabla Markdown de 20 filas reconstruida de las líneas del
  PDF.
- `## Rasgos de clase`: un `### Nombre (nivel N)` por rasgo, con su texto
  literal y sus apartados internos como `####`.
- `## Subclases`: un `### Nombre` por subclase y sus rasgos como
  `#### Nombre (nivel N)`.
- Secciones propias cuando el SRD las trae: `## Cómo convertirse en …`
  (5.2), `## Invocaciones Sobrenaturales` (brujo 5.1), `## Opciones de
  invocación sobrenatural` (brujo 5.2), `## Opciones de metamagia`
  (hechicero 5.2), `## Patrones sobrenaturales`, `## Arquetipos …`,
  `## Juramentos sagrados`, etc.

## Incidencias y decisiones

1. **`primaryAbility` vacío en 5.1.** El SRD 5.1 no declara la
   característica principal en el bloque de atributos (solo dados de golpe,
   competencias y equipo), así que el campo queda como cadena vacía en las
   12 clases de 5.1. En 5.2 se rellena desde la caja «Característica
   principal». Como el listado no publica una columna cuyos valores son todos el
   guion de relleno, `/5e/clases/` sale con Nombre y Dado y la columna aparece
   solo en 5.2.1; lo vigila `tools/test/columnas.mjs`.
2. **Tablas de 5.1 partidas en dos o tres paneles.** El flujo trae la tabla
   de progresión troceada por columnas (p. ej. Bárbaro niveles 1-7 en la
   primera columna y 8-20 en la segunda; los espacios de conjuro en un panel
   aparte). Se reconstruyen emparejando filas por altura y, cuando el panel
   viene partido, por índice. Las 12 tablas tienen 20 filas y las columnas
   extra (n.º de furias, daño por furia, trucos/conjuros conocidos, espacios
   de conjuro 1-9, puntos de ki, artes marciales, movimiento sin armadura,
   ataque furtivo, puntos de hechicería) cuadran con la progresión conocida.
   La fila 20 del bárbaro («Campeón Primordial / Ilimitadas / +4») y la 2 del
   paladín («…, Castigo Divino») venían desordenadas en el PDF y se han
   fijado a mano en `SPEC51`.
3. **Tablas de 5.2: solo Nivel / Bonificador / Rasgos.** En 5.2 la tabla se
   imprime en tres paneles con los encabezados solapados y las celdas
   cortadas a mitad de palabra; las columnas auxiliares (espacios de conjuro,
   maestrías con armas, furias, puntos de concentración) no se pueden
   reconstruir con seguridad. Se emite la tabla que sí se verifica —nivel,
   bonificador por competencia y rasgos— y la columna de rasgos se completa
   con los encabezados «Nivel N: …» del propio capítulo (son los mismos
   datos; algunas filas del PDF venían truncadas).
4. **Listas de conjuros de clase (5.2).** Las secciones «Lista de conjuros de
   …» se omiten: duplican `data/ed5x/conjuros/`.
5. **Encabezados partidos.** Varios títulos del PDF ocupan dos líneas
   («Canalizar Divinidad: Expulsar Muertos» + «Vivientes», «Subclase de
   clérigo: Dominio» + «de la Vida», «Opciones de invocación» +
   «sobrenatural»); se unen al construir el árbol de secciones.
6. **Mayúsculas.** Se respeta el original: 5.1 titula los rasgos con
   mayúsculas («Defensa sin Armadura») y 5.2 en minúscula («Defensa sin
   armadura»).
7. **Ligadura «Amas».** El PDF entrega `Amas sencillas` en varias clases
   (ligadura `Ar`); se corrige a `Armas sencillas` al escribir el texto.
8. **Cuadro de texto del mago (5.1).** El recuadro «Ampliar y sustituir un
   libro de conjuros» llega en una caja estrecha de dos columnas y queda
   troceado en líneas sueltas; el texto está completo, pero los saltos de
   párrafo son ruidosos.
9. **Equipo del monje (5.1).** La lista de equipo arrastraba el principio del
   rasgo «Artes Marciales»; se recoloca en su rasgo.
10. **`data/` regenerado por error.** Las carpetas `clases/` se borraron al
    regenerar conjuros y monstruos; se han vuelto a escribir. No se ha tocado
    `data/*/conjuros` ni `data/*/monstruos`.

## Ficheros de ejemplo

- `data/ed51/clases/barbaro.md` — 20 niveles, dos columnas extra (furias y
  daño por furia) y subclase con 4 rasgos.
- `data/ed52/clases/monje.md` — tabla de 5.2 completada desde los encabezados
  «Nivel N: …» y subclase con 4 rasgos.
- `data/ed51/clases/brujo.md` — incluye la lista completa de invocaciones
  sobrenaturales como sección propia.
