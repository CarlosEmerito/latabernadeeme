# La Taberna de Eme

Referencia y herramientas de mesa para **D&D quinta edición** (reglas de 2014) y **quinta edición revisada** (reglas de 2024), construida sobre el contenido abierto del *System Reference Document* en su traducción oficial al español.

Dos apartados, `5e` y `5.5`, con la misma estructura: conjuros, monstruos, objetos mágicos, equipo, clases, especies, trasfondos, dotes y reglas, más herramientas para el Dungeon Master.

## Estado

| Edición | Conjuros | Monstruos | Objetos | Clases | Especies | Trasfondos | Dotes | Equipo | Reglas |
|---|---|---|---|---|---|---|---|---|---|
| 5e (SRD 5.1) | 319 | 302 | 240 | 12 | 9 | 1 | 1 | 213 | 44 |
| 5.5 (SRD 5.2.1) | 339 | 315 | 258 | 12 | 9 | 4 | 17 | 188 | 174 |

Los recuentos están verificados contra los documentos oficiales. El SRD 5.1
solo contiene un trasfondo (acólito) y una dote (luchador), y el 5.2 cuatro
trasfondos: no faltan, están así en el original.

Los recuentos de conjuros y monstruos están verificados contra los documentos oficiales; las celdas con «—» son contenido en extracción.

## Por qué Markdown y no JSON

Cada entrada es **un fichero Markdown con frontmatter YAML**. No hay un JSON de 700 objetos por tipo.

- Un cambio en «Bola de fuego» produce un diff de un fichero, legible en una revisión.
- Dos personas pueden editar entradas distintas sin conflictos.
- El texto del SRD se conserva como prosa Markdown, no escapado dentro de cadenas.
- Los campos mecánicos (nivel, escuela, VD, CA…) van en el frontmatter, así que se filtran y ordenan sin parsear el cuerpo.

Lo único que se genera es un índice de búsqueda (Pagefind) en tiempo de compilación, que no se versiona.

## Cómo se construye

```
tools/ingest/
  descargar.py      descarga los PDF oficiales en español y genera los flujos de líneas
  pdf_stream.py     PDF de dos columnas -> JSONL de líneas con posición y tamaño
  srd/stream.py     utilidades sobre el flujo (párrafos, recortes por sección)
  srd/spells.py     parser de conjuros (5.1 y 5.2)
  srd/monsters.py   parser de perfiles de monstruo (5.1 y 5.2)
  extract_core.py   orquesta y escribe data/
tools/verify/
  validar.py        recuentos, campos obligatorios, cuerpos vacíos o desbordados
```

```bash
python3 -m venv .venv-ingest && .venv-ingest/bin/pip install -r tools/requirements.txt
.venv-ingest/bin/python tools/ingest/descargar.py      # PDF -> .cache/srd/work/*.jsonl
.venv-ingest/bin/python tools/ingest/extract_core.py
.venv-ingest/bin/python tools/verify/validar.py
```

Los PDF no se versionan: `descargar.py` los baja de `dndbeyond.com` y el repositorio solo guarda el resultado.

## Web

- **Astro** en modo estático, sin servidor ni base de datos.
- **Pagefind** para la búsqueda, indexada en cada compilación.
- **EB Garamond** e **Inter** autoalojadas (SIL OFL): ninguna petición a terceros.
- Filtros que funcionan sin JavaScript; el contenido se sirve siempre renderizado.
- Temas claro y oscuro, foco visible, navegación por teclado y estilos de impresión para llevar una ficha a la mesa.

```bash
npm install
npm run dev       # http://localhost:4321/latabernadeeme/
npm run build     # dist/ + índice de Pagefind
```

Se publica en `https://carlosemerito.github.io/latabernadeeme/`, de ahí el `base` de `astro.config.mjs`. Para probar sin prefijo: `BASE_PATH="" npm run dev`.

## Licencias

El texto procede del **SRD 5.1** y del **SRD 5.2.1** de Wizards of the Coast LLC, bajo **Creative Commons Atribución 4.0 Internacional (CC BY 4.0)**: se puede copiar, transformar y redistribuir con atribución, incluso comercialmente.

Esta web **no está afiliada ni respaldada por Wizards of the Coast**. «Dungeons & Dragons» y «D&D» son marcas de sus titulares; aquí solo se usa el contenido abierto del SRD, sin logotipos ni material de ambientación.
