# Informe: extracción de objetos mágicos (SRD 5.1 y 5.2)

Fecha: 2026-10-20 · Herramienta: `tools/ingest/extract_items.py` (+ `tools/ingest/srd/items.py`)
Fuente: flujos `e51.jsonl` / `e52.jsonl` (coordenadas) y `es51.txt` / `es52.txt` (texto plano).

## Recuento

| Edición | Ficheros `.md` | Entradas detectadas | Líneas de tipo (censo) | Tipo partido en 2 líneas |
|---------|----------------|---------------------|------------------------|--------------------------|
| 5.1     | 240            | 240                 | 236                    | 4                        |
| 5.2     | 258            | 258                 | 245                    | 13                       |
| **Total** | **498**      | **498**             | 481                    | 17                       |

Rutas: `data/ed51/objetos/` (240) y `data/ed52/objetos/` (258).

### Cómo se ha contado (tres métodos independientes)

1. **Anclaje por línea de tipo** (el método de extracción): el nombre es la línea
   inmediatamente anterior a una línea de tipo
   (`Objeto maravilloso, raro (requiere sintonización)`, `Arma (espada larga), muy
   rara…`, `Anillo, legendario…`); el cuerpo va desde la línea siguiente al tipo
   hasta la línea anterior al nombre siguiente. 240 y 258 entradas.
2. **Censo de líneas de tipo en todo el PDF**, sin usar tamaños de fuente: se
   busca el patrón «prefijo de categoría + coma + rareza» en las 40 205 / 40 827
   líneas extraídas. Resultado: **236** líneas en 5.1 (222-272) y **245** en 5.2
   (228-277). La diferencia con el parser son exactamente las entradas cuyo tipo
   viene partido en dos líneas («…raro (requiere» + «sintonización)»), que el
   parser vuelve a unir: 4 en 5.1 y 13 en 5.2.
3. **Cabeceras en el texto plano** (`es51.txt` / `es52.txt`): 238 + 1 artefacto
   en 5.1 y 255 + 3 que el texto plano fusiona con el párrafo anterior (Anillo de
   protección, de regeneración y de resistencia) en 5.2.

Comprobación inversa: de todas las líneas de tipo del PDF (236 y 245), **ninguna**
queda sin una línea a tamaño de nombre justo delante (0 huérfanas), así que el
anclaje no se deja entradas fuera.

Los tres métodos convergen en **240** y **258**.

## Discrepancias y decisiones

- **No hay ~499 ni ~760 objetos en estos SRD.** El capítulo completo de objetos
  mágicos ocupa 50 páginas por edición (5.1: 222-271 + artefactos 272-274; 5.2:
  228-277) y contiene 236 / 245 líneas de tipo en total. No existen más entradas
  en el documento: el censo recorre el PDF entero, no solo el capítulo.
  Lo que sí hay son **variantes dentro de una misma entrada**, que no generan
  fichero propio: Pociones de curación (4), Piedra Ioun (14 piedras),
  Estatuilla de poder maravilloso (8 figurillas), Baraja misteriosa (13/22
  cartas), Cubo de fuerza (6 caras), Bolsa de trucos (3 colores)…
- **Artefactos (solo 5.1):** el listado A-Z termina en «Yelmo de teletransporte»
  (p271); después hay una sección «Artefactos» (p272) con una entrada,
  *Orbe de los Dragones*, que se incluye porque es un objeto mágico con línea de
  tipo (`Objeto maravilloso, artefacto (requiere sintonización)`). En 5.2 ese
  mismo objeto ya está dentro del listado A-Z, así que las dos ediciones quedan
  alineadas.
- **Cuerpos de más de 4000 caracteres (4 por edición).** No son cortes
  defectuosos: son entradas realmente largas y su cuerpo coincide exactamente con
  el tramo entre su cabecera y la siguiente en el texto del SRD.
  - 5.1: *Baraja de múltiples cosas* (7841, 58 párrafos, 22 cartas + avatar de la
    muerte), *Estatuilla de poder maravilloso* (6118, 67 párrafos, 8 figurillas
    con bloque de características), *Varita de las maravillas* (4643, tabla de
    1d100), *Piedra Ioun* (4562, 14 piedras).
  - 5.2: *Baraja misteriosa* (8440), *Estatuilla de poder maravilloso* (6115),
    *Varita de las maravillas* (5376), *Piedra Ioun* (4466).
  El resto de cuerpos va de 61 a ~3900 caracteres.
- **Cero entradas descartadas:** el parser no ha dejado ninguna entrada sin
  cuerpo ni sin nombre (`orphans = 0` en ambas ediciones).
- **Sin duplicados de nombre** dentro de una edición, así que no ha hecho falta
  el campo `variant` ni `unique_path` (está implementado y se activa si aparece
  una colisión).
- **Tablas:** 31 entradas en 5.1 y 44 en 5.2 contienen tablas. En esas entradas
  el cuerpo se toma del flujo por coordenadas, que conserva las filas celda a
  celda (`Poción de curación 2d4 + 2 Común`); en el texto plano las columnas
  salen desordenadas. En el resto (209 y 214 entradas) el cuerpo viene del texto
  plano, donde las cursivas (nombres de conjuros) conservan su posición; el flujo
  por coordenadas las empuja al final de la línea.
- **Sin HTML** en los cuerpos. Rarezas normalizadas al vocabulario del esquema:
  «infrecuente» → `poco común`, «rareza variable / según estatuilla» → `varía`.

## Verificación automática

- 240 + 258 ficheros con frontmatter válido (`name`, `type`, `rarity`,
  `attunement` booleano, `srd`, `page` entero); 0 problemas.
- Ningún cuerpo vacío; ninguno por debajo de 61 caracteres.
- Primer párrafo de cada fichero localizado literalmente en el texto del SRD:
  238/240 en 5.1 y 258/258 en 5.2. Los 2 restantes son entradas con tabla, cuyo
  cuerpo procede del flujo por coordenadas (las tablas).
- Reparto de rarezas — 5.1: común 1, poco común 70, raro 80, muy raro 48,
  legendario 27, varía 13, artefacto 1. 5.2: común 2, poco común 73, raro 83,
  muy raro 55, legendario 32, varía 12, artefacto 1.
- Sintonización: 124 objetos en 5.1 y 133 en 5.2.

## Cinco ejemplos

| Nombre | Ruta |
|--------|------|
| Abanico del viento | `data/ed51/objetos/abanico-del-viento.md` |
| Armadura demoníaca | `data/ed51/objetos/armadura-demoniaca.md` |
| Orbe de los Dragones | `data/ed51/objetos/orbe-de-los-dragones.md` |
| Pociones de curación | `data/ed52/objetos/pociones-de-curacion.md` |
| Varita de atadura | `data/ed52/objetos/varita-de-atadura.md` |

## Repaso de fidelidad (20 de octubre)

Comprobación independiente: para cada fichero se normaliza el cuerpo, se toman
sus primeros 70 caracteres y se busca esa cadena en el texto del PDF.

- Primera pasada: 231/240 en 5.1 y 206/258 en 5.2. Los fallos eran de tres
  tipos: cursivas del original recolocadas por el maquetador («Un *pergamino de
  conjuro* contiene…» quedaba como «Un contiene…»), cuerpos truncados y pies de
  página dentro del texto.
- `tools/ingest/reparar_objetos.py` detecta esos casos y recompone el cuerpo
  desde el texto plano página a página.
- Resultado final: **240/240 (100 %) en 5.1 y 258/258 (100 %) en 5.2**.

Ese script queda en el repositorio y se puede volver a ejecutar tras cualquier
recambio de los flujos.
