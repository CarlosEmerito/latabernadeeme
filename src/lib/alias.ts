/**
 * Alias en inglés de los términos más buscados.
 *
 * Se escribe en la dirección inglés → español y se invierte al cargar. Cada
 * entrada apunta al nombre que el SRD en español da a esa ficha, no a una
 * traducción libre: hay 93 términos que estaban atados a un nombre que el SRD
 * no usa («Thunderwave» apuntaba a «Onda atronadora» y la ficha se llama «Ola
 * atronadora»), así que la línea «En inglés: …» no salía en ninguna página y
 * quien buscaba el conjuro en inglés no llegaba a él. `tools/test/alias.mjs`
 * vigila que toda entrada apunte a una ficha real y que toda ficha con un
 * término lo publique.
 *
 * Las tres tablas de abajo cubren los tres casos que el nombre solo no
 * resuelve:
 *
 *   - `INGLES`: el término inglés y el nombre español de la ficha, comunes a
 *     las dos ediciones.
 *   - `POR_EDICION`: los términos cuyo nombre español cambió entre el SRD 5.1
 *     (2014) y el 5.2.1 (2024), o cuya ficha solo existe en una de las dos.
 *   - `POR_FICHA`: las fichas cuyo nombre español lo comparten varias, o dos
 *     conjuros distintos en inglés que el SRD en español unificó en uno.
 */
