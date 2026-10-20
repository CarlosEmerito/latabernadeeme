# Análisis de 5etools y plan para La Taberna de Eme

Documento de trabajo. No describe cambios ya hechos: es el estudio previo para decidir qué
merece la pena traer. Fecha: 20 de octubre de 2026.

---

## 1. Resumen ejecutivo

5etools es la mejor herramienta de consulta de quinta edición que existe, y lo es por tres cosas
que no se ven en la pantalla: **un modelo de datos plano y uniforme**, **un índice de búsqueda
construido en el cliente** y **una capa de enlaces cruzados que convierte cada mención en un
acceso**. La interfaz es fea y anticuada, pero el producto está resuelto.

Lo que se puede copiar sin riesgo: la arquitectura de datos, el modelo de enlaces, el estado en
URL, las herramientas de mesa y el etiquetado de fuentes. Lo que no se puede copiar: el
contenido cerrado (manuales, aventuras, arte) y el modelo legal, que en su caso es un aviso, no
una licencia.

La Taberna de Eme parte con ventaja en lo que ellos no tienen —español, licencia real,
accesibilidad y funcionamiento sin JavaScript— y con desventaja en lo que ellos llevan una década
puliendo: búsqueda, cruce de datos y utilidades de mesa.

---

## 2. Cómo está construido 5etools (verificado sobre el código)

### 2.1 Forma

- Sitio estático: HTML mínimo + JavaScript que pinta todo en el cliente.
- **175 módulos JS** en `js/`, uno por dominio (`bestiary.js`, `spells.js`, `items.js`,
  `classes.js`…) más un módulo de filtro por dominio (`filter-bestiary.js`, `filter-spells.js`…).
- Datos en `data/`, **un JSON por tipo de contenido**: `spells/`, `bestiary/`, `items/`,
  `class/`, `backgrounds.json`, `feats.json`, `conditionsdiseases.json`, `deities.json`,
  `tables.json`, `recipes.json`… 69 entradas de primer nivel en el directorio.
- Detalle importante: **separa mecánica de prosa**. Junto a `items/` hay `fluff-items.json`, junto
  a `races.json` hay `fluff-races.json`. La prosa de ambientación vive aparte de las reglas, de
  modo que la ficha puede mostrar la mecánica sin arrastrar el texto del manual.
- Cada fichero lleva un bloque `_meta` con la fuente (`PHB`, `XGE`…), la fecha de conversión y
  utilidades. La fuente es un dato de primer nivel, no un adorno: por eso pueden filtrar por libro.
- Rutas con estado en el hash (`#spells.html?level=3&class=Wizard`), lo que hace que **cualquier
  vista filtrada sea un enlace compartible** sin servidor.

### 2.2 Módulos que delatan funciones

Leídos del árbol del repositorio, no supuestos:

| Módulo | Qué resuelve |
|---|---|
| `omnidexer.js`, `omnisearch.js`, `search.js` | Índice global y buscador unificado por categorías |
| `filter.js` + `filter-*.js` | Lenguaje de filtros por dominio (rangos, listas, texto) |
| `list2.js` | Listados largos con virtualización y ordenación |
| `hist.js` | Historial y estado de la vista en la URL |
| `multisource.js` | Fusiona la misma entrada cuando aparece en varios libros |
| `render-*.js` (22 ficheros) | Un renderizador por tipo de contenido |
| `render-dice.js` | Dados clicables dentro del texto |
| `encounterbuilder.js`, `encountergen.js` | Constructor y generador de encuentros |
| `crcalculator.js` | Cálculo de VD de una criatura propia |
| `scalecreature.js` | Escalar un statblock (adulto → anciano, jefe → secuaz) |
| `initiativetracker/`, `inittrackerplayerview.js` | Orden de iniciativa y vista para jugadores |
| `dmscreen.js` | Pantalla del DM configurable por paneles |
| `lootgen.js` | Generación de botín por franja de nivel |
| `names.js`, `lifegen.js` | Nombres y trasfondo biográfico improvisado |
| `makecards.js` | Cartas imprimibles de conjuros y objetos |
| `decks.js`, `tables.js` | Barajas y tablas aleatorias del manual |
| `book.js`, `books.js`, `adventures.js` | Lector de libros y aventuras página a página |
| `quickreference.js` | Referencia rápida de reglas |
| `statgen.js` | Generación de características (tirada, compra, array) |
| `makebrew.js`, `managebrew.js` | Editor de contenido casero y su gestión |
| `blocklist.js` | Activar y desactivar fuentes de contenido |
| `plutonium.js`, `foundry/` | Exportación a Foundry VTT |
| `converter.js` | Conversión de material de 2014 a 2024 |
| `styleswitch.js` | Temas |

