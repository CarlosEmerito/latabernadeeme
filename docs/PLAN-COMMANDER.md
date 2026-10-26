# Commander: importar un mazo de Moxfield, verlo y aconsejarlo

Plan y análisis de viabilidad. Fecha: 26 de octubre de 2026.

**Estado:** decisiones tomadas. Fases F0-F4 hechas (importador, ficha, análisis, consejo y botón
de IA opcional); F5 (mazos propios como páginas estáticas) pendiente de los exports del autor.

## 1. Qué es y cómo se usa

Una herramienta más de La Taberna, para **Magic: The Gathering — Commander**, separada del
contenido de D&D. El recorrido:

1. **Entra el mazo.** El usuario pega el **export en texto** de Moxfield (More → Export → Plain
   Text) o suelta un `.txt`. La URL de Moxfield no se promete: Moxfield bloquea a los
   importadores de terceros (ver §3).
2. **Se indexa.** Cada línea se resuelve contra Scryfall; se agrupan las copias (12 `Forest` son
   una fila con cantidad 12), se separan comandante, companion y mainboard, y se guarda el mazo en
   el navegador. Sin cuenta, sin servidor.
3. **Se ve entero.** Rejilla con las 100 cartas y su imagen, buscador y filtros por tipo, valor de
   mana, color, rareza y **rol** (rampa, robo, removal, barrido, tutor, protección, wincon…).
   Ficha de carta al pulsar, con texto Oracle, legalidad y precio.
4. **Se lee el mazo.** Curva de mana, tierras, media de valor, identidad de color, legalidad
   Commander (100 cartas, singleton, banlist, identidad del comandante) y **bracket estimado**.
   El **companion** va aparte: se pinta con el mazo y se ve en su ficha, pero no cuenta para las
   100 ni suma en tierras, curva, media ni precio (en Commander se declara al empezar y vive en
   el banquillo); lo que sí se le exige es la identidad de color y la legalidad, como a cualquier
   otra carta que se juega.
5. **Se aconseja.** Informe que dice qué le falta y qué le sobra, y un plan de juego por tramos
   (turnos 1-3, 4-6, 7+): qué buscar, cuándo barrer, cómo cerrar. Es **determinista** (sale de los
   datos del mazo, no de un modelo). Opcionalmente, un botón **«Analizar con IA»** manda el resumen
   del mazo a Gemini con la clave gratuita del propio usuario.

## 2. Veredicto

**Viable, con tres condiciones.** No hay ningún bloqueo técnico ni de coste; lo que hay que
decidir es de producto y de licencia.

| Dimensión | Veredicto | Por qué |
|---|---|---|
| Datos de cartas | ✅ Sí | Scryfall es gratis, con CORS abierto y 53 *Game Changers* marcados. |
| Importar de Moxfield | ⚠️ Solo por export | La API no es oficial, no manda CORS y Moxfield bloquea a los importadores de terceros. Pegar el export es el camino que usan todos. |
| Ver las 100 cartas | ✅ Sí | Imágenes `small` de 12 KB, carga diferida: ~1,2 MB si se ven todas. |
| Consejo determinista | ✅ Sí | Roles con las etiquetas de Scryfall (4.588 etiquetas, 36.223 cartas): rampa, robo, removal, barrido, tutor… |
| «IA» de verdad | ✅ Opcional | Gemini Flash con clave propia y su capa gratuita: 0 €. Sin clave, la herramienta funciona igual. |
| Licencia | ⚠️ Cambia el relato del sitio | El contenido de MTG **no es CC BY**: entra por la Fan Content Policy (gratis, sin paywall, con aviso de no oficial). |
| Coste | 0 € | Scryfall, Moxfield, GitHub Pages y la capa gratuita de Gemini. |
| Esfuerzo | 8-10 sesiones | Fases en §8. |

## 3. Lo comprobado hoy (no supuesto)

- **Scryfall**: `api.scryfall.com` responde con `access-control-allow-origin: *`, así que se llama
  **desde el navegador**. Límites duros: `/cards/collection` 2/s (500 ms); el resto 10/s. Un mazo de
  100 cartas son **2 peticiones** de 75 identificadores (medido: 0,80 s para 75) y se cachea 24 h,
  como pide Scryfall.
- **Imágenes**: `cards.scryfall.io` sin límite de tasa. `small` 12,3 KB · `normal` 71,7 KB ·
  `large` 106 KB. Con carga diferida, un mazo de 100 no pesa más que una página de listado actual.
- **Doble cara**: la carta trae `card_faces` y no `image_uris`; hay que pintar la cara frontal y
  girar al pulsar. `Delver of Secrets` resuelve por nombre a «Delver of Secrets // Insectile
  Aberration».
