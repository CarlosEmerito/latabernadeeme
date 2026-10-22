# Plan: convertir La Taberna de Eme en un 5etools en español

Documento de decisión. **No se ha modificado nada del sitio.** Fecha: 20 de octubre de 2026.

---

## 0. Qué se está decidiendo, en una frase

Hoy el sitio publica contenido **licenciado** (SRD 5.1 y 5.2.1 bajo CC BY 4.0): se puede copiar,
modificar y hasta vender, con atribución. El giro propuesto consiste en publicar **el texto de los
manuales**, que no está licenciado para eso. No es un cambio de alcance: es un cambio de régimen
jurídico. Todo lo demás de este documento (arquitectura, pipeline, fases) es consecuencia de eso.

---

## 1. De dónde saca 5etools la información (verificado sobre el repositorio)

### 1.1 Lo que hay dentro

| Dato | Medida |
|---|---|
| Repositorio de código y datos | `5etools-mirror-3/5etools-src`, 147 MB |
| Ficheros JSON en `data/` | 519 |
| Peso de `data/` | 114,9 MB |
| Bestiario | 212 ficheros |
| Aventuras | 101 ficheros |
| Libros | 67 ficheros (`book-*.json`, 29–507 KB cada uno) |
| Conjuros | 32 ficheros |
| Clases | 33 ficheros |
| Imágenes | repositorio aparte, **6,8 GB** |
| Licencia del repositorio | MIT |

Dos cosas que llaman la atención:

1. **El repositorio original ya no existe.** `TheGiddyLimit/5etools-src` devuelve 404. Lo que queda
   son espejos de la comunidad. Eso no es un detalle: indica que el proyecto ha sido retirado al
   menos una vez y que su continuidad depende de copias.
2. **La licencia MIT cubre el código, no los datos.** Nadie ha licenciado el texto de los manuales;
   el MIT del repositorio no lo alcanza porque el proyecto no es titular de ese contenido.

### 1.2 Cómo se produce el dato

El formato lo delata. Un conjuro en `data/spells/spells-phb.json`:

```json
{
  "name": "Acid Splash", "source": "PHB", "page": 211,
  "srd": true, "basicRules": true,
  "reprintedAs": ["Acid Splash|XPHB"],
  "level": 0, "school": "C",
  "entries": ["You hurl a bubble of acid..."]
}
```

De ahí se deduce el flujo:

- **Transcripción manual desde el libro.** Cada entrada lleva `source` (PHB, XGE, TCE…) y `page`.
  Es trabajo voluntario: alguien lee el manual y teclea el texto en JSON.
- **Separación mecánica / prosa.** `items/` y `fluff-items.json`, `races.json` y `fluff-races.json`.
  La prosa de ambientación viaja aparte de las reglas.
- **Metadatos de continuidad.** `reprintedAs`, `referenceSources`, `srd: true`: sirven para saber si
  una entrada se reimprimió en otro libro, en qué aventuras se menciona y si está en el SRD.
- **Un conversor de statblocks** (`js/converter/`): pegas el texto de un monstruo copiado del libro
  y lo convierte a JSON. Es la prueba de que la entrada al sistema es texto copiado.
- **Imágenes escaneadas** de los libros, en el repositorio de 6,8 GB.

En resumen: **5etools no tiene una fuente mágica; tiene diez años de transcripción voluntaria de
libros con copyright y un espejo que sobrevive a los retirados.**

### 1.3 Qué implica para nosotros

Copiar el modelo es fácil. Copiar los datos, también: están en un repositorio público. Lo que no se
puede copiar es el derecho a publicarlos, porque nunca existió.

---

## 2. «Español oficial»: el problema no es técnico, es que no existe en digital

Esto es lo más importante del análisis y cambia el plan entero.

- **D&D Beyond no está en español.** La ficha de la aplicación en la App Store declara un solo
  idioma: inglés. No hay edición digital oficial en castellano de la que extraer texto.
- **El español oficial es el libro impreso de Devir**: *Manual del Jugador* 2024 (mayo de 2025),
  *Guía del Dungeon Master* (junio de 2025), *Manual de Monstruos* (después). Es la única fuente
  «oficial» que existe, y es papel.
- **Traducciones comunitarias sí hay**, y son la vía práctica: los repositorios Babele de la
  comunidad de Foundry, con el *PHB 2024* (3,3 MB de cadenas traducidas), el *MM 2024* (3,9 MB) y
  el SRD 5.2. Son buenas, están mantenidas y **no son oficiales**: son obra derivada de la obra de
  Wizards, sin autorización.