Esa lista es, en la práctica, el mapa de producto de una herramienta de mesa completa.

### 2.3 Lo que hace bien y lo que hace mal

Bien:

- Uniformidad: todas las entradas del mismo tipo se pintan con el mismo renderizador; añadir un
  monstruo es añadir un objeto JSON, no tocar plantillas.
- Enlazado: condiciones, conjuros, objetos y criaturas se referencian entre sí dentro del texto.
- Estado compartible: filtros y búsquedas viven en la URL.
- Cobertura: no solo el SRD; también manuales, aventuras y material de third parties.

Mal:

- **Sin licencia**: el aviso de «referencia para productos que ya tienes» no autoriza a
  distribuir el contenido del manual. Es un riesgo asumido, no un derecho.
- Render 100 % en cliente: sin JS no hay nada; el HTML servido no tiene contenido, lo que perjudica
  a buscadores, lectores de pantalla antiguos y conexiones lentas.
- Interfaz de 2016: densidad sin jerarquía, tipografía de sistema, contraste irregular.
- Jerga de claves visible en la URL y en los filtros (`cr`, `srd`, `sgt`), opaca para quien no es
  veterano.
- Solo inglés. La terminología oficial en español no existe en su ecosistema.

---

## 3. Inventario funcional, bloque a bloque

Para cada bloque: qué hace, qué tenemos, qué costaría y si es viable con nuestra licencia.

### A. Navegación y estructura

Ellos: un índice por fuente (PHB, DMG, MM…), lector de libros completo y listado de aventuras.

Nosotros: raíl por tipo de contenido, dos ediciones hermanas, sin fuentes múltiples (solo hay un
documento por edición, así que el eje «fuente» no aplica).

Veredicto: **no copiar el árbol por fuente**; ya tenemos el eje correcto (edición × tipo). Lo que
sí falta es un **índice temático dentro de reglas** (combate, exploración, interacción, equipo,
magia), porque hoy «Reglas» es una lista plana.

### B. Búsqueda

Ellos: buscador global con resultados agrupados por categoría, filtros y estado en URL.

Nosotros: Pagefind sobre el HTML generado, más filtros por columna en cada listado.

Lo que falta, por orden de rentabilidad:

1. **Alias en inglés**: «fireball» debe encontrar «Bola de fuego». Se resuelve con un diccionario
   ES→EN por entrada (o un campo `aliases` en el frontmatter) inyectado en el índice.
2. **Aceptar el término oficial sin tildes ni artículos**: «bola de fuego», «bola fuego», «fuego».
3. **Búsqueda con modificadores**: `tipo:monstruo vd:5`, `nivel:3 escuela:evocación`. Se puede
   hacer en cliente sobre un índice JSON pequeño, sin tocar Pagefind.
4. **Estado en URL**: hoy filtrar no cambia la dirección; no se puede mandar a alguien «los
   conjuros de nivel 3 de mago».

### C. Listados y filtros

Ellos: filtros múltiples por dominio (rango de VD, tipo, tamaño, fuente, entorno), ordenación por
cualquier columna y virtualización.

