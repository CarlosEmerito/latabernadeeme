/**
 * Comprobaciones que no necesitan navegador: `npm run verificar`.
 *
 *   1. `tools/verify/validar.py` con un intérprete de Python (el venv de
 *      ingesta si existe, `python3` si no): recuentos, campos obligatorios,
 *      cuerpos vacíos o desbordados y duplicados de `data/`.
 *   2. `tools/test/enlaces.mjs` sobre `dist/`: que cada enlace interno —y cada
 *      fragmento— apunte a una página y a un ancla que existen.
 *   3. `tools/test/ids.mjs` sobre `dist/`: que ninguna página repita un `id`,
 *      que es lo que deja las anclas sin destino único.
 *   4. `tools/test/filtro.mjs` sobre `dist/`: que el filtro de texto de los
 *      listados venga plegado del HTML y «dragon» encuentre «Dragón».
 *   5. `tools/test/tamano.mjs` sobre `dist/`: que el filtro Tamaño del
 *      bestiario publique una casilla por tamaño —«Mediano» y «Mediana» son la
 *      misma— y que el recuento de cada casilla sea el de las filas que la
 *      llevan, sin criaturas fuera.
 *   6. `tools/test/diff.mjs`: que la alineación de bloques del comparador
 *      empareje un encabezado con otro encabezado y nunca con un párrafo, que
 *      el orden de los bloques se conserve y que los cuatro contadores del
 *      resumen sumen las filas que hay.
 *   7. `tools/test/columnas.mjs` sobre `dist/`: que ningún listado publique una
 *      columna entera de guiones —el SRD 5.1 no declara la característica de
 *      sus clases ni la categoría de sus dotes— y que las celdas sigan
 *      alineadas con sus cabeceras.
 *   8. `tools/test/iconos.mjs` sobre `dist/`: que toda ficha lleve el icono de
 *      su banda, que es lo que delata un tipo o una escuela sin SVG.
 *   9. `tools/test/alias.mjs` sobre `dist/`: que cada ficha publique el alias
 *      inglés que le toca —por nombre o, si el nombre es ambiguo, por ficha— y
 *      que `/datos/<edición>.json` sirva el mismo que pinta la página.
 *  10. `tools/test/iniciativa.mjs`: que el combate guardado en el navegador se
 *      lea como un solo contrato en `/mesa/` y `/mesa/jugadores/` —JSON roto,
 *      entradas a medias y `turno` fuera de la lista incluidos—, para que
 *      recargar no deje las dos pantallas con combates distintos.
 *  11. `tools/test/huerfanos.mjs`: que ningún módulo de `src/lib/` se quede sin
 *      quien lo importe y ningún `export function` / `export const` suyo sin
 *      quien lo llame, que es como se cuela código muerto que duplica otra
 *      implementación y confunde sobre cuál manda.
 *  12. `tools/test/fuentes.mjs`: que README y `/licencias/` acrediten exactamente
 *      las tipografías que el CSS carga —ni una de menos ni una de más— y que
 *      `package.json` no declare ninguna fuente sin importar.
 *  13. `tools/test/tipo.py`: que la línea de tipo del perfil —tipo, tamaño y
 *      alineamiento— se parta como toca, con el tamaño alternativo
 *      («Mediano o Pequeño») y el complemento suelto del tipo en `tags`.
 *  14. `tools/test/seo.mjs` sobre `dist/`: que cada página publique una sola
 *      canónica absoluta, `og:url` idéntica, `og:type` de ficha o de listado,
 *      `twitter:card` y una `og:image` que sea el PNG de su sigilo y exista.
 *  15. `tools/test/duplicados.py`: que dos fichas de la misma carpeta y la
 *      misma categoría no compartan nombre —el listado publicaría dos filas
 *      indistinguibles— y que el homónimo en categorías distintas siga
 *      permitido.
 *  16. `tools/test/titulos.mjs` sobre `dist/`: que ninguna página comparta
 *      `<title>` con una de otra sección —«Escudo» conjuro y «Escudo» equipo
 *      salían iguales en la pestaña y en Google— y que todas tengan uno.
 *  17. `tools/test/cifras.py`: que los recuentos que declaran los informes
 *      versionados cuadren con `data/` y con `dist/datos/` —las entradas, las
 *      palabras y las tablas de `reglas.md`, las fichas de `monstruos.md`, los
 *      ficheros por carpeta de `origenes-equipo.md` y de `objetos.md`, y el
 *      total de entradas y el tamaño del índice de `DATOS.md`.
 *  18. `tools/test/secciones.mjs` sobre `dist/`: que todos los apartados de
 *      las dos ediciones se publiquen en su página de comparación, que es donde
 *      se ven las dos redacciones de un mismo apartado.
 *  19. `tools/test/presupuesto.mjs`: que la tabla de PX por personaje del
 *      5.2.1 que usa el constructor de encuentros sea la del SRD, con sus tres
 *      dificultades y sin ajuste por número de criaturas, y que el 5.1 use su
 *      tabla y su ajuste.
 *  20. `tools/test/emparejar.mjs`: que el comparador empareje el mismo objeto
 *      en las dos ediciones —por identidad, no por identificador de fichero— y
 *      que toda entrada que existe en las dos ediciones tenga su página de
 *      comparación.
 *  21. `tools/test/markdown.mjs` sobre `dist/`: que el Markdown que copia el
 *      botón «Copiar Markdown» lleve el PX con su unidad una sola vez. La
 *      puerta ejecuta el script que el navegador carga en la ficha y mira lo
 *      que va al portapapeles, no una copia de la regla escrita a mano.
 *  22. `tools/test/gastos.mjs` sobre `data/` y `dist/`: que la ficha de gastos
 *      del SRD 5.2.1 publique sus tres tablas con sus filas y sus precios.
 *  23. `tools/test/bytecode.mjs`: que el índice de git no tenga ningún `.pyc`
 *      ni nada bajo `__pycache__/`, y que el `.gitignore` siga tapando el
 *      bytecode. Un `.pyc` guarda el mtime del fuente, así que solo vale en la
 *      máquina donde se compiló y deja el árbol sucio en cualquier clon en
 *      cuanto se importa el módulo.
 *  24. `tools/test/ajustar.mjs`: que «Ajustar una criatura» encuentre las
 *      criaturas con diacrítico escribiéndolas sin tilde y acepte los VD
 *      fraccionarios del catálogo (1/8, 1/4, 1/2) y su decimal, con el «VD
 *      actual» de la criatura elegida escrito por la página.
 *  25. `tools/test/pantalla.mjs`: que la pantalla del DM publique las reglas de
 *      combate del 5.2.1 —las que el SRD de 2024 dejó en el glosario—, que
 *      cada categoría del catálogo tenga su panel entero y que la lista viva en
 *      `src/lib/pantalla.ts`, que lanza si una regla se queda sin panel.
 *  26. `tools/test/humo-espera.mjs`: que las pestañas del humo esperen a la
 *      carga de la página —no a 800 ms de reloj— y se cierren, que es lo que
 *      hacía intermitente la comprobación de la tarjeta social. Usa pestañas
 *      falsas, así que no necesita navegador.
 *  27. `tools/test/pies.py`: que el pie de página del PDF no se cuele en el
 *      texto de las fichas. Da por buenas las líneas crudas del PDF —con su
 *      número de página delante, en su propia línea y partiendo una frase— y
 *      comprueba que `srd/pies.py` las quita y vuelve a unir el párrafo, que
 *      `quita_pies` no toca ni una tabla, y que `plain_bodies` no publica el
 *      pie ni pierde el texto que venía detrás.
 *  28. `tools/test/acciones.py`: que el texto de un rasgo o una acción no quede
 *      cortado a media frase. `paragraphs()` parte el párrafo de más cuando la
 *      continuación de un rótulo unido conserva la `y` de la primera línea o
 *      cuando llega sangrada, y `_split_feature()` descarta en silencio el trozo
 *      que se queda suelto: la ficha publica la mitad de la acción sin que nada
 *      falle. Comprueba los dos cortes con sus líneas crudas y barre `data/`.
 *  29. `tools/test/cambios.mjs`: que el párrafo con el que `/cambios/` explica la
 *      coincidencia del comparador describa el criterio que aplica el código.
 *  30. `tools/test/huerfanos-tools.mjs`: que la puerta de huérfanos mire también
 *      `tools/ingest/` y `tools/verify/` —un `.py` de allí que nadie importa y
 *      que no declara `__main__` es código muerto— y que lo haga sin escribir en
 *      el repositorio: monta su árbol en un directorio temporal.
 *  31. `tools/test/botin.mjs`: que el botín de `/mesa/` reparta los objetos del
 *      catálogo que la página anuncia (el 5.2.1) y que ninguna rareza del
 *      selector se quede con un solo objeto.
 *  32. `tools/test/catalogo.mjs`: que el constructor de encuentros diga que el
 *      catálogo no ha llegado en vez de contestar que la criatura no existe.
 *  33. `tools/test/commander.mjs`: que el parser del export de Moxfield, los
 *      roles, la legalidad, el bracket, el resolver de mazos y el plazo de las
 *      llamadas de red de la herramienta de Commander sigan cumpliendo lo que
 *      prometen.
 *  34. `tools/test/tarjetas.mjs` sobre `dist/`: que la tarjeta emergente pida su
 *      índice delgado (`/datos/<edición>-tarjetas.json`) y no el catálogo
 *      entero, que se quede por debajo de 60 000 B, que cubra cada ficha
 *      enlazada con `data-tarjeta` y que cada valor sea el del catálogo.
 *  35. `tools/test/objetos.py`: que el cuerpo de una ficha de objeto no acabe
 *      donde acaba la página del PDF. Siete fichas se cortan a media frase
 *      (`…Una vez que`, `…Sin embargo,`, `…alrededor de tu`) y una lleva dentro
 *      la tabla de otro objeto; el paso busca literal el texto que falta, mira
 *      que la tabla siga en la ficha a la que pertenece y veta el final en
 *      palabra funcional suelta, que es la firma del corte.
 *
 * Si `dist/` no existe (clon recién hecho), compila el sitio antes del segundo
 * paso. El intérprete se puede forzar con `PYTHON=/ruta/python`.
 */