Conclusión: **«español de España oficial» solo se consigue escaneando y OCR-eando libros comprados**
(2–3 ejemplares, 150 €), con corrección manual posterior. Cualquier atajo pasa por usar la
traducción de la comunidad y llamarla por su nombre.

---

## 3. Qué cambia jurídicamente

### 3.1 España

- **Real Decreto Legislativo 1/1996 (TRLPI)**, arts. 17 y 18: la reproducción y la distribución son
  derechos exclusivos del autor. Publicar el texto de un manual en una web es reproducción, y
  ponerlo a disposición del público es comunicación pública (art. 20.2.i).
- **Copia privada (art. 31)**: permite copiar para uso propio, no publicar. Escanear tu libro para
  ti es una cosa; subirlo, otra.
- **Art. 270 del Código Penal**: reproducción o distribución pública, en perjuicio de tercero y con
  ánimo de lucro, de obra protegida. Sin ánimo de lucro no hay delito, pero sí infracción civil.
- **Comisión de Propiedad Intelectual (Sección Segunda)**: a instancia del titular, puede ordenar la
  retirada y el bloqueo por parte de los proveedores de acceso españoles. Es un procedimiento
  administrativo, sin juez y sin coste para el denunciante.

### 3.2 Plataformas

- **GitHub** actúa ante notificaciones DMCA: retira el repositorio o la página mientras se resuelve.
  Una contra-notificación tarda entre 10 y 14 días, y no siempre procede: aquí no hay licencia que
  esgrimir, así que la contra-notificación se pierde.
- **GitHub Pages** no admite 6,8 GB de imágenes ni un sitio de este tamaño.

### 3.3 Lo que no protege

- «Sin ánimo de lucro»: reduce la exposición penal, no la civil.
- «Pongo la fuente y la página»: la atribución no sustituye la autorización.
- «5etools también lo hace»: no es una defensa; es la razón por la que su repositorio original ya no
  existe.
- «Está en un espejo y yo solo lo enlazo»: alojar es comunicar.

### 3.4 Qué se pierde exactamente

| Hoy | Después |
|---|---|
| Licencia verificable, citable y defendible | Ninguna |
| Atribución que resuelve el 100 % del copyright | Un aviso que no resuelve nada |
| Repositorio tranquilo en GitHub | Riesgo de retirada permanente |
| Posibilidad de monetizar o pedir donaciones | Se agrava (ánimo de lucro) |
| Marca propia sin usar la ajena | La marca ajena pasa a ser el gancho del sitio |

---

## 4. Alcance del contenido

### 4.1 Qué habría que cubrir para «todo lo que tienen los libros»

**Núcleo (5.5 / 2024):** Manual del Jugador, Guía del Dungeon Master, Manual de Monstruos.

**Suplementos de la línea 2024:** *Tasha's Cauldron*, *Xanathar's Guide*, *Mordenkainen's Monsters
of the Multiverse*, *Fizban's Treasury*, *Bigby Presents*, *Spelljammer*, *Ravenloft*, *Eberron*,
*Theros*, *Ravnica*, *Dragonlance*, *Planescape*, *Book of Many Things*.

**Línea 2014:** PHB, DMG, MM, *Volo's*, *Mordenkainen's Tome of Foes*, *Elemental Evil*, *Curse of
Strahd*, *Tyranny of Dragons* y el resto de aventuras.

**Aventuras sueltas:** decenas, con mapas.

### 4.2 Volumen medido en 5etools

- 519 ficheros, 115 MB de JSON, 6,8 GB de imágenes.
- Orden de magnitud: **~10.000 criaturas, ~2.000 conjuros, ~5.000 objetos, 100+ trasfondos,
  ~150 subclases, ~70 aventuras y ~70 libros completos** con su maquetación de referencia.

### 4.3 Lo que nosotros tenemos hoy

3.559 páginas, 2.490 entradas, 0 imágenes, 0 aventuras, 0 prosa de ambientación.

Es decir: **el giro multiplica el contenido por 10–15 y añade dos categorías nuevas** (libros y
aventuras) que hoy no existen en el proyecto.

---

## 5. Arquitectura objetivo

### 5.1 Qué se conserva y qué se tira

| Pieza | Decisión |
|---|---|
| Astro + Markdown por entrada | **Se tira** a partir de ~5.000 entradas con prosa e imágenes: el build deja de ser viable y el diff, inútil |
| Pipeline de extracción de PDF con `pdftotext -bbox-layout` | **Se conserva y se generaliza**: es la única vía para el español oficial |
| Buscador Pagefind | **Se sustituye** por un índice propio de tipo 5etools |
| Interfaz (raíl, tablas, fichas, comparador) | **Se conserva**; es lo único que el proyecto tiene mejor que el original |
| Licencias y atribución | **Se reescribe** entero: deja de haber licencia que enseñar |