const INGLES: Record<string, string> = {
  // Conjuros
  "Acid Splash": "Salpicadura ácida",
  "Aid": "Auxilio",
  "Animal Friendship": "Hablar con los animales",
  "Animate Dead": "Animar a los muertos",
  "Bane": "Perdición",
  "Banishment": "Destierro",
  "Bless": "Bendición",
  "Burning Hands": "Manos ardientes",
  "Charm Person": "Hechizar persona",
  "Chill Touch": "Toque helado",
  "Cloudkill": "Nube aniquiladora",
  "Command": "Orden imperiosa",
  "Comprehend Languages": "Entender idiomas",
  "Cone of Cold": "Cono de frío",
  "Confusion": "Confusión",
  "Control Water": "Controlar agua",
  "Counterspell": "Contrahechizo",
  "Cure Wounds": "Curar heridas",
  "Dancing Lights": "Luces danzantes",
  "Darkvision": "Visión en la oscuridad",
  "Detect Magic": "Detectar magia",
  "Detect Thoughts": "Detectar pensamientos",
  "Dimension Door": "Puerta dimensional",
  "Disintegrate": "Desintegrar",
  "Dispel Magic": "Disipar magia",
  "Fear": "Terror",
  "Feather Fall": "Caída de pluma",
  "Finger of Death": "Dedo de la muerte",
  "Fireball": "Bola de fuego",
  "Fly": "Volar",
  "Fog Cloud": "Nube de oscurecimiento",
  "Forcecage": "Jaula de fuerza",
  "Gaseous Form": "Forma gaseosa",
  "Greater Invisibility": "Invisibilidad mejorada",
  "Greater Restoration": "Restablecimiento mayor",
  "Guidance": "Guía",
  "Guiding Bolt": "Saeta guía",
  "Haste": "Acelerar",
  "Heal": "Curar",
  "Healing Word": "Palabra de curación",
  "Hold Person": "Inmovilizar persona",
  "Hunter's Mark": "Marca del cazador",
  "Ice Storm": "Tormenta de hielo",
  "Identify": "Identificar",
  "Inflict Wounds": "Infligir heridas",
  "Insect Plague": "Plaga de insectos",
  "Invisibility": "Invisibilidad",
  "Jump": "Salto",
  "Lesser Restoration": "Restablecimiento menor",
  "Light": "Luz",
  "Lightning Bolt": "Relámpago",
  "Longstrider": "Zancada prodigiosa",
  "Mage Armor": "Armadura de mago",
  "Mage Hand": "Mano de mago",
  "Magic Missile": "Proyectil mágico",
  "Mass Cure Wounds": "Curar heridas en masa",
  "Message": "Mensaje",
  "Meteor Swarm": "Tormenta de meteoritos",
  "Minor Illusion": "Ilusión menor",
  "Mirror Image": "Imagen múltiple",
  "Misty Step": "Paso brumoso",
  "Moonbeam": "Rayo de luna",
  "Pass without Trace": "Pasar sin rastro",
  "Polymorph": "Polimorfar",
  "Prayer of Healing": "Plegaria de curación",
  "Prestidigitation": "Prestidigitación",
  "Protection from Evil and Good": "Protección contra el bien y el mal",
  "Raise Dead": "Alzar a los muertos",
  "Remove Curse": "Levantar maldición",
  "Resurrection": "Resurrección",
  "Revivify": "Revivir",
  "Sacred Flame": "Llama sagrada",
  "Sanctuary": "Santuario",
  "Shield": "Escudo",
  "Shield of Faith": "Escudo de fe",
  "Silence": "Silencio",
  "Sleep": "Dormir",
  "Speak with Animals": "Hablar con los animales",
  "Spiritual Weapon": "Arma espiritual",
  "Suggestion": "Sugestión",
  "Teleport": "Teletransporte",
  "Thunderwave": "Ola atronadora",
  "Time Stop": "Parar el tiempo",
  "True Seeing": "Visión veraz",
  "True Strike": "Impacto certero",
  "Wall of Fire": "Muro de fuego",
  "Wall of Force": "Muro de fuerza",
  "Wall of Stone": "Muro de piedra",
  "Water Breathing": "Respirar bajo el agua",
  "Water Walk": "Caminar sobre el agua",
  "Web": "Telaraña",
  "Wish": "Deseo",

  // Monstruos
  "Aboleth": "Aboleth",
  "Adult Red Dragon": "Dragón rojo adulto",
  "Ancient Red Dragon": "Dragón rojo anciano",
  "Balor": "Balor",
  "Bandit": "Bandido",
  "Commoner": "Plebeyo",
  "Cultist": "Sectario",
  "Gelatinous Cube": "Cubo gelatinoso",
  "Giant Rat": "Rata gigante",
  "Giant Spider": "Araña gigante",
  "Guard": "Guardia",
  "Hydra": "Hidra",
  "Imp": "Diablillo",
  "Knight": "Caballero",
  "Kraken": "Kraken",
  "Lich": "Liche",
  "Mage": "Mago",
  "Mimic": "Mimeto",
  "Noble": "Noble",
  "Ogre": "Ogro",
  "Orc": "Orco",
  "Owlbear": "Oso lechuza",
  "Priest": "Sacerdote",
  "Pseudodragon": "Pseudodragón",
  "Quasit": "Quasit",
  "Roc": "Roc",
  "Skeleton": "Esqueleto",
  "Stirge": "Estirge",
  "Tarrasque": "Tarasca",
  "Troll": "Troll",
  "Vampire": "Vampiro",
  "Werewolf": "Hombre lobo",
  "Wolf": "Lobo",
  "Young Red Dragon": "Dragón rojo joven",
  "Zombie": "Zombi",

  // Objetos mágicos
  "Amulet of Health": "Amuleto de salud",
  "Bag of Holding": "Bolsa de contención",
  "Belt of Giant Strength": "Cinturón de fuerza de gigante",
  "Bracers of Defense": "Brazales de defensa",
  "Flame Tongue": "Lengua de fuego",
  "Gauntlets of Ogre Power": "Guanteletes de fuerza de ogro",
  "Holy Avenger": "Vengadora sagrada",
  "Oathbow": "Arco juramentado",
  "Potion of Healing": "Poción de curación",
  "Ring of Protection": "Anillo de protección",
  "Sphere of Annihilation": "Esfera de aniquilación",
  "Staff of Power": "Bastón de poder",
  "Sun Blade": "Espada solar",
  "Vorpal Sword": "Espada vorpal",
  "Wand of Magic Missiles": "Varita de proyectiles mágicos",

  // Ampliación: criaturas
  "Adult Blue Dragon": "Dragón azul adulto",
  "Adult Green Dragon": "Dragón verde adulto",
  "Adult White Dragon": "Dragón blanco adulto",
  "Adult Black Dragon": "Dragón negro adulto",
  "Ancient Blue Dragon": "Dragón azul anciano",
  "Ancient Green Dragon": "Dragón verde anciano",
  "Ancient White Dragon": "Dragón blanco anciano",
  "Ancient Black Dragon": "Dragón negro anciano",
  "Young Blue Dragon": "Dragón azul joven",
  "Young Green Dragon": "Dragón verde joven",
  "Young White Dragon": "Dragón blanco joven",
  "Young Black Dragon": "Dragón negro joven",
  "Ankheg": "Ankheg",
  "Basilisk": "Basilisco",
  "Chimera": "Quimera",
  "Cockatrice": "Cocatriz",
  "Ettin": "Ettin",
  "Gargoyle": "Gárgola",
  "Ghost": "Fantasma",
  "Gorgon": "Gorgon",
  "Griffon": "Grifo",
  "Harpy": "Arpía",
  "Hell Hound": "Sabueso infernal",
  "Hippogriff": "Hipogrifo",
  "Lamia": "Lamia",
  "Manticore": "Mantícora",
  "Medusa": "Medusa",
  "Mummy": "Momia",
  "Nightmare": "Pesadilla",
  "Ochre Jelly": "Gelatina ocre",
  "Pegasus": "Pegaso",
  "Phase Spider": "Araña de fase",
  "Purple Worm": "Gusano púrpura",
  "Rakshasa": "Rakshasa",
  "Remorhaz": "Remorhaz",
  "Salamander": "Salamandra",
  "Satyr": "Sátiro",
  "Shadow": "Sombra",
  "Shield Guardian": "Guardián escudo",
  "Specter": "Espectro",
  "Treant": "Ent",
  "Unicorn": "Unicornio",
  "Will-o'-Wisp": "Fuego fatuo",
  "Winter Wolf": "Lobo invernal",
  "Wyvern": "Guiverno",
  "Hill Giant": "Gigante de las colinas",
  "Stone Giant": "Gigante de piedra",
  "Frost Giant": "Gigante de escarcha",
  "Fire Giant": "Gigante de fuego",
  "Cloud Giant": "Gigante de las nubes",
  "Storm Giant": "Gigante de las tormentas",

  // Ampliación: conjuros
  "Alarm": "Alarma",
  "Animal Messenger": "Mensajero animal",
  "Arcane Lock": "Cerradura arcana",
  "Augury": "Augurio",
  "Barkskin": "Piel robliza",
  "Calm Emotions": "Calmar emociones",
  "Clairvoyance": "Clarividencia",
  "Color Spray": "Rociada de color",
  "Commune": "Comunión",
  "Compulsion": "Compulsión",
  "Contagion": "Contagio",
  "Continual Flame": "Llama permanente",
  "Create or Destroy Water": "Crear o destruir agua",
  "Creation": "Creación",
  "Daylight": "Luz del día",
  "Divine Favor": "Favor divino",
  "Dominate Beast": "Dominar bestia",
  "Dominate Person": "Dominar persona",
  "Dream": "Ensueño",
  "Elemental Weapon": "Gema elemental",
  "Enhance Ability": "Potenciar característica",
  "Enlarge/Reduce": "Agrandar/reducir",
  "Entangle": "Enmarañar",
  "Enthrall": "Cautiverio",
  "Etherealness": "Excursión etérea",
  "Fabricate": "Fabricar",
  "Faithful Hound": "Mastín fiel",
  "False Life": "Falsa vida",
  "Find Familiar": "Encontrar familiar",
  "Find Steed": "Hallar corcel",
  "Find the Path": "Encontrar el camino",
  "Flame Blade": "Hoja de fuego",
  "Flame Strike": "Golpe flamígero",
  "Flaming Sphere": "Esfera de llamas",
  "Flesh to Stone": "De la carne a la piedra",
  "Forbiddance": "Prohibición",
  "Freedom of Movement": "Libertad de movimiento",
  "Giant Insect": "Insecto gigante",
  "Glibness": "Labia",
  "Globe of Invulnerability": "Globo de invulnerabilidad",
  "Glyph of Warding": "Glifo custodio",
  "Goodberry": "Buenas bayas",
  "Grease": "Grasa",
  "Guardian of Faith": "Guardián de la fe",
  "Guards and Wards": "Guardas y guardias",
  "Hallow": "Consagrar",
  "Hallucinatory Terrain": "Terreno alucinatorio",
  "Heat Metal": "Calentar metal",
  "Heroism": "Heroísmo",
  "Hideous Laughter": "Risa horrible",
  "Hold Monster": "Inmovilizar monstruo",
  "Holy Aura": "Aura sagrada",
  "Hypnotic Pattern": "Patrón hipnótico",
  "Illusory Script": "Texto ilusorio",
  "Imprisonment": "Cautiverio",
  "Incendiary Cloud": "Nube incendiaria",
  "Knock": "Abrir",
  "Legend Lore": "Conocer las leyendas",
  "Levitate": "Levitar",
  "Locate Creature": "Localizar criatura",
  "Locate Object": "Localizar objeto",
  "Magic Circle": "Círculo mágico",
  "Magic Jar": "Urna mágica",
  "Magic Mouth": "Boca mágica",
  "Magic Weapon": "Arma mágica",
  "Major Image": "Imagen mayor",
  "Mass Suggestion": "Sugestión en masa",
  "Meld into Stone": "Fundirse con la piedra",
  "Mending": "Reparar",
  "Mind Blank": "Mente en blanco",
  "Mirage Arcane": "Espejismo arcano",
  "Mislead": "Engañar",
  "Modify Memory": "Alterar los recuerdos",
  "Move Earth": "Mover la tierra",
  "Nondetection": "Indetectable",
  "Passwall": "Pasamuros",
  "Phantasmal Killer": "Asesino fantasmal",
  "Phantom Steed": "Corcel fantasma",
  "Planar Ally": "Aliado planar",
  "Planar Binding": "Atadura planar",
  "Plant Growth": "Crecimiento vegetal",
  "Poison Spray": "Rociada venenosa",
  "Prismatic Spray": "Rociada prismática",
  "Prismatic Wall": "Muro prismático",
  "Produce Flame": "Crear llama",
  "Programmed Illusion": "Ilusión programada",
  "Project Image": "Proyectar imagen",
  "Purify Food and Drink": "Purificar comida y bebida",
  "Ray of Enfeeblement": "Rayo debilitador",
  "Regenerate": "Regenerar",
  "Reincarnate": "Reencarnar",
  "Reverse Gravity": "Invertir la gravedad",
  "Rope Trick": "Truco de la cuerda",
  "Scorching Ray": "Rayo abrasador",
  "Scrying": "Escudriñar",
  "See Invisibility": "Ver invisibilidad",
  "Sequester": "Recluir",
  "Shapechange": "Cambiar de forma",
  "Silent Image": "Imagen silenciosa",
  "Simulacrum": "Simulacro",
  "Sleet Storm": "Tormenta de aguanieve",
  "Slow": "Ralentizar",
  "Speak with Dead": "Hablar con los muertos",
  "Speak with Plants": "Hablar con las plantas",
  "Spider Climb": "Trepar cual arácnido",
  "Spike Growth": "Crecimiento espinoso",
  "Spirit Guardians": "Espíritus guardianes",
  "Stinking Cloud": "Nube apestosa",
  "Stoneskin": "Piel pétrea",
  "Storm of Vengeance": "Tormenta de la venganza",
  "Sunbeam": "Rayo solar",
  "Sunburst": "Explosión solar",
  "Symbol": "Símbolo",
  "Telekinesis": "Telequinesis",
  "Teleportation Circle": "Círculo de teletransportación",
  "Thaumaturgy": "Taumaturgia",
  "Tongues": "Don de lenguas",
  "Tree Stride": "Paso arbóreo",
  "Unseen Servant": "Sirviente invisible",
  "Vampiric Touch": "Toque vampírico",
  "Vicious Mockery": "Burla dañina",
  "Wall of Ice": "Muro de hielo",
  "Wall of Thorns": "Muro de espinas",
  "Warding Bond": "Vínculo protector",
  "Wind Wall": "Muro de viento",
  "Word of Recall": "Palabra de regreso",
  "Zone of Truth": "Zona de la verdad",

  // Equipo
  "Backpack": "Mochila",
  "Battleaxe": "Hacha de guerra",
  "Chain Mail": "Cota de malla",
  "Dagger": "Daga",
  "Greataxe": "Hacha a dos manos",
  "Greatsword": "Espadón",
  "Longbow": "Arco largo",
  "Longsword": "Espada larga",
  "Mace": "Maza",
  "Plate Armor": "Armadura de placas",
  "Shortbow": "Arco corto",
  "Shortsword": "Espada corta",
  "Spear": "Lanza",
  "Torch": "Antorcha",
  "Warhammer": "Martillo de guerra",

  // Clases y trasfondos
  "Barbarian": "Bárbaro",
  "Bard": "Bardo",
  "Cleric": "Clérigo",
  "Druid": "Druida",
  "Fighter": "Guerrero",
  "Monk": "Monje",
  "Paladin": "Paladín",
  "Ranger": "Explorador",
  "Rogue": "Pícaro",
  "Sorcerer": "Hechicero",
  "Warlock": "Brujo",
  "Wizard": "Mago",

  // Especies
  "Dragonborn": "Dracónido",
  "Dwarf": "Enano",
  "Elf": "Elfo",
  "Gnome": "Gnomo",
  "Halfling": "Mediano",
  "Human": "Humano",
  "Tiefling": "Tiefling",
};

