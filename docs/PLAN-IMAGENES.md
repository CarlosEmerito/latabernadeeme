# Imágenes: qué se puede usar, cómo y cuánto cuesta

Investigación previa. **No se ha añadido ninguna imagen al sitio.** Fecha: 20 de octubre de 2026.

> **Decisión posterior, el mismo 20 de octubre:** los grabados se probaron y se retiraron por
> no encajar con el tono del proyecto (commit `07d330c`). El sitio usa iconos de `game-icons.net` y
> sigilos propios; este documento se conserva como investigación, no como plan vigente.

---

## 1. El punto de partida

El texto que publicamos está bajo CC BY 4.0. **Las ilustraciones de los manuales no.** El SRD que
usamos no trae arte: solo texto y maquetación, y las imágenes de los libros son obra de sus
ilustradores, con derechos propios. Ni la licencia del SRD ni la del texto las alcanzan.

Así que «añadir imágenes» significa **elegir de dónde salen**, y ahí hay cuatro familias: dominio
público, licencias libres, encargo y generación artificial.

---

## 2. Fuentes verificadas

He comprobado cada una contra su web o su API, no de memoria.

### 2.1 Dominio público (sin obligación de atribuir, aunque conviene)

| Fuente | Qué tiene | Cómo se accede | Licencia |
|---|---|---|---|
| **The Met** | Grabados, dragones, bestiarios, armaduras, escenas medievales | API `collectionapi.metmuseum.org/public/collection/v1.1/`, sin clave; campo `isPublicDomain` | Dominio público (CC0 en lo abierto) |
| **Cleveland Museum of Art** | Igual, con filtro `cc0=1` | API abierta; imagen directa en `openaccess-cdn.clevelandart.org` | CC0 |
| **Art Institute of Chicago** | Grabados y láminas | API `api.artic.edu`, campo `is_public_domain` | Dominio público |
| **Wikimedia Commons** | Millones de escaneos de libros antiguos | API `commons.wikimedia.org/w/api.php` | Variable por fichero: hay que leer la ficha |
| **Biodiversity Heritage Library** | Historia natural: lobos, osos, serpientes, dragones de bestiario | API y descarga | Dominio público |
| **Internet Archive Book Images** | Ilustraciones recortadas de libros anteriores a 1929 | Flickr Commons / API | Sin restricciones conocidas |
| **Old Book Illustrations, rawpixel** | Grabados victorianos y medievales | Descarga directa | Dominio público |

La ventaja no es solo legal: **el grabado antiguo encaja con la marca**. La Taberna de Eme con
xilografías y aguafuertes tiene una personalidad que la ilustración de fantasía moderna no da, y
nadie más lo está haciendo en español.

### 2.2 Licencias libres con atribución

| Fuente | Qué tiene | Licencia | Nota |
|---|---|---|---|
| **game-icons.net** | ~4.000 iconos vectoriales de fantasía: espadas, pociones, escudos, calaveras, escuelas de magia | **CC BY 3.0** | Autor concreto por icono (`lorc`, `delapouite`…); piden la línea «Icons made by … available on game-icons.net» |
| **Dyson Logos** | Mapas de mazmorra dibujados a mano | CC BY 4.0 en la mayoría | Permite uso comercial con atribución |
| **OpenGameArt** | Arte de juego, calidad desigual | Mixta, fichero a fichero | Hay que revisar cada pieza |
| **2-Minute Tabletop** | Mapas y tokens | **CC BY-NC** | No comercial: incompatible si algún día se monetiza |

### 2.3 Encargo

Un ilustrador de fantasía cobra entre **25 y 80 €** por pieza en España para nivel semiprofesional.
Para 600 monstruos es inviable; para las 20 fichas más consultadas, no.

### 2.4 Generación artificial

Rápida y barata, pero con dos asteriscos: la licencia del modelo (algunos prohíben uso comercial) y
la calidad, que en criaturas concretas («un aboleth») no es fiable sin un buen prompt. No la
recomiendo como base; sí como relleno puntual si se decide.

---