import path from "node:path";
import { RAIZ, asegurarDist, ejecutar, interpretePython } from "./comun.mjs";

const python = interpretePython();

console.log(`▶ Datos: validar.py (${python})`);
const datos = ejecutar(python, [path.join(RAIZ, "tools/verify/validar.py")]);
if (datos !== 0) {
  console.error("✗ Los datos no pasan la validación.");
  process.exit(datos);
}

asegurarDist();

console.log("▶ Enlaces internos: enlaces.mjs (dist/)");
const enlaces = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/enlaces.mjs")]);
if (enlaces !== 0) {
  console.error("✗ Hay enlaces internos rotos.");
  process.exit(enlaces);
}

console.log("▶ Ids únicos: ids.mjs (dist/)");
const ids = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/ids.mjs")]);
if (ids !== 0) {
  console.error("✗ Hay páginas con id repetidos.");
  process.exit(ids);
}

console.log("▶ Filtro de los listados: filtro.mjs (dist/)");
const filtro = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/filtro.mjs")]);
if (filtro !== 0) {
  console.error("✗ El filtro de texto de los listados no pliega tildes.");
  process.exit(filtro);
}

console.log("▶ Filtro Tamaño del bestiario: tamano.mjs (dist/)");
const tamano = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/tamano.mjs")]);
if (tamano !== 0) {
  console.error("✗ El filtro Tamaño del bestiario parte las grafías del tamaño o pierde criaturas.");
  process.exit(tamano);
}