### 5.2 Modelo de datos (calcado del suyo, con lo aprendido)

Un JSON por tipo y por fuente:

```
data/
  bestiary/bestiary-mm.json
  spells/spells-phb.json
  items/items-dmg.json
  class/class-wizard.json
  book/book-phb.json
  fluff/fluff-items.json
  aventuras/adventure-cos.json
```

Cada entidad:

```json
{
  "id": "fireball|xphb",
  "name": "Bola de fuego",
  "nameEn": "Fireball",
  "source": "XPHB",
  "page": 245,
  "edition": "2024",
  "srd": false,
  "reprintedFrom": "fireball|phb",
  "entries": ["..."],
  "tags": ["daño", "fuego", "evocación"],
  "meta": { "traducido": "oficial-devir", "revisado": "2026-10-20" }
}
```

Tres decisiones propias que su modelo no tiene:

1. **`id` estable con fuente**, para poder tener el mismo conjuro en 2014 y en 2024 sin colisión y
   para sostener el comparador que ya funciona.
2. **`meta.traducido`**: `oficial-devir`, `comunitario` o `propio`. Sin eso no se puede auditar la
   calidad ni decir la verdad al usuario sobre qué está leyendo.
3. **`tags` normalizados en español** para la búsqueda por concepto, que es lo que ellos resuelven a
   base de filtros por dominio.

### 5.3 Pipeline de ingesta

```
PDF oficial ES (comprado)
   ↓  pdftotext -bbox-layout     [ya escrito]
   ↓  segmentador por bloques    [ya escrito, hay que generalizar a maquetación 2024]
   ↓  parser por tipo            [hay que escribir 6 más]
   ↓  emparejamiento con el JSON inglés de 5etools (por página + nombre)
   ↓  revisión humana por muestreo
   ↓  JSON normalizado + validación de esquema
   ↓  build estático + índice
```

El emparejamiento con el inglés es la pieza clave: el JSON de 5etools da la **estructura** (qué es
un rasgo, qué una acción, qué un conjuro) y el PDF español da el **texto**. Sin ese cruce, cada libro
es una obra nueva de ingeniería.

### 5.4 Búsqueda

- Índice invertido propio en cliente, como ellos: ~5–8 MB comprimido para todo el catálogo.
- Alias español ↔ inglés, que ya está empezado (276 entradas) y aquí pasa a ser imprescindible.
- Filtros por fuente, edición, nivel, VD, tipo, escuela, clase, y por «sin SRD».

### 5.5 Alojamiento

- **GitHub Pages no sirve**: 6,8 GB de imágenes y un sitio de miles de páginas.
- Opción: Cloudflare Pages (estático) + **R2** para imágenes (10 GB gratis, luego ~0,015 $/GB).
- Alternativa: VPS propio (~5 €/mes) con Nginx, que además permite controlar logs y bloqueos.
- Backups y espejos: el proyecto original vive en espejos precisamente por esto.

### 5.6 i18n

- Español de España como idioma único de la interfaz y del contenido.
- Inglés solo como **alias de búsqueda** y como nombre secundario en la ficha.
- Glosario cerrado de terminología oficial (conjuro, espacio de conjuro, VD, salvación, dote,
  trasfondo, especie) para que no se mezclen traducciones comunitarias.

---

## 6. Plan por fases

Estimaciones mías, contando sesiones de trabajo como las de esta semana.

### Fase 0 — Preparación (2–3 días)

- Comprar PHB, DMG y MM 2024 en español (150 €).
- Decidir licencia del código (el nuestro es propio) y redactar el aviso legal nuevo.
- Montar R2/VPS y el pipeline de publicación.
- **Criterio de aceptación:** un libro entra de principio a fin en un entorno de pruebas.

### Fase 1 — Núcleo 2024 en español (4–6 semanas)

- PHB 2024 completo: 12 clases con 48 subclases, 10 especies, 16 trasfondos, 400 conjuros, 400
  dotes.
- DMG 2024: reglas, tablas, objetos mágicos, creación de mundos.
- MM 2024: 500 criaturas.
- Sustituir los datos actuales de 5.5 por los nuevos, manteniendo el comparador.
- **Criterio:** el 100 % de las entradas del PHB, con texto cotejado contra el libro y sin campos
  vacíos.

### Fase 2 — Núcleo 2014 y suplementos principales (4–6 semanas)