## 3. Tres estilos posibles

### A. Grabado de época (mi recomendación)
Xilografías y aguafuertes de dominio público, con un tratamiento común: papel cálido, tinta oscura,
un solo color de acento. Coherente con la tipografía serif y con el nombre del sitio.
- **A favor:** legalmente limpio, identidad fuerte, cero coste, nadie lo hace en español.
- **En contra:** no hay un dragón de cada tipo de D&D; hay dragones genéricos. Requiere criterio
  para emparejar (un lobo es un lobo; un azotamentes no existe en 1650).

### B. Icono y sigilo
Un icono por tipo y escuela (game-icons) y, para cada entrada, un **sigilo generado**: un SVG
determinista a partir del nombre, con el color de su sección. 
- **A favor:** cubre las 2.490 entradas sin una sola licencia discutible, pesa kilobytes y da
  coherencia total. Es lo que hacen los sitios serios cuando no tienen arte.
- **En contra:** no ilustra; identifica.

### C. Ilustración moderna
Arte de fantasía actual, por encargo o generado.
- **A favor:** es lo que el usuario espera de una web de D&D.
- **En contra:** coste, derechos y, sobre todo, que sin presupuesto se nota.

**Propuesta: A + B, en capas.** Icono de sección en la interfaz, grabado en las fichas que lo
tengan, sigilo donde no lo haya. Nunca un hueco vacío.

---

## 4. Cómo se implementa

### 4.1 Dónde viven

```
src/assets/ilustraciones/monstruos/lobo.jpg     ← fuente, fuera del HTML
public/img/monstruos/lobo-960.webp              ← generado por script
public/img/monstruos/lobo-480.avif
public/iconos/escuela-evocacion.svg             ← game-icons, recoloreado
```

Los ficheros optimizados van a `public/` y los genera un script con `sharp`, no el build: con 1.200
imágenes, procesarlas en cada compilación multiplica el tiempo sin ganar nada. El script es
idempotente y solo reprocesa lo que cambia.

### 4.2 Cómo se referencian

En el frontmatter de cada entrada:

```yaml
imagen: lobo.jpg
imagenAlt: "Grabado de un lobo de frente, con el pelaje erizado"
imagenCredito: "Francis Barlow, 1687"
imagenLicencia: dominio-publico
imagenFuente: "https://commons.wikimedia.org/wiki/File:..."
```

Sin esos cinco campos no hay imagen: **alt y crédito son obligatorios**, porque una imagen sin
descripción es un agujero de accesibilidad y una imagen sin procedencia es una reclamación futura.

### 4.3 Cómo se pinta

Un componente `Figura.astro` con `<picture>`:

```html
<picture>
  <source type="image/avif" srcset="…-480.avif 480w, …-960.avif 960w" sizes="…">
  <source type="image/webp" srcset="…-480.webp 480w, …-960.webp 960w" sizes="…">
  <img src="…-960.webp" width="960" height="600" alt="…" loading="lazy" decoding="async">
</picture>
<figcaption>Grabado de un lobo · Francis Barlow, 1687 · dominio público</figcaption>
```

- **Ancho y alto siempre**: sin ellos hay salto de maquetación (CLS).
- **`lazy`** salvo la imagen principal de la ficha, que lleva `fetchpriority="high"`.
- **Sin texto dentro de la imagen**: el texto se selecciona, se traduce y se lee en voz alta.
- En impresión (cartas, pantalla del DM), versión en blanco y negro para no fundir tóner.

### 4.4 Dónde aparecen

1. **Iconos de sección e interfaz**: raíl, cabeceras, fichas (escuela de magia, tipo de criatura,
   rareza). Es la mejora más barata y la que más cambia la percepción de acabado.
2. **Ficha**: una imagen de cabecera, formato apaisado 3:2, a 960 px.
3. **Listados**: miniatura de 32 px en la primera columna, solo si existe.
4. **Portada**: una tira de tres o cuatro grabados como presentación.

### 4.5 Rendimiento