/**
 * Términos que solo aplican a una edición, porque el nombre español de la
 * ficha cambió entre el SRD 5.1 (2014) y el 5.2.1 (2024) o porque la ficha solo
 * existe en una de las dos. La clave es la edición que publica el sitio.
 *
 * Sin esto, «Goblin» («Goblins» en 5.2.1 y «Goblin» en 5.1) o «Deck of Many
 * Things» («Baraja de múltiples cosas» en 5.1 y «Baraja misteriosa» en 5.2.1)
 * se quedarían sin línea en una de las dos ediciones.
 */
const POR_EDICION: Record<string, Record<string, string>> = {
  "5e": {
    "Bugbear": "Osgo",
    "Deck of Many Things": "Baraja de múltiples cosas",
    "Gnoll": "Gnoll",
    "Goblin": "Goblin",
    "Half-Elf": "Semielfo",
    "Half-Orc": "Semiorco",
    "Hobgoblin": "Hobgoblin",
    "Kobold": "Kobold",
    "Minotaur": "Minotauro",
    "Sahuagin": "Sahuagin",
  },
  "5.5": {
    "Criminal": "Criminal",
    "Deck of Many Things": "Baraja misteriosa",
    "Ice Knife": "Cuchillo de hielo",
    "Leather Armor": "Armadura de cuero",
    "Rations": "Raciones",
    "Ray of Sickness": "Rayo nauseabundo",
    "Rope": "Cuerda",
    "Sage": "Erudito",
    "Soldier": "Soldado",
    "Sphinx": "Esfinge de las maravillas",
  },
};