- PHB, DMG y MM 2014 completos (lo que hoy solo tenemos en versión SRD).
- *Xanathar*, *Tasha*, *Multiverso*: subclases, conjuros y criaturas que la gente busca.
- **Criterio:** paridad con 5etools en las cinco secciones de consulta.

### Fase 3 — Libros y aventuras (6–10 semanas)

- Lector de libro página a página, con maquetación de referencia y búsqueda interna.
- Aventuras con mapas y encuentros enlazados a las fichas.
- **Criterio:** una aventura completa navegable de principio a fin.

### Fase 4 — Herramientas al nivel del original (4 semanas)

- Constructor de personaje, calculadora de VD con la tabla del DMG, escalado de criaturas con la
  tabla real, pantalla del DM ampliada, exportación a Foundry.
- **Criterio:** el flujo de preparar una sesión sin salir del sitio.

### Fase 5 — Operación (permanente)

- Espejos, copias, vigilancia de retiradas, respuesta a notificaciones.

**Total realista: 4–6 meses de trabajo continuo** para una paridad razonable con 5etools, y solo si
la ingesta se automatiza mucho.

---

## 7. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación | ¿Elimina el riesgo? |
|---|---|---|---|---|
| Carta de cese de Wizards/Devir | Media | Alto | Retirar y renombrar | No |
| Retirada del repositorio o de la página (DMCA) | Media-alta | Alto | Espejos propios, alojamiento fuera de GitHub | No |
| Bloqueo por ISP en España | Baja-media | Alto | Dominio alternativo | No |
| Pérdida de buscadores y tráfico | Alta si hay retirada | Medio | nada | No |
| Trabajo tirado si hay que cerrar | Alta | Alto | Fases cortas, valor en cada una | No |
| Mala calidad de la traducción OCR | Alta | Medio | Revisión por muestreo, `meta.traducido` | Parcial |

---

## 8. Coste

| Concepto | Importe |
|---|---|
| Libros en español (PHB, DMG, MM 2024) | ~150 € |
| Libros 2014 y suplementos | ~300 € |
| Alojamiento (R2 + Pages o VPS) | 0–10 €/mes |
| Dominio | ~12 €/año |
| Trabajo | 4–6 meses a tiempo parcial |
| Asesoría si llega una carta | 200–500 € |

---

## 9. Qué se gana y qué se pierde

**Se gana:** el contenido que la gente busca de verdad (subclases, dotes, aventuras), el español
oficial, la paridad con la referencia del sector y un sitio que responde a «¿qué hace exactamente
esta subclase?».

**Se pierde:** la licencia, la legitimidad, la tranquilidad del repositorio, la posibilidad de
enseñar una autorización cuando alguien pregunte, y el trabajo de estos días en la parte de datos
(no en la de interfaz, que se conserva).

---

## 10. Escenarios posibles

### A. Como 5etools (el propuesto)
Todo el contenido, sin licencia. Máximo valor, máxima exposición. Lo descrito en este documento.

### B. Híbrido
Mecánica completa (subclases, dotes, conjuros, criaturas) **reescrita con palabras propias** a partir
de las reglas, sin copiar el texto, y prosa solo del SRD. En España y en la UE los **mecanismos de
juego no son protegibles** por copyright; la redacción sí. Es la vía que usan los retroclones y los
suplementos de terceros. Conserva la licencia del texto que ya tenemos, añade contenido sin copiar
frases, y sigue siendo legal. Cuesta más trabajo editorial y no da «el libro tal cual».

### C. Actual con el vocabulario de la comunidad
Lo de hoy, cambiando «SRD 5.1» por «5e» y «quinta edición», con la frase de compatibilidad que el
propio SRD autoriza. Riesgo cero, alcance limitado.

---

## 11. Lo que necesito decidir antes de tocar nada

1. **Escenario A, B o C.** Si es A, asumo que el plan incluye la retirada como escenario probable y
   que el trabajo puede perderse.
2. **Fuente del español**: ¿OCR de libros comprados (lento, oficial) o traducción comunitaria
   (rápido, no oficial, y también sin licencia)?
3. **Alojamiento**: Pages + R2 o VPS propio. Cambia el modelo de despliegue y los costes.
4. **Qué se hace con el contenido actual**: conservarlo como está (SRD, con licencia) en un apartado
   «contenido abierto» o sustituirlo.
5. **Nombre y dominio**: si el sitio va a competir con 5etools, la marca importa; y cualquier uso de
   «D&D» en el dominio es el punto de mayor riesgo del proyecto.
