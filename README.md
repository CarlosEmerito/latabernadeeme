# La Taberna de Eme

Referencia y herramientas de mesa para **D&D quinta edición** (reglas de 2014) y **quinta edición revisada** (reglas de 2024), construida sobre el contenido abierto del *System Reference Document* en su traducción oficial al español.

Dos apartados, `5e` y `5.5`, con la misma estructura: conjuros, monstruos, objetos mágicos, equipo, clases, especies, trasfondos, dotes y reglas, más herramientas para el Dungeon Master.

## Estado

| Edición | Conjuros | Monstruos | Objetos | Clases | Especies | Trasfondos | Dotes | Equipo | Reglas |
|---|---|---|---|---|---|---|---|---|---|
| 5e (SRD 5.1) | 319 | 317 | 240 | 12 | 9 | 1 | 1 | 213 | 47 |
| 5.5 (SRD 5.2.1) | 339 | 330 | 258 | 12 | 9 | 4 | 17 | 188 | 174 |

Los recuentos son el número de ficheros `.md` de cada carpeta de `data/`
(`find data/<edición>/<tipo> -name '*.md' | wc -l`) y en conjuros y monstruos
coinciden con los documentos oficiales. El SRD 5.1 solo contiene un trasfondo
(acólito) y una dote (luchador), y el 5.2 cuatro trasfondos: no faltan, están
así en el original.

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
  validar.py        recuentos, campos, cuerpos y tabla del README
```

```bash
python3 -m venv .venv-ingest && .venv-ingest/bin/pip install -r tools/requirements.txt
.venv-ingest/bin/python tools/ingest/descargar.py      # PDF -> .cache/srd/work/*.jsonl
.venv-ingest/bin/python tools/ingest/extract_core.py
.venv-ingest/bin/python tools/verify/validar.py
```

Los PDF no se versionan: `descargar.py` los baja de `dndbeyond.com` y el repositorio solo guarda el resultado.

## Comprobaciones

```bash
npm run build           # compila dist/ (Astro + índice de Pagefind)
npm run verificar       # datos, enlaces, ids, filtro, columnas y huérfanos; no necesita navegador
npm run verificar:humo  # pruebas de humo en Chrome headless; necesita navegador
```

`verificar` ejecuta seis pasos y compila el sitio antes del segundo si `dist/` no existe, así que también vale en un clon recién hecho:

1. `tools/verify/validar.py`: recuentos por edición y tipo frente a los del SRD y a la tabla del README, campos obligatorios vacíos, cuerpos cortados o desbordados y duplicados. Necesita Python con PyYAML: usa `.venv-ingest/bin/python` si existe, `python3` si no, y `PYTHON=/ruta/python` para forzar otro.
2. `tools/test/enlaces.mjs`: cada `href` y `src` interno del HTML compilado apunta a una página o fichero que existe, y cada fragmento (`#seccion`) a un `id` de la página de destino.
3. `tools/test/ids.mjs`: ninguna página repite un `id`. Los `id` de los encabezados salen del texto (`slugify`), y `IdsDeDocumento` numera los repetidos de una misma página —`-2`, `-3`…— para que el índice lateral enlace a cada apartado y no todos al primero.
4. `tools/test/filtro.mjs`: el `data-buscar` de cada fila es el nombre plegado (sin tildes ni mayúsculas) y las búsquedas sin tilde encuentran filas en los listados grandes.
5. `tools/test/columnas.mjs`: ningún listado publica una columna cuyos valores sean todos el guion de relleno, y cada fila tiene tantas celdas como cabeceras. El SRD 5.1 no declara la característica principal de sus clases, así que `/5e/clases/` sale con Nombre y Dado y la columna se queda en `/5.5/clases/`, donde el dato sí está.
6. `tools/test/huerfanos.mjs`: cada módulo de `src/lib/` lo importa alguien de `src/` o de `tools/`. Un módulo que nadie importa es código muerto que aparenta ser la fuente de la verdad; ya pasó con `src/lib/facetas.ts`, doscientas líneas de facetas que el listado de verdad no usaba.

`verificar:humo` sí necesita navegador: levanta `astro preview` en el puerto 8099, abre un Chrome headless con CDP en el 9223 con un perfil temporal, pasa `tools/test/humo.mjs` (navegación, herramientas de mesa, axe-core y avisos legales) y apaga los dos al terminar. Busca Chrome o Chromium en el `PATH`; `CHROME=/ruta/al/binario` para indicarlo a mano. Tarda alrededor de medio minuto.

Los mismos tres pasos a mano, cada uno en su terminal:

```bash
npx astro preview --port 8099
google-chrome-stable --headless=new --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-humo
node tools/test/humo.mjs
```

### Qué comprueba CI y qué queda en local

El flujo de publicación (`.github/workflows/deploy.yml`) se dispara con cada push a `main` —y a mano con `workflow_dispatch`— y antes de subir el artefacto a GitHub Pages hace dos cosas: `npm run build` y `npm run verificar`. Es decir, que los seis pasos de arriba corren en cada publicación: un enlace interno roto, un `id` repetido, un dato descuadrado, un filtro sin plegar o una columna vacía paran el job `construir` y no se publica la versión nueva.

Lo que **no** corre en CI es `verificar:humo`: necesita un Chrome headless y un servidor de vista previa levantados, y el flujo no los monta. Las comprobaciones de `tools/test/humo.mjs` —navegación, herramientas de mesa, axe-core y avisos legales— siguen siendo locales, y toca pasarlas a mano cuando el cambio toca plantillas o las herramientas de `/mesa/`.

Y como el disparador es el push a `main`, el check llega después del merge: un enlace roto no se publica, pero ya está en `main`. La puerta que lo evita es local, así que las dos se pasan antes de mergear: `npm run build && npm run verificar`.

## Web

- **Astro** en modo estático, sin servidor ni base de datos.
- **Pagefind** para la búsqueda, indexada en cada compilación. La vista `/buscar/` lee `?q=`, así que
  los formularios de la cabecera y de la portada llegan con el término ya aplicado y una búsqueda se
  puede enlazar: `/buscar/?q=goblin`.
- **EB Garamond** e **Inter** autoalojadas (SIL OFL): ninguna petición a terceros.
- Filtros que funcionan sin JavaScript; el contenido se sirve siempre renderizado.
- El filtro de texto de cada listado ignora tildes y mayúsculas: «dragon» encuentra «Dragón». La
  normalización vive en `src/lib/texto.ts` (`plegar`), que comparten el atributo `data-buscar` del
  HTML y la consulta del cliente; `slugify` usa la misma función.
- El orden por columna compara el valor, no el principio del texto. Precio mezcla monedas (po, pp,
  pc) y Peso mezcla unidades (kg, g) en la misma columna, así que `src/lib/medidas.ts` los pasa a
  oro y a kilos antes de comparar: «40 000 po» cuenta 40 000 —no 40— y «125 g» cuenta 0,125 kg.
  Los VD fraccionarios («1/8», «1/4», «1/2») se leen como fracción.
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