console.log("▶ Alineación del comparador: diff.mjs (src/lib/)");
const diff = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/diff.mjs")]);
if (diff !== 0) {
  console.error("✗ La alineación del comparador empareja un encabezado con un párrafo.");
  process.exit(diff);
}

console.log("▶ Columnas sin datos: columnas.mjs (dist/)");
const columnas = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/columnas.mjs")]);
if (columnas !== 0) {
  console.error("✗ Algún listado publica una columna vacía o desalineada.");
  process.exit(columnas);
}

console.log("▶ Icono de la banda: iconos.mjs (dist/)");
const iconos = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/iconos.mjs")]);
if (iconos !== 0) {
  console.error("✗ Alguna ficha sale sin el icono de su banda.");
  process.exit(iconos);
}

console.log("▶ Alias inglés de las fichas: alias.mjs (dist/)");
const alias = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/alias.mjs")]);
if (alias !== 0) {
  console.error("✗ Alguna ficha publica un alias que no es el suyo.");
  process.exit(alias);
}

console.log("▶ Combate guardado: iniciativa.mjs (src/lib/)");
const iniciativa = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/iniciativa.mjs")]);
if (iniciativa !== 0) {
  console.error("✗ La iniciativa guardada no se lee igual en la mesa y en la vista de jugador.");
  process.exit(iniciativa);
}

console.log("▶ Módulos y exports sin uso: huerfanos.mjs (src/lib/)");
const huerfanos = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/huerfanos.mjs")]);
if (huerfanos !== 0) {
  console.error("✗ Hay módulos o símbolos exportados en src/lib/ que no usa nadie.");
  process.exit(huerfanos);
}

console.log("▶ Tipografías acreditadas: fuentes.mjs (src/ y dist/)");
const fuentes = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/fuentes.mjs")]);
if (fuentes !== 0) {
  console.error("✗ La atribución de tipografías no coincide con lo que carga el sitio.");
  process.exit(fuentes);
}