- **Moxfield**: `api2.moxfield.com/v3/decks/all/<id>` responde **200 solo con User-Agent de
  navegador** y **403 sin él**; la respuesta **no lleva cabeceras CORS** (un `fetch` desde la web
  se bloquea) y `moxfield.com` devuelve un challenge de Cloudflare a quien no es un navegador. Tres
  importadores del sector (TableCommander, fabricard, edhmat) documentan que **la URL de Moxfield no
  funciona y hay que pegar el export**. El JSON v3 sí trae `scryfall_id` por carta, nombre, coste,
  tipo y tableros (`mainboard`, `commanders`, `companions`, `sideboard`…), así que si algún día se
  usa, el emparejamiento es exacto.
- **Formato del export**: `1 Sol Ring`, `1 Sol Ring (LTC) 284`, `10 Forest`, `SB:`, separadores
  `Commander` / `Deck` / `Sideboard` / `Companion`, comentarios `//`, marcas `*F*`/`*E*`. Es el
  formato que ya entienden todos los importadores.
- **Brackets**: 53 *Game Changers* en Scryfall (`is:game_changer`, comprobado: 53) y las reglas
  vigentes (actualización del 9 de febrero de 2026): B1 y B2 sin Game Changers; B3 hasta 3; B4 y B5
  sin límite; negación masiva de tierras y combos infinitos de dos cartas solo en B4-B5.
- **Etiquetas funcionales**: el volcado `oracle_tags` de Scryfall (6 MB comprimido) asigna etiquetas
  como `land ramp`, `mana rock`, `draw engine`, `sweeper`, `counterspell`, `removal-creature` a
  36.223 cartas. Es la base del consejo gratis; hay que mapear 4.588 etiquetas a ~20 roles.
- **Coste de la IA**: un mazo de 100 cartas con nombre, coste, tipo y texto Oracle son **~6.200
  tokens de entrada** (medido con cartas reales) y ~800 de salida. Gemini Flash tiene capa gratuita
  sin tarjeta (límites según modelo y proyecto; los prompts pueden usarse para mejorar sus
  productos). De pago serían céntimos de milésima por análisis.

## 4. Licencia: lo que cambia

El sitio hoy promete «solo contenido del SRD, CC BY 4.0». MTG es otra cosa:

- **Scryfall** publica sus datos e imágenes para contenido *Magic* bajo la **Fan Content Policy** de
  Wizards. Sus condiciones: no paywall, no repackaging ni proxy de sus datos, aportar valor, y en
  las imágenes no recortar, deformar, filtrar ni tapar el copyright ni el artista. Nosotros
  añadimos el análisis del mazo, así que cumplimos; las imágenes se muestran enteras.
- **Fan Content Policy**: gratis para el usuario (sin pago, encuesta, registro ni suscripción), sin
  logos ni símbolos de Wizards como identidad, y con el aviso de no oficial. Texto exacto que habrá
  que poner en `/mtgcommander/` y en su pie:
  > La Taberna de Eme (Commander) is unofficial Fan Content permitted under the Fan Content Policy.
  > Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the
  > Coast. ©Wizards of the Coast LLC.
- **Nombre**: «Commander» y los nombres de las cartas se usan de forma nominativa; nada de logo de
  MTG, ni símbolos de maná como marca, ni «oficial». La sección no se llama «Magic»; se llama
  «Commander».
- **Separación**: la sección lleva su propia página de licencias y su aviso. Las fichas de D&D y su
  «solo SRD» no se tocan, y la portada sigue siendo de D&D. Lo que no se puede hacer: cobrar por
  acceder, pedir registro para verlo, o presentar el mazo como contenido propio.

## 5. Las tres formas de meter un mazo

| Vía | Cómo | Coste | Riesgo | Veredicto |
|---|---|---|---|---|
| **A. Pegar el export** | El usuario copia el texto de Moxfield y lo pega | 0 € | Ninguno | **Recomendada**; es lo que hacen los demás |
| **B. URL de Moxfield** | La web pide el mazo a un Worker de Cloudflare que hace de proxy | 0 € (capa gratuita) | Moxfield bloquea a terceros y cambia sin avisar | No prometer; opcional y marcada como experimental |
| **C. Mazos en el repo** | Sus mazos, en `data/commander/mazos/*.txt`, generan una página estática | 0 € | Ninguno | Para sus mazos: URL bonita, en el sitemap y compartible |

La A es la base. La C es un extra barato que resuelve «que quede publicado y compartible» sin
servidor. La B no se construye hasta que A y C estén en pie, y si se hace, se dice que puede dejar
de funcionar cualquier día.

## 6. Arquitectura

Todo estático, como el resto del sitio; el trabajo pesado ocurre en el navegador.

```
/mtgcommander/                     importador + mazo + consejo (una página con estados)
/mtgcommander/mazo/<slug>/         mazo propio, estático (solo los del repo)
/mtgcommander/como-se-juega/       guía corta de Commander (reglas, brackets, mulligan)
/mtgcommander/licencias/           Fan Content, Scryfall y qué no se puede hacer
```