Presupuesto por imagen: **≤ 60 KB** en WebP a 960 px, ≤ 25 KB en AVIF a 480. Una ficha con imagen
no debe pasar de 250 KB totales. Se mide con el script de métricas que ya existe.

### 4.6 Volumen y peso

| Cobertura | Imágenes | Peso estimado |
|---|---|---|
| Iconos de interfaz y escuelas | ~60 SVG | 150 KB |
| Fichas destacadas | 120 | 7 MB |
| Todos los monstruos | 617 | 37 MB |
| Monstruos + objetos + conjuros | 1.770 | 106 MB |

GitHub Pages admite hasta 1 GB, pero el repositorio se vuelve incómodo por encima de ~100 MB. Con
las 120 destacadas no hay problema; para llegar a las 1.770 habría que mover las imágenes a
Cloudflare R2 (10 GB gratis) o similar, y el sitio seguiría siendo estático.

---

## 5. El emparejamiento, que es el trabajo real

Lo difícil no es descargar: es decidir **qué imagen le toca a qué entrada**. Un lobo es un lobo; un
«remorhaz» no está en ningún grabado del XVII.

Propuesta de criterio, por orden:

1. **Criaturas reales o del folclore** (lobo, oso, araña, dragón, grifo, basilisco, unicornio,
   sierpe): hay grabado. Es el 60 % del bestiario.
2. **Criaturas inventadas** (aboleth, remorhaz, mimbo): sigilo.
3. **Objetos** (espada larga, cota de malla, poción, anillo): grabados de armería y orfebrería de
   los siglos XVI–XIX, abundantes en el Met y Cleveland.
4. **Conjuros**: icono de escuela + color, no ilustración. Un grabado por conjuro sería un desastre
   de coherencia.
5. **Clases y especies**: grabado de oficio o figura histórica; funcionan muy bien con la estética.

Con una tabla de correspondencias de unas 200 filas se cubre el 80 % de las fichas que la gente
abre. El resto, sigilo.

---

## 6. Fases

**Fase 1 — Iconografía (1 día).** Iconos de sección, escuelas y tipos con game-icons, recoloreados a
la paleta. Sin imágenes de fichas. Cambio visual inmediato, cero riesgo.

**Fase 2 — Sigilos (1 día).** Generador de SVG determinista por entrada, con el color de su sección y
las iniciales. Toda ficha tiene algo; ninguna queda vacía.

**Fase 3 — Grabados destacados (3–5 días).** 120 fichas con grabado real, con su crédito. Aquí está
el trabajo de selección y de licencias.

**Fase 4 — Bestiario completo (1–2 semanas).** Las 617 criaturas, con revisión de cada crédito.

**Fase 5 — Resto del catálogo (2–3 semanas).** Objetos y equipo; conjuros solo con icono.

---

## 7. Coste

| Concepto | Importe |
|---|---|
| Fuentes de dominio público | 0 € |
| Iconos game-icons (CC BY) | 0 € |
| Herramientas (`sharp`, descarga) | 0 € |
| Alojamiento adicional (si se llega a 1.770 imágenes) | 0–5 €/mes |
| Encargo de arte para 6–10 fichas emblemáticas | 300–600 € |
| Trabajo de selección y créditos | el grueso del tiempo |

---

## 8. Lo que no se va a hacer

- Arte de los manuales, escaneado o descargado: es la misma infracción que el texto, sin licencia.
- Arte de Pinterest, Tumblr o wallpapers: procedencia desconocida, reclamación segura.
- Arte de terceros con licencia dudosa «porque está en internet»: el crédito no es una licencia.
- Imágenes generadas sin comprobar la licencia del modelo.

---

## 9. Decisiones

1. **Estilo**: grabado de época (A), icono y sigilo (B) o los dos en capas (A+B, recomendado).
2. **Alcance inicial**: solo interfaz y sigilos, o también las 120 fichas destacadas.
3. **Bestiario completo ahora o después**: son 617 imágenes y varias semanas de selección.
4. **¿Se encargan 6–10 ilustraciones propias** para las fichas más visitadas, con un estilo definido?
