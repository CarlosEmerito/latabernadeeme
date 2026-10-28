#!/usr/bin/env python3
"""Recompone las fichas de objetos cuyo cuerpo se cortó en el salto de página o de columna.

El cuerpo de un objeto tiene que seguir en la columna o la hoja siguiente, y en algunas fichas
no lo hace: `pocion-de-veneno` acaba en «Sin embargo,» y no llega a decir el daño ni la CD,
`piedra-ioun` se queda sin ocho de sus piedras, `estatuilla-de-poder-maravilloso` pierde las
cabras de marfil y el resto de estatuillas, y `varita-de-detectar-enemigos` lleva dentro la
tabla de d100 de `varita-de-las-maravillas`, que no es suya.

La causa está en el texto linealizado del PDF (`.cache/srd/work/es5x.txt`): en las páginas a dos
columnas el flujo entrega primero los dos nombres y después los dos cuerpos, así que cortar «del
nombre al nombre siguiente» se lleva el trozo del objeto vecino, y cuando el pie de página cae a
media frase se queda fuera el final del párrafo. `data/` no se regenera con el parser (cambia
cientos de fichas por motivos que no son este arreglo), así que las fichas se reparan aquí, una a
una, con el texto literal del SRD.

Este script es la reparación: cada cuerpo de `CUERPOS` está compuesto con el texto del `.cache`
(flujo por coordenadas `(page, col, y)` y texto lineal, cruzados ficha a ficha) y se comprueba
contra el vocabulario de la fuente antes de escribirlo, para que `data/` no gane texto que no esté
en el SRD. No toca el frontmatter.

Uso:
  python3 tools/ingest/reparar_objetos_cortados.py            # repara data/
  python3 tools/ingest/reparar_objetos_cortados.py --check    # solo comprueba, no escribe
"""
from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DATOS = RAIZ / "data"
WORK = RAIZ / ".cache" / "srd" / "work"
LETRAS = "A-Za-z\u00c0-\u017f"