/**
 * Fichas cuyo nombre español no basta para elegir el término inglés. La clave
 * es `tipo/slug`, que sí identifica la ficha.
 *
 *   - «Mago» es el monstruo `Mage` del SRD y la clase `Wizard`, y las dos se
 *     llaman igual: sin la clave, una de las dos publicaba el término de la
 *     otra.
 *   - `Enthrall` (nivel 2, Encantamiento) e `Imprisonment` (nivel 9,
 *     Abjuración) son dos conjuros distintos en inglés; el SRD en español los
 *     llama «Embelesar» y «Cautiverio», así que cada uno va a su ficha.
 *   - `Animal Friendship` (nivel 1, Encantamiento) y `Speak with Animals`
 *     (nivel 1, Adivinación) son otros dos conjuros distintos que el SRD en
 *     español unificó en «Hablar con los animales»; el que se publica es el
 *     segundo, que es el que dice la ficha.
 *
 * Lo vigila `tools/test/alias.mjs`.
 */
const POR_FICHA: Record<string, string> = {
  "monstruos/mago": "Mage",
  "clases/mago": "Wizard",
  "conjuros/embelesar": "Enthrall",
  "conjuros/cautiverio": "Imprisonment",
  "conjuros/hablar-con-los-animales": "Speak with Animals",
};