Nosotros: facetas de selección única, orden por columna en la tabla, todas las filas en el DOM.

Falta:

- **Facetas multi-selección** (escuela × nivel × clase a la vez). Es el salto de calidad más
  grande en la consulta y no exige cambiar los datos.
- **Rangos numéricos** en VD y nivel («de 5 a 10»), que hoy son listas de valores sueltos.
- **Filtros dependientes**: al elegir clase, que las escuelas se limiten a las que esa clase puede
  lanzar. Evita resultados vacíos.
- **Paginación o virtualización** por encima de ~400 filas: la lista de objetos mágicos ya son 760
  filas de HTML por página.

### D. Fichas y enlaces cruzados

Ellos: cada mención de una condición, conjuro u objeto es un enlace con tarjeta emergente; los
dados del texto se pueden tirar desde la ficha.

Nosotros: enlazamos conjuros dentro del texto (`enlazarConjuros`), pero no condiciones, ni
objetos, ni criaturas; no hay tarjetas emergentes ni dados clicables.

Esto es **lo que más diferencia una referencia de una base de datos**. Propuesta concreta:

- Un componente `Enlace` + `Tarjeta` que envuelva cualquier mención: el `<a>` funciona sin JS (va
  a la ficha) y con JS añade la tarjeta con los datos clave (tiempo, alcance, duración, daño).
- Un índice de menciones generado en build: para cada entrada, qué términos de otras entradas
  aparecen en su texto.
- Dados clicables solo si hay resultados razonables; si no, un botón «tirar» en la ficha.

### E. Herramientas de mesa

Ellos: constructor de encuentros con presupuesto de PX, generador de encuentros, iniciativa con
vista de jugador, pantalla del DM, botín, nombres, cartas imprimibles.

Nosotros: una página «Mesa» con cuatro paneles rudimentarios (presupuesto de PX, iniciativa,
dados, PNJ, botín) en una sola columna.

Falta y merece la pena:

- **Encuentros de verdad**: elegir criaturas por VD y ver el presupuesto consumido en vivo, con
  multiplicador por número de enemigos y aviso de «mortal».
- **Iniciativa con vista de jugador**: una segunda ventana limpia para proyectar en la mesa.
- **Pantalla del DM**: panel configurable con condiciones, acciones comunes, cobertura y viaje.
- **Cartas imprimibles**: conjuros de tu clase en tarjetas de 63×88 mm, con la maqueta ya resuelta
  para impresión.

### F. Creación y modificación

Ellos: calculadora de VD, escalado de criaturas, generador de características, editor de contenido
casero.

Nosotros: nada de esto.

Prioridad baja, salvo **escalar una criatura**, que es lo que un DM hace en mitad de la sesión y
lo que convierte la web en herramienta y no en libro.

### G. Exportación

Ellos: exportación a Foundry (Plutonium), a Roll20 y JSON crudo.

Nosotros: imprimir.

Falta barato y útil: **copiar el statblock en Markdown** y **descargar JSON de una entrada**, que
es lo que necesita quien prepara la sesión en Obsidian o Notion.

### H. Accesibilidad, móvil y rendimiento

Ellos: tablas que se arrastran en horizontal en móvil, contraste irregular, foco visible a medias.

Nosotros: axe sin violaciones, foco visible, sin JS para leer, contraste calculado.

Aquí no hay nada que copiar y sí mucho que defender: es nuestro diferencial y hay que mantenerlo
cuando lleguen las islas de JavaScript.

---

## 4. Comparativa de estado