console.log("▶ Línea de tipo del perfil: tipo.py (tools/ingest/srd/monsters.py)");
const tipo = ejecutar(python, [path.join(RAIZ, "tools/test/tipo.py")]);
if (tipo !== 0) {
  console.error("✗ La línea de tipo de las criaturas se parte mal: el tamaño, los tags o el alineamiento acaban en el campo de al lado.");
  process.exit(tipo);
}

console.log("▶ Metadatos sociales: seo.mjs (dist/)");
const seo = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/seo.mjs")]);
if (seo !== 0) {
  console.error("✗ Alguna página publica mal la canónica, el og:type o la tarjeta social.");
  process.exit(seo);
}

console.log("▶ Nombres repetidos: duplicados.py (data/)");
const duplicados = ejecutar(python, [path.join(RAIZ, "tools/test/duplicados.py")]);
if (duplicados !== 0) {
  console.error("✗ Dos fichas de la misma carpeta y categoría comparten nombre: el listado publica filas indistinguibles.");
  process.exit(duplicados);
}

console.log("▶ Títulos únicos por sección: titulos.mjs (dist/)");
const titulos = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/titulos.mjs")]);
if (titulos !== 0) {
  console.error("✗ Hay páginas de secciones distintas con el mismo título: la pestaña y el resultado de búsqueda no las distinguen.");
  process.exit(titulos);
}

console.log("▶ Cifras de los informes: cifras.py (data/ y dist/datos/)");
const cifras = ejecutar(python, [path.join(RAIZ, "tools/test/cifras.py")]);
if (cifras !== 0) {
  console.error("✗ Los informes declaran recuentos que no cuadran con los datos.");
  process.exit(cifras);
}

console.log("▶ Apartados del comparador: secciones.mjs (dist/)");
const secciones = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/secciones.mjs")]);
if (secciones !== 0) {
  console.error("✗ Hay apartados de una edición que no se publican en su página de comparación.");
  process.exit(secciones);
}

console.log("▶ Presupuesto de encuentros: presupuesto.mjs (src/lib/ y data/)");
const presupuesto = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/presupuesto.mjs")]);
if (presupuesto !== 0) {
  console.error("✗ El presupuesto de PX del constructor no coincide con la tabla del SRD.");
  process.exit(presupuesto);
}

console.log("▶ Emparejamiento entre ediciones: emparejar.mjs (data/ y src/lib/)");
const emparejar = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/emparejar.mjs")]);
if (emparejar !== 0) {
  console.error("✗ El comparador empareja objetos distintos o deja entradas sin comparar.");
  process.exit(emparejar);
}

console.log("▶ Markdown que se copia: markdown.mjs (dist/)");
const markdown = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/markdown.mjs")]);
if (markdown !== 0) {
  console.error("✗ El Markdown que copia el botón «Copiar Markdown» repite la unidad del PX.");
  process.exit(markdown);
}

console.log("▶ Gastos del SRD 5.2.1: gastos.mjs (data/ y dist/)");
const gastos = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/gastos.mjs")]);
if (gastos !== 0) {
  console.error("✗ La ficha de gastos del SRD 5.2.1 no publica sus tres tablas con sus filas y sus precios.");
  process.exit(gastos);
}

console.log("▶ Bytecode de Python versionado: bytecode.mjs (índice de git)");
const bytecode = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/bytecode.mjs")]);
if (bytecode !== 0) {
  console.error("✗ El repositorio versiona bytecode de Python: deja el árbol sucio en cuanto se importa un módulo.");
  process.exit(bytecode);
}

console.log("▶ Búsqueda de criaturas sin tilde y VD fraccionarios: ajustar.mjs (dist/datos/ y src/lib/)");
const ajustar = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/ajustar.mjs")]);
if (ajustar !== 0) {
  console.error("✗ «Ajustar una criatura» no encuentra las criaturas cuyo nombre lleva tilde cuando se escribe sin ella, o no acepta los VD fraccionarios del catálogo.");
  process.exit(ajustar);
}

console.log("▶ Reglas de la pantalla del DM: pantalla.mjs (data/ y dist/)");
const pantalla = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/pantalla.mjs")]);
if (pantalla !== 0) {
  console.error("✗ La pantalla del DM no publica las reglas que dice publicar o descarta alguna en silencio.");
  process.exit(pantalla);
}