CUERPOS: dict[str, str] = {
    'ed51/anillo-de-proteccion': (
        '\nRecibes un bonificador de +1 a la CA y a las tiradas de salvación mientras lleves puesto este anillo.'
    ),
    'ed51/anillo-de-salto': (
        '\nMientras lleves puesto este anillo, podrás lanzar a voluntad el conjuro salto desde él como acción adicional, pero solo podrás ser tú el objetivo.'
    ),
    'ed51/anteojos-de-vista-de-aguila': (
        'Estas lentes de cristal cubren los ojos. Mientras las lleves puestas, tendrás ventaja en las pruebas de Sabiduría (Percepción) que dependan de la vista. En condiciones de buena visibilidad, podrás ver detalles de criaturas y objetos muy lejanos de incluso 60 cm de diámetro.'
    ),
    'ed51/cimitarra-de-velocidad': (
        'Recibes un bonificador de +2 a las tiradas de ataque y de daño que hagas con esta arma mágica. Además, puedes realizar un ataque con ella como acción adicional en cada uno de tus turnos.'
    ),
    'ed51/colgante-de-inmunidad-al-veneno': (
        'Esta elegante cadena de plata tiene un colgante con una gema negra de talla brillante. Mientras la lleves puesta, los venenos no te afectan. Eres inmune al estado de envenenado y tienes inmunidad al daño de veneno.'
    ),
    'ed51/estatuilla-de-poder-maravilloso': (
        '\nObjeto maravilloso, rareza según estatuilla Una estatuilla de poder maravilloso es una pequeña escultura de una bestia que cabe en un bolsillo.\n\nSi usas una acción para pronunciar la palabra de activación y lanzar la estatuilla a un punto del suelo a 18 m o menos de ti, la estatuilla se convierte en una criatura viva. Si el lugar donde tendría que aparecer la criatura está ocupado por otras criaturas u objetos, o si no hay suficiente espacio para la criatura, la estatuilla no se convertirá en una criatura.\n\nLa criatura es amistosa contigo y tus compañeros Entiende tus idiomas y obedece tus órdenes verbales.\n\nSi no le das ninguna orden, la criatura se defiende a sí misma, pero no realiza ninguna otra acción.\n\nLa criatura existirá durante el tiempo específico de cada estatuilla. Cuando acabe ese tiempo, la criatura volverá a su forma de estatuilla. Recuperará la forma de estatuilla antes si sus puntos de golpe se reducen a 0 o si usas una acción para pronunciar una palabra de activación de nuevo mientras la tocas. Cuando la criatura recupere su forma de estatuilla, su propiedad no puede volver a usarse hasta que pase un tiempo determinado, según se especifica en la descripción de la estatuilla.\n\nBúho de serpentina (raro). Esta estatuilla de serpentina de un búho puede convertirse en un búho gigante durante 8 horas, como máximo. Una vez que se utilice, no podrá volver a usarse hasta que hayan pasado 2 días. El búho puede comunicarse telepáticamente contigo a cualquier distancia siempre que estéis en el mismo plano de existencia.\n\nCabras de marfil (raras). Las estatuillas de marfil con forma de cabra siempre se crean de tres en tres. Cada cabra posee un aspecto único y funciona de forma distinta a las demás. Sus propiedades son las siguientes:\n\n• La cabra de viaje puede convertirse en una cabra Grande con el mismo perfil que un caballo de monta. Tiene 24 cargas y cada hora o porción de hora que pase con forma de bestia cuesta 1 carga. Mientras posea cargas, puedes usarla tantas veces como quieras. Cuando se quede sin cargas, se convertirá de nuevo en estatuilla y no podrá volver a usarse hasta que hayan pasado 7 días, momento en el que recuperará todas sus cargas.\n\n• La cabra de trabajo se convierte en una cabra gigante durante 3 horas, como máximo. Una vez que se utilice, no podrá volver a usarse hasta que hayan pasado 30 días.\n\n• La cabra del terror se convierte en una cabra gigante durante 3 horas, como máximo. La cabra no puede atacar, pero puedes quitarle los cuernos y emplearlos como armas. Un cuerno se convierte en una lanza +1 y el otro se convierte en una espada larga +2. Quitarle un cuerno requiere una acción, y las armas desaparecen y los cuernos regresan a su sitio cuando la cabra recupera su forma de estatuilla. Además, la cabra irradia un aura de terror con un radio de 9 m mientras la uses de montura. Todas las criaturas hostiles hacia ti que empiecen su turno en el aura deberán superar una tirada de salvación de Sabiduría con CD 15 o quedarán asustadas de la cabra durante 1 minuto o hasta que la cabra recupere la forma de estatuilla. Una criatura asustada puede repetir la tirada de salvación al final de cada uno de sus turnos y, si tiene éxito, se librará del efecto.\n\nLas criaturas que superen esta tirada de salvación serán inmunes al aura de la cabra durante las siguientes 24 horas. Una vez que se utilice la estatuilla, no podrá volver a usarse hasta que hayan pasado 15 días.\n\nCorcel de obsidiana (muy raro). Este caballo de obsidiana puede convertirse en una pesadilla durante 24 horas, como máximo. La pesadilla solo luchará para defenderse. Una vez que se utilice, no podrá volver a usarse hasta que hayan pasado 5 días.\n\nSi tu alineamiento es bueno, cada vez que la utilices, la estatuilla tiene un 10 % de probabilidad de ignorar tus órdenes, incluida la de recuperar la forma de estatuilla. Si montas en la pesadilla mientras hace caso omiso a tus órdenes, la pesadilla y tú os transportaréis de inmediato a un lugar aleatorio del plano de Hades, donde recuperará su forma de estatuilla.\n\nCuervo de plata (infrecuente). Esta estatuilla de plata de un cuervo puede convertirse en un cuervo durante 12 horas, como máximo. Una vez que se utilice, no podrá volver a usarse hasta que hayan pasado 2 días. Mientras tenga la forma de cuervo, la estatuilla te permitirá lanzar el conjuro mensajero animal sobre ella a voluntad.\n\nElefante de mármol (raro). Esta estatuilla de mármol mide 10 cm de alto y de largo. Puede convertirse en un elefante durante 24 horas, como máximo. Una vez que se utilice, no podrá volver a usarse hasta que hayan pasado 7 días.\n\nGrifo de bronce (raro). Se trata de la estatuilla de bronce de un grifo rampante. Puede convertirse en grifo durante 6 horas, como máximo. Una vez que se utilice, no podrá volver a usarse hasta que hayan pasado 5 días.\n\nLeones dorados (raros). Estas estatuillas de oro de leones siempre se crean en parejas. Puedes utilizar una estatuilla o las dos al mismo tiempo. Cada una puede convertirse en un león durante 1 hora, como máximo. Una vez que se utilice cada estatuilla, no podrá volver a usarse hasta que hayan pasado 7 días.\n\nMosca de ébano (rara). Esta estatuilla de ébano se ha tallado con la forma de un tábano. Puede convertirse en una mosca gigante durante 12 horas, como máximo, y se puede emplear como montura. Una vez que se utilice, no podrá volver a usarse hasta que hayan pasado 2 días.\n\n## Mosca gigante\n\nBestia Grande, sin alineamiento\n\nClase de Armadura: 11\n\nPuntos de golpe: 19 (3d10 + 3)\n\nVelocidad: 9 m, volar 18 m\n\nFUE DES CON INT SAB CAR\n\n14 (+2) 13 (+1) 13 (+1) 2 (−4) 10 (+0) 3 (−4)\n\nSentidos: visión en la oscuridad 18 m, Percepción pasiva 10\n\nIdiomas: —\n\nPerro de ónice (raro). Esta estatuilla de ónice de un perro puede convertirse en un mastín durante 6 horas, como máximo. El mastín tiene una Inteligencia de 8 y puede hablar común. También tiene visión en la oscuridad hasta 18 m y puede ver criaturas y objetos invisibles dentro de ese alcance.\n\nUna vez que se utilice, no podrá volver a usarse hasta que hayan pasado 7 días.'
    ),
    'ed51/filo-de-la-fortuna': (
        'Recibes un bonificador de +1 a las tiradas de ataque y de daño que hagas con esta arma mágica. Mientras lleves la espada contigo, también obtendrás un bonificador de +1 a las tiradas de salvación. Deseo. La espada tiene 1d4 – 1 cargas. Mientras la empuñes, podrás usar una acción para gastar 1 carga y lanzar el conjuro deseo desde ella. Esta propiedad no podrá volver a usarse hasta el siguiente amanecer. La espada pierde esta propiedad si no le quedan cargas. Fortuna. Si llevas la espada contigo, puedes recurrir a su fortuna (no requiere acción) para repetir una tirada de ataque, una prueba de característica o una tirada de salvación desfavorable. Deberás usar el nuevo resultado. Esta propiedad no podrá volver a usarse hasta el siguiente amanecer.'
    ),
    'ed51/gema-del-resplandor': (
        'Este prisma tiene 50 cargas. Mientras lo sostienes, puedes usar una acción para pronunciar una de las tres palabras de activación y causar uno de los siguientes efectos: • La primera palabra de activación hace que la gema\n\nemita luz brillante en un radio de 9 m y luz tenue\n\n9 m más allá. Este efecto no gasta una carga. Dura\n\nhasta que utilices una acción adicional para repetir\n\nla palabra de activación o hasta que emplees otra\n\nfunción de la gema. • La segunda palabra de activación gasta 1 carga\n\ny hace que la gema dispare un rayo brillante de\n\nluz contra una criatura que puedas ver a 18 m\n\no menos de ti. La criatura deberá superar una\n\ntirada de salvación de Constitución con CD 15\n\no quedará cegada durante 1 minuto. La criatura\n\npuede repetir la tirada de salvación al final de cada\n\nuno de sus turnos y, si tiene éxito, se librará del\n\nefecto. • La tercera palabra de activación gasta 5 cargas\n\ny hace que la gema refulja con una luz cegadora\n\nque se extiende en un cono de 9 m. Todas las\n\ncriaturas situadas en el cono deberán realizar una\n\ntirada de salvación como si les hubiera afectado el\n\nrayo creado por la segunda palabra de activación. Cuando todas las cargas de la gema se gasten, se convertirá en una joya no mágica con un valor de 50 po.'
    ),
    'ed51/pocion-de-encoger': (
        '\nCuando bebas esta poción, obtendrás el efecto de “reducir” del conjuro agrandar/reducir durante 1d4 horas (no requiere concentración). El color rojo del líquido de la poción se contrae continuamente hasta quedar reducido a una gota diminuta y, a continuación, se expande para teñir el líquido transparente que la rodea. Si agitas la botella, no se interrumpirá el proceso.'
    ),
    'ed51/portal-cubico': (
        'Este cubo mide 7,5 cm de lado e irradia una energía mágica palpable. Cada una de las seis caras del cubo está conectada con un plano de existencia diferente, entre ellos el Plano Material. El resto de planos los determina tu GM.\n\nPuedes utilizar una acción para pulsar un lado del cubo y lanzar el conjuro portal, de forma que se abra un portal hacia el plano conectado con esa cara. De forma alternativa, si utilizas una acción para pulsar una cara dos veces, puedes lanzar el conjuro desplazamiento entre planos (CD de salvación 17) con el cubo y transportar a los objetivos al plano conectado con esa cara.\n\nEl cubo tiene 3 cargas. Cada uso gasta 1 carga. El cubo recupera 1d3 cargas empleadas cada día, al amanecer.'
    ),
    'ed51/talisman-de-la-esfera': (
        'Objeto maravilloso, legendario (requiere sintonización) Cuando hagas una prueba de Inteligencia (Conocimiento Arcano) para controlar una esfera de aniquilación mientras sostienes este talismán, duplicarás tu bonificador por competencia en la prueba. Además, cuando comiences tu turno con el control de una esfera de aniquilación, podrás usar una acción para hacer que levite 3 m más una cantidad de metros adicionales igual a 3 × tu modificador por Inteligencia.'
    ),
    'ed51/varita-de-bolas-de-fuego': (
        'Esta varita tiene 7 cargas. Mientras la empuñes, podrás usar una acción y gastar 1 o más de sus cargas para lanzar el conjuro (CD de bola de fuego salvación 15) desde ella. Si empleas 1 carga, podrás lanzar la versión de nivel 3 del conjuro. Puedes aumentar el nivel del espacio de conjuro en 1 por cada carga adicional que emplees.\n\nLa varita recupera 1d6 + 1 cargas empleadas cada día, al amanecer. Si gastas la última carga de la varita, tira 1d20. Si el resultado es 1, la varita se convierte en cenizas y se destruye.'
    ),
    'ed51/varita-de-detectar-enemigos': (
        'Esta varita tiene 7 cargas. Mientras la empuñes, podrás usar una acción y gastar 1 carga para pronunciar su palabra de activación. Durante el siguiente minuto, conocerás la dirección en la que se encuentra la criatura hostil más cercana a ti que esté a 18 m o menos, pero no la distancia exacta. La varita puede percibir la presencia de criaturas hostiles que sean etéreas o invisibles o estén disfrazadas o escondidas, así como las que se detecten a simple vista. El efecto acaba si dejas de empuñar la varita.\n\nLa varita recupera 1d6 + 1 cargas empleadas cada día, al amanecer. Si gastas la última carga de la varita, tira 1d20. Si el resultado es 1, la varita se convierte en cenizas y se destruye.'
    ),
    'ed52/anillo-de-comandar-elementales': (
        '\nAnillo, legendario (requiere sintonización)\n\nTodos los anillos de comandar elementales están vinculados a uno de los cuatro Planos Elementales;\n\ntu GM elige a cuál de ellos o lo determina al azar.\n\nPor ejemplo, un anillo de comandar elementales (aire) está vinculado al Plano Elemental del Aire.\n\nCada anillo de comandar elementales tiene las dos siguientes propiedades:\n\nCompulsión elemental. Mientras lo lleves puesto, puedes emplear una acción de magia para intentar doblegar a un elemental que puedas ver a 18 m o menos de ti. El elemental hace una tirada de salvación de Sabiduría con CD 18. Si la falla, tendrá el estado de hechizado hasta el principio de tu siguiente turno y tú decidirás qué hace con su movimiento y acción en su siguiente turno.\n\nPerdición elemental. Mientras lo lleves puesto, tendrás ventaja en las tiradas de ataque contra elementales y ellos tendrán desventaja en las tiradas de ataque contra ti.\n\nConcentración elemental. Mientras lleves puesto el anillo, te beneficias de las propiedades adicionales correspondientes al Plano Elemental vinculado al anillo:\n\nAgua. Sabes hablar acuano, obtienes una velocidad nadando de 18 m y puedes respirar bajo el agua.\n\nAire. Sabes hablar aurano, tienes resistencia al daño de relámpago y una velocidad volando igual a tu velocidad y puedes levitar.\n\nFuego. Sabes hablar ígneo y tienes inmunidad al daño de fuego.\n\nTierra. Sabes hablar terrano y tienes resistencia al daño de ácido. El terreno compuesto por escombros, rocas o tierra no cuenta como terreno difícil para ti. Además, puedes moverte a través de tierra sólida o roca como si estas superficies fueran terreno difícil sin alterar la materia que atraviesas. Si acabas tu turno en tierra sólida o roca, irás a parar al espacio sin ocupar más cercano en el que estuviste por última vez.\n\nLanzamiento de conjuros. El anillo tiene 5 cargas y recupera 1d4 + 1 cargas empleadas cada día, al amanecer. Mientras lleves puesto el anillo, puedes lanzar un conjuro desde él. Elige el conjuro de la lista de conjuros disponibles según el Plano Elemental vinculado al anillo, como se muestra en la tabla a continuación. En ella se indica cuántas cargas debes gastar para lanzar el conjuro, que tiene una CD de salvación de 18.\n\nPlano Conjuros (cargas)\n\nAgua Caminar sobre el agua (2 cargas), crear o destruir agua (1 carga), muro de hielo (3 cargas), tormenta de hielo (2 cargas), tsunami (5 cargas)\n\nAire Caída de pluma (0 cargas), muro de viento (1 carga), ráfaga de viento (2 cargas), relámpago en cadena (3 cargas)\n\nFuego Bola de fuego (2 cargas), manos ardientes (1 carga), muro de fuego (3 cargas), tormenta de fuego (4 cargas)\n\nTierra Moldear la piedra (2 cargas), muro de piedra (3 cargas), piel pétrea (3 cargas), terremoto (5 cargas)'
    ),
    'ed52/anillo-de-influencia-animal': (
        'Este anillo tiene 3 cargas y recupera 1d3 cargas empleadas cada día, al amanecer. Mientras lo lleves puesto, puedes gastar 1 carga para lanzar uno de los siguientes conjuros (CD de salvación 13) desde él:\n\n• Encantar animal\n\n• Hablar con los animales\n\n• Terror (solo afecta a bestias)'
    ),
    'ed52/anillo-de-los-tres-deseos': (
        '\nMientras lleves puesto este anillo, puedes gastar 1 de sus 3 cargas para lanzar deseo desde él. El anillo se volverá no mágico cuando utilices la última carga.'
    ),
    'ed52/anillo-de-retorno-de-conjuros': (
        '\nMientras lleves puesto este anillo, tienes ventaja en las tiradas de salvación contra conjuros. Si superas la tirada de un conjuro de nivel 7 o inferior, dicho conjuro no tendrá ningún efecto sobre ti. Si el conjuro solo te hacía objetivo a ti y no creó un área de efecto, puedes emplear una reacción para devolverle el conjuro al lanzador, que deberá hacer una tirada de salvación contra él usando su propia CD de salvación de conjuros.'
    ),
    'ed52/anteojos-de-encantamiento': (
        'Estas lentes de cristal cubren los ojos y tienen 3 cargas. Mientras las lleves puestas, puedes gastar 1 o más cargas para lanzar hechizar persona (CD de salvación 13). Si empleas 1 carga, podrás lanzar la versión de nivel 1 del conjuro. Aumentarás el nivel del conjuro en 1 por cada carga adicional que emplees. Las lentes recuperan todas las cargas empleadas cada día, al amanecer.'
    ),
    'ed52/bola-de-cristal-de-vision-veraz': (
        'Mientras tocas este orbe de cristal, puedes lanzar escudriñar (CD de salvación 17) desde él. Además, tienes visión verdadera en un radio de 36 m centrado en el sensor del conjuro.'
    ),
    'ed52/bolsa-de-contencion': (
        '\nObjeto maravilloso, infrecuente\n\nEsta bolsa posee un espacio interior considerablemente mayor que sus dimensiones exteriores: unos 60 cm de lado y 1,2 m de profundidad en el interior.\n\nLa bolsa puede contener hasta 250 kg, con un volumen máximo de 2 m3. La bolsa pesa 2,5 kg, independientemente de su contenido. Para sacar un objeto de la bolsa es necesaria una acción de utilizar.\n\nSi se sobrecarga, perfora o rasga la bolsa, esta se destruye y su contenido se dispersa por el Plano Astral. Si se pone la bolsa del revés, su contenido se vuelca sin sufrir daño, pero la bolsa debe volver a ponerse del derecho antes de usarla de nuevo.\n\nLa bolsa contiene aire suficiente para respirar durante 10 minutos, divididos entre el número de criaturas que necesiten respirar en su interior. Meter una bolsa de contención en el espacio extradimensional creado por un agujero portátil, un morral práctico o un objeto similar destruye instantáneamente ambos objetos y abre un portal al Plano Astral. El portal se crea en el sitio en el que un objeto se introdujo dentro del otro. El portal absorbe a todas las criaturas situadas en una esfera de 3 m de radio centrada en él y las conduce a un lugar aleatorio del Plano Astral. Después, el portal se cierra. El portal funciona en un sentido y no puede volver a abrirse.'
    ),
    'ed52/botas-de-velocidad': (
        'Mientras calces estas botas, podrás utilizar una acción adicional para entrechocar los talones. Si lo haces, las botas duplicarán tu velocidad y cualquier criatura que realice un ataque de oportunidad contra ti tendrá desventaja en la tirada de ataque. Si vuelves a entrechocar los talones, el efecto terminará.\n\nCuando hayas usado esta propiedad de las botas durante un total de 10 minutos, la magia dejará de funcionar para ti hasta que finalices un descanso largo.'
    ),
    'ed52/cuerda-enredadora': (
        'Esta cuerda mide 9 m de largo. Mientras sujetas uno de los extremos, puedes emplear una acción de magia para ordenarle al otro que salga volando y enrede a una criatura que puedas ver a 6 m o menos de ti. El objetivo deberá superar una tirada de salvación de Destreza con CD 15 o tendrá el estado de apresado. Puedes liberar al objetivo soltando tu extremo de la cuerda, lo que hará que se enrolle en el espacio del objetivo, o usando una acción adicional para repetir la orden, lo que hará que la cuerda se enrolle en tu mano.\n\nUn objetivo apresado por la cuerda puede usar una acción para hacer una prueba de Fuerza (Atletismo) o de Destreza (Acrobacias) con CD 15, a su elección. Si la supera, el objetivo dejará de estar apresado por la cuerda. Si todavía sostienes la cuerda cuando un objetivo se zafe de ella, podrás emplear una reacción para ordenarle a la cuerda que se enrolle en tu mano. Si no lo haces, se enrollará en el espacio del objetivo.\n\nLa cuerda tiene una CA de 20, 20 pg e inmunidad al daño psíquico y de veneno. Recupera 1 punto de golpe cada 5 minutos mientras tenga al menos 1 punto de golpe. Si los puntos de golpe de la cuerda se reducen a 0, se destruye.'
    ),
    'ed52/pergamino-de-conjuro': (
        '\nUn pergamino de conjuro contiene las palabras de un solo conjuro, escritas en un código místico. Si el conjuro está en tu lista de conjuros, puedes leer el pergamino y lanzar el conjuro sin componentes materiales. De lo contrario, el pergamino es ininteligible. Si lanzas el conjuro leyendo el pergamino, el tiempo de lanzamiento del conjuro será el habitual. Una vez lanzado, el pergamino se convierte en polvo. Si se interrumpe el lanzamiento, el pergamino no se pierde.\n\nSi el conjuro está en tu lista de conjuros pero es de un nivel superior que no puedes lanzar de manera normal, harás una prueba de característica usando tu aptitud mágica para determinar si consigues lanzarlo. La CD es de 10 más el nivel del conjuro. Si la fallas, el conjuro desaparecerá del pergamino y no surtirá efecto.\n\nEl nivel del conjuro del pergamino determina la CD de las tiradas de salvación y el bonificador de ataque del conjuro, además de la rareza del pergamino, como se indica en la siguiente tabla.\n\nNivel del CD de Bonificador\n\nconjuro Rareza salvación de ataque\n\nTruco Común 13 +5\n\n1 Común 13 +5\n\n2 Infrecuente 13 +5\n\n3 Infrecuente 15 +7\n\n4 Raro 15 +7\n\n5 Raro 17 +9\n\n6 Muy raro 17 +9\n\n7 Muy raro 18 +10\n\n8 Muy raro 18 +10\n\n9 Legendario 19 +11\n\n**Copiar un pergamino en un libro de conjuros.** Un conjuro de mago en un pergamino de conjuro puede copiarse en un libro de conjuros. Cuando un conjuro se copie de esta forma, el copista deberá superar una prueba de Inteligencia (Conocimiento arcano) con CD igual a 10 más el nivel del conjuro. Si la supera, copiará el conjuro. Supere o no la prueba, el pergamino de conjuro se destruirá.\n'
    ),
    'ed52/piedra-ioun': (
        'Las piedras Ioun son aproximadamente del tamaño de una cuenta y se llaman así por Ioun, un dios del conocimiento y la profecía adorado en algunos mundos. Existen muchos tipos de piedras Ioun, cada uno de ellos con una combinación distinta de forma y color.\n\nSi empleas una acción de magia para lanzar una piedra Ioun al aire, orbitará alrededor de tu cabeza a una distancia de 1d3 × 30 cm y te proporcionará un beneficio. Puedes tener hasta tres piedras Ioun orbitando activas a la vez.\n\nCada piedra Ioun que orbite a tu alrededor se considera un objeto que llevas puesto. Evitará el contacto con otras criaturas y objetos y modificará su órbita para prevenir colisiones y frustrar los intentos de otras criaturas de atacarlas o agarrarlas.\n\nComo acción de utilizar, puedes tomar y guardar cualquier cantidad de piedras Ioun que orbiten alrededor de tu cabeza. Si tu sintonización con una de ellas termina mientras está orbitando, la piedra caerá como si la hubieras soltado.\n\nEl tipo de piedra determina su rareza y efectos.\n\nAbsorción (muy rara). Mientras este elipsoide de color lila claro gire alrededor de tu cabeza, podrás emplear una reacción para cancelar un conjuro de nivel 4 o inferior lanzado por una criatura que puedas ver. Un conjuro cancelado no tendrá efecto y se perderán los recursos empleados para lanzarlo. En cuanto la piedra haya cancelado 20 niveles de conjuros, se volverá gris y perderá su magia.\n\nAbsorción mayor (legendaria). Mientras este elipsoide jaspeado en tonos lilas y verdes gire alrededor de tu cabeza, podrás emplear una reacción para cancelar un conjuro de nivel 8 o inferior lanzado por una criatura que puedas ver. Un conjuro cancelado no tendrá efecto y se perderán los recursos empleados para lanzarlo. En cuanto la piedra haya cancelado 20 niveles de conjuros, se volverá gris y perderá su magia.\n\nAgilidad (muy rara). Mientras esta esfera de color rojo intenso gire alrededor de tu cabeza, tu Destreza aumenta en 2, hasta un máximo de 20.\n\nConsciencia (rara). Mientras este romboide azul oscuro gire alrededor de tu cabeza, tienes ventaja en las tiradas de iniciativa y en las prueba de Sabiduría (Percepción).\n\nFortaleza (muy rara). Mientras este romboide rosa gire alrededor de tu cabeza, tu Constitución aumenta en 2, hasta un máximo de 20.\n\nFuerza (muy rara). Mientras este romboide azul pálido gire alrededor de tu cabeza, tu Fuerza aumenta en 2, hasta un máximo de 20.\n\nIntelecto (muy rara). Mientras esta esfera jaspeada en tonos rojos y azules gire alrededor de tu cabeza, tu Inteligencia aumenta en 2, hasta un máximo de 20.\n\nLiderazgo (muy rara). Mientras esta esfera jaspeada en tonos rosas y verdes gire alrededor de tu cabeza, tu Carisma aumenta en 2, hasta un máximo de 20.\n\nMaestría (legendaria). Mientras este prisma verde pálido gire alrededor de tu cabeza, tu bonificador por competencia aumenta en 1.\n\nPerspicacia (muy rara). Mientras esta esfera de color azul incandescente gire alrededor de tu cabeza, tu Sabiduría aumenta en 2, hasta un máximo de 20.\n\nProtección (rara). Mientras este prisma de color rosa polvoriento gire alrededor de tu cabeza, obtienes un bonificador de +1 a la clase de armadura.\n\nRegeneración (legendaria). Recuperas 15 puntos de golpe al final de cada hora que este huso de color blanco nacarado gire alrededor de tu cabeza si tienes al menos 1 punto de golpe.\n\nReserva (rara). Este prisma de color morado intenso almacena los conjuros que se lanzan sobre él hasta que quieras utilizarlos. La piedra puede guardar hasta 4 niveles de conjuros. Cuando la encuentres, contendrá 1d4 niveles de conjuros almacenados, a elección de tu GM. Cualquier criatura puede lanzar un conjuro de niveles 1 a 4 sobre la piedra si la toca mientras lanza el conjuro. El único efecto que tendrá el conjuro es que quedará almacenado en la piedra. Si la piedra no puede albergarlo, el conjuro se gastará sin efecto. El nivel del espacio utilizado para lanzar el conjuro determina cuánto espacio utiliza.\n\nMientras esta piedra gire alrededor de tu cabeza, podrás lanzar cualquiera de los conjuros almacenados. El conjuro utiliza el nivel del espacio, la CD de salvación de conjuros, el bonificador de ataque de conjuros y la aptitud mágica del lanzador original, pero, por lo demás, funciona como si tú lo hubieses lanzado. El conjuro lanzado desde la piedra deja de estar almacenado en ella, por lo que deja espacio libre.\n\nSustento (rara). No necesitas comer ni beber mientras este huso transparente gire alrededor de tu cabeza.'
    ),
    'ed52/pocion-de-veneno': (
        'Este mejunje parece, huele y sabe como una poción de curación u otra poción beneficiosa. Sin embargo, en realidad es un veneno enmascarado con magia de ilusionismo. Un conjuro identificar revelará su verdadera naturaleza.\n\nSi la bebes, sufrirás 4d6 de daño de veneno y deberás superar una tirada de salvación de Constitución con CD 13 o tendrás el estado de envenenado durante 1 hora.'
    ),
}