/**
 * Español (en minúsculas) → términos ingleses que lo comparten. Se guardan
 * todos: cuando hay más de uno el nombre no basta para elegir, y `aliasDe`
 * devuelve `undefined` en vez de quedarse con el último del diccionario (que es
 * como el monstruo Mago acabó publicando «En inglés: Wizard»).
 */
const ALIAS_ES: Map<string, string[]> = new Map();
for (const [en, es] of Object.entries(INGLES)) {
  const clave = es.trim().toLowerCase();
  const terminos = ALIAS_ES.get(clave);
  if (!terminos) ALIAS_ES.set(clave, [en]);
  else if (!terminos.includes(en)) terminos.push(en);
}

/**
 * Español (en minúsculas) → términos ingleses, ya tenidos en cuenta los que
 * solo aplican a una edición. Se usa cuando la ficha no necesita la clave por
 * `tipo/slug`.
 */
const ALIAS_EDICION: Map<string, Map<string, string[]>> = new Map();
for (const ed of Object.keys(POR_EDICION)) {
  const porNombre = new Map<string, string[]>();
  const propio = POR_EDICION[ed];
  for (const [en, es] of Object.entries(INGLES)) {
    const clave = es.trim().toLowerCase();
    const terminos = porNombre.get(clave) ?? [];
    terminos.push(en);
    porNombre.set(clave, terminos);
  }
  for (const [en, es] of Object.entries(propio)) {
    const clave = es.trim().toLowerCase();
    const terminos = porNombre.get(clave) ?? [];
    terminos.push(en);
    porNombre.set(clave, terminos);
  }
  ALIAS_EDICION.set(ed, porNombre);
}

/**
 * Alias inglés de una ficha: por `tipo/slug` si el nombre es ambiguo, por
 * nombre en el resto. `tipo` y `slug` son opcionales para las llamadas que
 * solo tienen el nombre; sin ellos, un nombre ambiguo no devuelve nada antes
 * que devolver un término que puede ser el de otra ficha.
 *
 * `edicion` es la que publica el sitio (`5e` o `5.5`): sin ella se busca en
 * el diccionario común.
 */
export function aliasDe(
  nombre: string,
  tipo?: string,
  slug?: string,
  edicion?: string,
): string | undefined {
  if (tipo && slug) {
    const ficha = POR_FICHA[`${tipo}/${slug}`];
    if (ficha) return ficha;
  }
  const clave = String(nombre).trim().toLowerCase();
  const porNombre = edicion ? ALIAS_EDICION.get(edicion) : undefined;
  const terminos = porNombre?.get(clave) ?? ALIAS_ES.get(clave);
  return terminos?.length === 1 ? terminos[0] : undefined;
}
