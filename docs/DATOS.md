# Modelo de datos de La Taberna de Eme

La fuente de verdad es **un fichero Markdown por entidad**, con frontmatter YAML.
No hay JSON gigantes: cada entrada se revisa y se corrige en su propio fichero,
el `git diff` de un cambio es legible y dos personas pueden editar entradas
distintas sin conflictos.

```
data/
  ed51/            # SRD 5.1 (reglas de 2014)
  ed52/            # SRD 5.2.1 (reglas de 2024, "5.5")
    conjuros/      slug.md
    monstruos/     slug.md
    objetos/       slug.md
    equipo/        slug.md
    clases/        slug.md
    especies/      slug.md
    trasfondos/    slug.md
    dotes/         slug.md
    reglas/        slug.md
```

El `slug` es el nombre en minúsculas, sin tildes ni signos, con guiones:
`Bola de fuego` → `bola-de-fuego.md`.

## Reglas de conversión

- El texto es **literal del SRD en español**. No se reescribe ni se resume.
- Los párrafos van separados por una línea en blanco.
- Los epígrafes internos (`A niveles superiores`, `Acciones`, `Rasgos`…) van
  como `##`.
- Las negritas del original se conservan con `**texto**` cuando marcan el
  nombre de un rasgo o una palabra clave del juego.
- Nada de HTML en el cuerpo.

## Esquemas

### conjuros (`data/ed5x/conjuros/*.md`)

```yaml
---
name: Bola de fuego
level: 3           # 0 = truco
school: Evocación  # Abjuración, Adivinación, Conjuración, Encantamiento,
                   # Evocación, Ilusionismo, Nigromancia, Transmutación
ritual: false
concentration: false
castingTime: 1 acción
range: 45 m
components: V, S, M (una pelotita de guano de murciélago y azufre)
duration: Instantáneo
classes: [Hechicero, Mago]
srd: "5.1"
---
```

### monstruos (`data/ed5x/monstruos/*.md`)

```yaml
---
name: Goblin
size: Pequeño
type: Humanoide
tags: trasgo
alignment: neutral malvado
ac: 15 (armadura de cuero, escudo)
hp: 7 (2d6)
speed: 9 m
initiative: ""            # solo 5.2
abilities: {fue: 8, des: 14, con: 10, int: 10, sab: 8, car: 8}
saves: ""
skills: Sigilo +6
resistances: ""
immunities: ""
conditionImmunities: ""
vulnerabilities: ""
senses: visión en la oscuridad 18 m, Percepción pasiva 9
languages: común, goblin
cr: "1/4"
xp: 50 PX
proficiency: ""
gear: ""
srd: "5.1"
---
```

Cuerpo: `## Rasgos`, `## Acciones`, `## Acciones adicionales`, `## Reacciones`,
`## Acciones legendarias`, cada rasgo como `**Nombre.** texto`.

### objetos (`data/ed5x/objetos/*.md`)

```yaml
---
name: Botas de los elfos
type: Objeto maravilloso
rarity: poco común
attunement: false
srd: "5.1"
---
```

### equipo (`data/ed5x/equipo/*.md`)

```yaml
---
name: Cota de malla
category: Armadura      # Arma, Armadura, Herramienta, Equipo de aventurero, Montura
price: 75 po
weight: 25 kg
srd: "5.1"
---
```

### clases (`data/ed5x/clases/*.md`)

```yaml
---
name: Bárbaro
hitDie: d12
primaryAbility: Fuerza
saves: [Fuerza, Constitución]
skillChoices: Elige dos entre...
armor: armaduras ligeras y medias, escudos
weapons: armas simples y marciales
tools: ninguna
srd: "5.1"
---
```

Cuerpo: `## Rasgos de clase` (uno por `### Nombre (nivel N)`) y
`## Subclases` (`### Nombre`).

### especies / trasfondos / dotes / reglas

```yaml
---
name: Enano
srd: "5.1"
---
```

Dotes: `category` (Origen, General, Estilo de combate, Épica), `prerequisite`.
Reglas: `category` (Combate, Exploración, Magia, Condiciones, Glosario…).