def leer(p: Path) -> tuple[str, str]:
    texto = p.read_text(encoding="utf-8")
    m = re.match(r"^---\r?\n[\s\S]*?\r?\n---\r?\n?", texto)
    if not m:
        raise SystemExit(f"{p}: sin frontmatter")
    return texto[: m.end()], texto[m.end() :]


def palabras(texto: str) -> Counter:
    return Counter(re.findall(r"[" + LETRAS + r"]+", texto.lower()))


def vocabulario_de(ed: str) -> Counter:
    """Todo el vocabulario del capítulo de objetos de esa edición."""
    plantilla = WORK / f"es{ed[-2:]}.txt"
    if not plantilla.exists():
        return Counter()
    return palabras(plantilla.read_text(encoding="utf-8", errors="replace"))


def main() -> int:
    seco = "--check" in sys.argv
    tocadas, avisos = 0, []
    for clave, cuerpo in CUERPOS.items():
        ed, slug = clave.split("/")
        ruta = DATOS / ed / "objetos" / f"{slug}.md"
        cabecera, actual = leer(ruta)
        nuevo = cuerpo.strip() + "\n"
        if re.sub(r"\s+", " ", actual).strip() == re.sub(r"\s+", " ", nuevo).strip():
            continue
        vocab = vocabulario_de(ed)
        if vocab:
            fuera = palabras(nuevo) - vocab
            if fuera:
                avisos.append(f"{clave}: palabras que no están en la fuente: {sorted(fuera)[:8]}")
                continue
        tocadas += 1
        print(f"  {'=' if seco else '✓'} {clave}: {len(actual)} -> {len(nuevo)} caracteres")
        if not seco:
            ruta.write_text(cabecera + "\n" + nuevo, encoding="utf-8")
    for a in avisos:
        print(f"  ✗ {a}")
    print(f"{'Fichas por reparar' if seco else 'Reparadas'}: {tocadas} de {len(CUERPOS)}")
    return 1 if (avisos or (seco and tocadas)) else 0


if __name__ == "__main__":
    raise SystemExit(main())
