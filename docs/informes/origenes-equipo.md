# Extracción de orígenes y equipo (SRD 5.1 y 5.2.1)

Informe de la extracción de **especies/razas, trasfondos, dotes y equipo** desde los
flujos lineales de los dos SRD en español (`work/e51.jsonl`, `work/e52.jsonl`).

Fecha: 20 de octubre de 2026 · Generado por los scripts de `tools/ingest` (pipeline
`recon.py` + `build_5x_*.py`).

## Ficheros por carpeta y edición

| Carpeta | ed51 (SRD 5.1) | ed52 (SRD 5.2.1) |
| --- | ---: | ---: |
| `especies/` | 9 | 9 |
| `trasfondos/` | 1 | 4 |
| `dotes/` | 1 | 17 |
| `equipo/` | 213 | 188 |
| **Total nuevo** | **224** | **218** |

Sin cambios (no se han tocado): `conjuros/` 319 y 339, `monstruos/` 302 y 315.

### Desglose de `equipo/`

| Categoría | ed51 | ed52 |
| --- | ---: | ---: |
| Arma | 37 | 38 |
| Armadura (incluye escudo) | 13 | 13 |
| Herramienta | 35 | 22 |
| Equipo de aventurero | 99 | 89 |
| Montura | 8 | 11 |
| Vehículo | 19 | 14 |
| Mercancía (`mercancias.md`) | 1 | — |
| Gastos (`gastos.md`, sin categoría) | 1 | 1 |

Armas + armaduras: **50** en 5.1 y **51** en 5.2 (coincide con el número de filas de
las tablas «Armas» y «Armaduras» de cada PDF). Entradas con cuerpo de texto: 36 en 5.1
y 97 en 5.2 (el resto son objetos que el SRD solo lista en tabla, con `price` y
`weight` en el frontmatter y cuerpo vacío a propósito).

### Desglose de `dotes/`

- ed51: 1 dote (`Apresador`, sin categoría porque el SRD 5.1 no las clasifica).
- ed52: 4 de origen, 2 generales, 4 de estilo de combate, 7 de don épico (`Épica`).

## Verificación realizada

- Frontmatter YAML válido en los 432 ficheros nuevos; `name`, `srd` y `page` presentes;
  `page` numérica y `srd` igual a `5.1`/`5.2` según carpeta.
- Precios con el formato `N po|pp|pc` y pesos `N kg|g` (o vacío cuando el objeto no
  tiene peso, p. ej. la honda).
- Recuento de armas y armaduras contrastado con la tabla del PDF mediante `assert` en
  el propio script (37/13 en 5.1; 38/13 en 5.2): el script falla si no cuadra.
- Sin ficheros con nombre numérico (se eliminaron las 13 filas de la tabla de
  «Mercancías», que no son objetos) y sin duplicados `(name, category)`.
- Los dos objetos con nombre repetido en categorías distintas (`Bastón` arma y
  `Bastón` canalizador arcano) se resolvieron con el sufijo `-2` de `unique_path`.

## Discrepancias y lagunas

1. **Subrazas de 5.1 incompletas en el PDF.** El capítulo «Razas» solo desarrolla
   cuatro subrazas: *Alto elfo*, *Enano de las colinas*, *Piesligeros* y *Gnomo de las
   rocas*. No aparecen como apartado *Elfo de los bosques*, *Elfo oscuro*, *Enano de las
   montañas*, *Mediano fornido* ni *Gnomo de los bosques* (solo se citan en la tabla del
   conjuro *Reencarnar*). Se han extraído las que existen; las demás no se han inventado.
2. **5.1 trae un único trasfondo y una única dote.** El SRD 5.1 solo incluye `Acólito`
   y `Apresador` como ejemplos; el resto de trasfondos/dotes citados en el encargo
   (Charlatán, Criminal, Erudito, Soldado…) pertenecen a 5.2 y ahí están.
3. **Tablas de linaje de 5.2 no reconstruibles.** «Linajes élficos» (pág. 91), «Linaje
   gnomo» (pág. 91) y «Legados infernales» (pág. 93) llegan con las celdas de varias
   columnas intercaladas en una misma línea de texto, sin separadores que permitan
   reasignarlas: se han omitido (y el bloque ilegible del gnomo se ha recortado del
   cuerpo). La tabla «Ancestros dracónicos» sí era limpia y va como tabla Markdown en
   `ed52/especies/draconido.md`.
4. **«Comida, bebida y alojamiento» de 5.2** (pág. 110) tiene el mismo problema de
   celdas intercaladas; `ed52/equipo/gastos.md` conserva la tabla de niveles de vida y
   deja una nota indicando que esa tabla queda pendiente de revisión manual.
5. **Tabla de munición de 5.2** (pág. 106): las celdas Tipo/Cantidad/Recipiente llegan
   fundidas («Balas de 10 Bolsa arma de fuego»), así que no se han creado entradas de
   munición en esa edición (en 5.1 sí están: flechas, virotes, balas, dardos).
6. **Datos de tabla no guardados por falta de campo en el esquema**: daño y propiedades
   de las armas (5.1 y 5.2), columna Fuerza/Sigilo de las armaduras y propiedades de
   maestría de 5.2. El esquema de `docs/DATOS.md` solo admite `name`, `category`,
   `price`, `weight`, `srd` y `page`.
7. **Categorías forzadas por el esquema**: los arreos de montura (alforjas, bocado y
   bridas, alimento, estabulado, sillas, trineos) van como `Vehículo`, que es la
   categoría más cercana de las siete permitidas; las naves también.
8. **Monturas y vehículos sin `weight`**: las tablas del SRD dan capacidad de carga y
   velocidad, no peso del animal. Se dejó vacío antes que inventarlo.
9. **Corrección puntual en 5.1**: el párrafo `Linaje Infernal` del tiefling llega con la
   palabra «taumaturgia» al principio y «Conoces el truco» detrás; se ha reordenado a
   «Conoces el truco taumaturgia.» (única reescritura de todo el lote, documentada en el
   script).
10. **5.1 `Acólito`**: el bloque de competencias llega partido por el salto de columna
    («…Perspicacia,» + «Religión. Idiomas: …»); se han unido en un solo párrafo.

## Ejemplos

- `data/ed51/especies/gnomo.md` — raza con subraza `## Gnomo de las rocas`, `size` y
  `speed` en el frontmatter.
- `data/ed52/trasfondos/soldado.md` — trasfondo con `feat: Atacante salvaje` y
  `skills: Atletismo e Intimidación`.
- `data/ed52/equipo/herramientas-de-ladron.md` — herramienta con `price`, `weight` y
  cuerpo literal (`Característica`, `Utilizar`).