| Capacidad | 5etools | La Taberna de Eme | Distancia |
|---|---|---|---|
| Contenido del SRD completo en español | — | Sí, 2.457 entradas | Ventaja nuestra |
| Contenido de manuales y aventuras | Sí | No (ni se puede) | Legal, no técnica |
| Dos ediciones conviviendo | Parcial (dos sitios) | Sí, hermanas en el mismo sitio | Ventaja nuestra |
| Búsqueda global | Índice propio en cliente | Pagefind | Equiparable |
| Alias en inglés | N/A | No | Falta |
| Filtros multi-selección | Sí | No | Falta |
| Rangos numéricos (VD, nivel) | Sí | No | Falta |
| Estado en URL | Sí | No | Falta |
| Enlaces cruzados con tarjeta | Sí | Parcial (solo conjuros) | Falta |
| Dados clicables en el texto | Sí | No | Falta |
| Constructor de encuentros | Sí, completo | Presupuesto aproximado | Falta |
| Iniciativa con vista de jugador | Sí | Lista simple | Falta |
| Escalado de criaturas | Sí | No | Falta |
| Cartas imprimibles | Sí | No | Falta |
| Exportar (JSON / Markdown) | Sí (Foundry, JSON) | Imprimir | Falta |
| Funciona sin JS | No | Sí | Ventaja nuestra |
| Accesibilidad AA | No | Sí | Ventaja nuestra |

---

## 5. Qué falta, priorizado

Criterio: impacto en mesa real ÷ esfuerzo, y que no rompa lo que ya funciona.

### Nivel 1 — lo que cambia el producto (3–4 jornadas)

1. **Facetas multi-selección y rangos** en conjuros, monstruos y objetos.
2. **Estado en URL** para listados y búsqueda (compartir una vista filtrada).
3. **Alias ES→EN** en el índice de búsqueda.
4. **Enlaces cruzados con tarjeta** para conjuros, condiciones y objetos.

### Nivel 2 — herramientas de mesa (4–6 jornadas)

5. **Constructor de encuentros** con criaturas reales del catálogo y presupuesto vivo.
6. **Iniciativa con vista de jugador** (segunda ventana).
7. **Cartas imprimibles** de conjuros por clase.
8. **Copiar/descargar** statblock en Markdown y JSON.

### Nivel 3 — profundidad (6–8 jornadas)

9. **Escalado de criaturas** y calculadora de VD.
10. **Pantalla del DM** configurable.
11. **Índice temático de reglas** con anclas y buscador interno.
12. **Diferencial 2014 / 2024**: la misma entrada en las dos ediciones, lado a lado, con lo que
    cambió resaltado. Esto no lo tiene 5etools y es nuestro hueco más claro.

---

## 6. Cómo lo incluiríamos (arquitectura)

### 6.1 Principios

- **El HTML sigue siendo el producto**: todo lo que se pueda leer sin JS, se lee sin JS. Las
  mejoras se añaden encima.
- **Un índice derivado, generado en build**: un JSON por edición con nombre, tipo, slug, alias,
  facetas y menciones. Se genera desde los Markdown, no se mantiene a mano.
- **Un componente, no veinte**: `Tarjeta` y `Filtro` se escriben una vez y se usan en todos los
  tipos.
- **Nada de duplicar contenido**: la tarjeta emergente lee del mismo índice que el listado.

### 6.2 Piezas

1. **`indice.json`** por edición: `{slug, tipo, nombre, alias[], facetas{}, refs[]}`. Es el
   contrato entre datos y cliente. Tamaño estimado: ~1,5 MB sin comprimir, ~250 KB con gzip;
   aceptable si se carga solo en los listados.
2. **`Filtro`** declarativo: cada listado declara sus facetas (tipo `lista`, `rango` o `texto`) y
   el componente se encarga de render, estado, URL y accesibilidad. Sin JS, sigue siendo un
   `<form method="get">` que filtra en servidor… salvo que en estático no hay servidor: la salida
   sin JS sería un listado completo con anclas por valor (`#nivel-3`), como ya hacemos hoy.
3. **`Enlace`**: `<a href>` + `<span class="tarjeta">` oculta; CSS la muestra al foco y al hover,
   JS la posiciona. Accesible por teclado sin JS.