console.log("▶ Pestañas del humo: humo-espera.mjs (tools/test/cdp.mjs)");
const humoEspera = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/humo-espera.mjs")]);
if (humoEspera !== 0) {
  console.error("✗ Las pestañas del humo no esperan a la carga o no se cierran: la tarjeta social volverá a dar rojo espurio.");
  process.exit(humoEspera);
}

console.log("▶ Pie de página del PDF: pies.py (tools/ingest/srd/pies.py)");
const pies = ejecutar(python, [path.join(RAIZ, "tools/test/pies.py")]);
if (pies !== 0) {
  console.error("✗ El pie de página del PDF se publica dentro del texto de las fichas o se lleva el final del párrafo.");
  process.exit(pies);
}

console.log("▶ Texto de rasgos y acciones: acciones.py (tools/ingest/srd/ y data/)");
const acciones = ejecutar(python, [path.join(RAIZ, "tools/test/acciones.py")]);
if (acciones !== 0) {
  console.error("✗ Hay rasgos o acciones cortados a media frase: la ficha publica la mitad del texto y el resto se pierde.");
  process.exit(acciones);
}

console.log("▶ Texto de la página de cambios: cambios.mjs (dist/ y src/lib/)");
const cambios = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/cambios.mjs")]);
if (cambios !== 0) {
  console.error("✗ El texto de /cambios/ describe un criterio de emparejamiento distinto del que aplica el código.");
  process.exit(cambios);
}

console.log("▶ Huérfanos de tools/: huerfanos-tools.mjs (tools/ingest/ y tools/verify/)");
const huerfanosTools = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/huerfanos-tools.mjs")]);
if (huerfanosTools !== 0) {
  console.error("✗ La puerta de huérfanos no vigila los módulos de tools/: un módulo muerto de la ingesta se queda ahí pareciendo la referencia.");
  process.exit(huerfanosTools);
}

console.log("▶ Botín de la Mesa: botin.mjs (dist/ y data/ed52/)");
const botin = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/botin.mjs")]);
if (botin !== 0) {
  console.error("✗ El botín de /mesa/ no reparte el catálogo que la página anuncia: faltan objetos del 5.2.1 o una rareza se queda con uno solo.");
  process.exit(botin);
}

console.log("▶ Catálogo caído del constructor de encuentros: catalogo.mjs (src/lib/ y dist/datos/)");
const catalogoCaido = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/catalogo.mjs")]);
if (catalogoCaido !== 0) {
  console.error("✗ Con el catálogo caído el constructor de encuentros se queda mudo o culpa al nombre escrito.");
  process.exit(catalogoCaido);
}

console.log("▶ Herramienta de Commander: commander.mjs (src/lib/commander/)");
const commander = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/commander.mjs")]);
if (commander !== 0) {
  console.error("✗ El parser del export, los roles, la legalidad, el bracket o el resolver de mazos de Commander han dejado de cumplir lo que prometen.");
  process.exit(commander);
}

console.log("▶ Tarjetas emergentes: tarjetas.mjs (dist/)");
const tarjetas = ejecutar(process.execPath, [path.join(RAIZ, "tools/test/tarjetas.mjs")]);
if (tarjetas !== 0) {
  console.error("✗ La tarjeta emergente se lleva el catálogo entero o su índice no cubre las fichas enlazadas con el dato que pinta.");
  process.exit(tarjetas);
}

console.log("▶ Fichas de objetos completas: objetos.py (data/)");
const objetos = ejecutar(python, [path.join(RAIZ, "tools/test/objetos.py")]);
if (objetos !== 0) {
  console.error("✗ Alguna ficha de objeto se corta a media frase en el salto de página o lleva dentro el texto de otro objeto.");
  process.exit(objetos);
}

console.log("✓ Datos, enlaces, ids, filtro, filtro de tamaño, alineación del comparador, columnas, iconos, alias, iniciativa, código muerto, fuentes, línea de tipo, metadatos sociales, nombres repetidos, títulos únicos por sección, cifras de los informes, apartados del comparador, presupuesto de encuentros, emparejamiento entre ediciones, gastos del 5.2.1, Markdown copiado, bytecode sin versionar, búsqueda de criaturas sin tilde, reglas de la pantalla del DM, espera de carga de las pestañas del humo, pie de página del PDF, texto de rasgos y acciones sin cortar, texto de la página de cambios correcto, botín de la Mesa del 5.2.1, el aviso del catálogo caído del constructor de encuentros, la puerta de huérfanos mirando tools/, la herramienta de Commander (export, roles, legalidad y bracket), el índice delgado de la tarjeta emergente y las fichas de objetos completas)");