- **Entrada**: `<textarea>` para el export + arrastrar un `.txt`; botón «Importar».
- **Resolución**: `POST /cards/collection` en lotes de 75 con 500 ms entre lotes; por nombre y set
  cuando el export lo trae, por `scryfall_id` si algún día viene de la API.
- **Caché**: IndexedDB por `scryfall_id`, TTL 7 días (Scryfall pide ≥24 h). Los mazos en
  `localStorage` (`taberna:commander:mazos`), ~150 KB cada uno.
- **Vista**: rejilla con `loading="lazy"`, imagen `small` y `normal` al abrir la ficha; filtros y
  buscador en cliente, sin Pagefind (el mazo no existe en el build).
- **Consejo determinista**: módulo `src/lib/commander/` con funciones puras (roles, curva,
  legalidad, bracket), probado con `node --test` como las libs actuales.
- **IA opcional**: `fetch` directo a Gemini desde el navegador con la clave del usuario en
  `localStorage`; sin clave, el botón no aparece. Nada de claves del sitio ni de un Worker con
  secreto.
- **Sin servidor**: no hay cuentas ni base de datos; el mazo no sale del navegador salvo que el
  usuario pulse «Analizar con IA».

## 7. Qué dice el consejo (y qué no)

**Determinista, siempre:**

- Legalidad: 100 cartas, singleton (salvo tierras básicas y cartas que lo permiten), banlist de
  Commander, identidad de color del comandante, cartas no legales.
- Bracket estimado por puertas duras: Game Changers (0/0/3/∞), negación masiva de tierras, turnos
  extra encadenados, combos conocidos. Se presenta como **suelo** («esto no puede ser Bracket 2»),
  no como sentencia: WotC dice que el bracket es una conversación.
- Recuentos por rol con umbrales de referencia (tierras 36-38, rampa 10-12, robo 8-10, removal 6-10,
  barridos 2-3, protección 2-4), curva y pips por color frente a las fuentes de maná.
- Plan de juego por tramos con frases que citan las cartas del mazo: «turno 1-3: rampa con X, Y;
  turno 4-6: motor con Z; cierre: W». Nada de «deberías tener más rampa» sin decir cuánta hay y
  cuánta falta.
- Simulador de mano inicial (extra barato): 7 cartas al azar y una nota de si son jugables.

**IA opcional:** solo redacta estrategia sobre el resumen que ya está calculado; no decide la
legalidad ni el bracket. Se etiqueta como sugerencia y se avisa de que el mazo sale del navegador.

## 8. Fases

| Fase | Qué | Criterio de aceptación | Esfuerzo |
|---|---|---|---|
| F0 | Licencias, rutas y aviso de Fan Content | `/mtgcommander/licencias/` publicada y pie con el texto exacto | 0,5 |
| F1 | Export → Scryfall → rejilla de las 100 cartas | Un mazo de 100 se ve en <3 s; ninguna carta perdida sin aviso; copias agrupadas | 2-3 |
| F2 | Ficha, filtros, stats, legalidad y bracket | Filtros por tipo/MV/color/rol; legalidad y bracket con datos; axe limpio; 360/390 sin scroll horizontal | 2 |
| F3 | Consejo determinista | Informe con roles, curva y plan por turnos; cada frase sale de un dato del mazo | 2 |
| F4 | IA opcional con clave propia | Sin clave no se llama a nada; con clave, respuesta <10 s; error claro si falla; aviso de privacidad | 1 |
| F5 | Mazos propios estáticos y docs | Página por mazo en el sitemap; `verificar` y humo en verde | 1 |

Total: **8-10 sesiones**. El orden importa: F1-F2 ya es una herramienta útil aunque nunca se haga
la IA.

## 9. Riesgos

- **Moxfield**: bloquea a terceros. Se asume el export; la URL no se promete. Si algún día abre una
  API oficial, se enchufa sin cambiar el resto.
- **Scryfall**: puede cambiar campos o límites. Se cachea, se manejan `not_found` y se cae a
  búsqueda por nombre.
- **Fan Content Policy**: es revocable y exige el aviso y el gratis. Nada de paywall ni registro.
- **Alucinaciones de la IA**: por eso el consejo base es determinista y la IA solo redacta sobre
  datos ya calculados.
- **Peso**: 100 imágenes `small` con `lazy`; la ficha carga la `normal` solo al abrirla.
- **Privacidad**: el mazo vive en el navegador; la IA es opt-in y con la clave del usuario.

## 10. Decisiones tomadas (26/10/2026)

1. **Entrada**: export pegado. La URL de Moxfield no se intenta.
2. **Sitio**: sección `/mtgcommander/`, con su aviso de Fan Content y sin tocar los títulos de D&D.
3. **IA**: consejo determinista gratis + botón opcional con la clave gratuita de Gemini del usuario.
4. **Compartir**: mazos propios como páginas estáticas del repo; pendiente de F5.