4. **Islas de mesa**: cada herramienta es un componente aislado que se hidrata solo si existe en
   la página. Encuentros e iniciativa no comparten estado con el catálogo salvo el índice.
5. **Exportación**: función pura `entradaAMarkdown()` y `entradaAJSON()`; botón de copiar y de
   descargar. Sin dependencias.

### 6.3 Riesgos técnicos

- **Peso del índice**: si crece por encima de ~2 MB, partirlo por tipo y cargarlo bajo demanda.
- **Duplicar la lógica de filtrado** entre servidor (estático) y cliente: hay que decidir una sola
  fuente de verdad para las facetas y generar el HTML inicial con ella.
- **Trampa de la tarjeta emergente**: si se implementa solo con JS, se pierde el funcionamiento sin
  script y el foco de teclado. Debe ser un `<a>` con contenido oculto, no un `div` con `onmouseover`.
- **Pagefind y el estado en URL**: el buscador actual no acepta parámetros; para enlazar búsquedas
  hay que leer `?q=` al cargar y pasarlo a la instancia de Pagefind.

---

## 7. Qué no copiar

- **El modelo legal**: su aviso no es una licencia. Nuestra atribución CC BY 4.0 sí lo es y hay que
  mantenerla visible.
- **Contenido cerrado**: manuales, aventuras, arte, nombres propios de ambientación. Aunque su web
  los tenga, no son copiables.
- **Render 100 % en cliente**: perdemos SEO, lectura sin JS y accesibilidad.
- **Jerga de claves en la interfaz**: `cr`, `srd`, `sgt` se quedan en el código; la interfaz habla
  castellano.
- **Densidad sin jerarquía**: su tabla es más compacta que la nuestra, pero también más difícil de
  leer. Nuestro punto medio actual es mejor; no conviene endurecerlo más.

---

## 8. Diferenciadores que ya tenemos y hay que proteger

1. **Español con terminología oficial**, no traducción automática.
2. **Licencia real y verificable**, con fuente y página en cada ficha.
3. **Funciona sin JavaScript** para leer y filtrar.
4. **Accesibilidad AA** medida con axe en claro y oscuro.
5. **Las dos ediciones en el mismo sitio**, con su propio vocabulario («razas» / «especies»).

Y uno que no tiene nadie: **la comparación 2014 ↔ 2024 de la misma entrada**.

---

## 9. Plan por fases

### Fase 1 — Consulta seria (Nivel 1)

- Facetas multi-selección, rangos y estado en URL.
- Alias ES→EN en el buscador.
- Tarjetas emergentes en conjuros, condiciones y objetos.
- Pruebas: sin JS el listado sigue completo; axe limpio; una URL filtrada se comparte y reproduce.

### Fase 2 — Mesa

- Constructor de encuentros con criaturas del catálogo.
- Iniciativa con vista de jugador.
- Cartas imprimibles y exportación Markdown/JSON.
- Pruebas: presupuesto correcto contra la tabla del SRD; impresión sin cortes; vista de jugador
  sin datos del DM.

### Fase 3 — Profundidad

- Escalado de criaturas y calculadora de VD.
- Pantalla del DM.
- Índice temático de reglas.

### Fase 4 — El diferencial

- Comparador 2014 / 2024 por entrada, con las diferencias resaltadas y un índice de «qué cambió».

---

## 10. Decisiones que hacen falta

1. ¿Priorizamos la consulta (fase 1) o la mesa (fase 2)? Mi recomendación: fase 1, porque mejora
   el 100 % de las visitas, no solo las de partida.
2. ¿Las tarjetas emergentes pueden cargar un índice de ~250 KB en los listados? Si no, se limitan a
   las fichas.
3. ¿El comparador 2014/2024 va antes o después de las herramientas de mesa? Es lo único que ningún
   competidor tiene.
4. ¿Aceptamos que el buscador siga siendo Pagefind (sin sintaxis) y añadimos modificadores solo en
   los listados?
