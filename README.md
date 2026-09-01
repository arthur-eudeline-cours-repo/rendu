# Rendu

**Rendu** est un outil en ligne de commande qui aide les étudiants à préparer
l'archive ZIP de leurs travaux pratiques d'informatique.

À partir d'un dossier, `rendu` produit un fichier `NOM_Prenom.zip` qui, une fois
décompressé, donne un dossier `NOM_Prenom/` contenant votre travail. Le nom est
construit automatiquement à partir de votre identité, saisie une seule fois puis
mémorisée dans votre dossier personnel.

## Fonctionnement en bref

- Nom d'archive normalisé : `DUPONT_Marie.zip` → dossier `DUPONT_Marie/` à la
  décompression (accents retirés, espaces remplacés par des tirets).
- Le `.gitignore` du dossier est respecté : ce qu'il exclut n'entre jamais dans
  l'archive (il est prépondérant).
- Fichier **`.rendu.yml`** optionnel, à la racine du dossier archivé, avec trois
  entrées facultatives : `root` (garde-fou), `include` (liste blanche) et
  `exclude` (exclusions supplémentaires). Voir
  [Choisir ce qui entre dans l'archive](#choisir-ce-qui-entre-dans-larchive).
- Toujours exclus : `.git/`, `.gitignore`, `.rendu.yml`, `node_modules/`,
  `*.zip`, `.DS_Store`.
- Prompts interactifs et lisibles.

## Installation

```bash
npm install -g @arthur.eudeline/rendu
```

Le bon binaire natif est installé automatiquement selon votre système
(macOS / Linux / Windows, arm64 ou x64). La commande globale `rendu` devient
alors disponible.

## Utilisation

### Première configuration

Renseignez votre prénom et votre nom. Ils sont stockés dans
`~/.rendu/config.json`.

```bash
rendu config
```

Vous pouvez relancer cette commande à tout moment pour corriger vos
informations. Si vous lancez la création d'une archive sans configuration
existante, `rendu` vous la demande à ce moment-là.

### Créer une archive de rendu

```bash
rendu               # archive le dossier courant
rendu ./tp3         # archive le dossier ./tp3
rendu /chemin/complet/vers/tp
```

Le fichier `NOM_Prenom.zip` est écrit dans le dossier courant. S'il existe déjà,
`rendu` demande confirmation avant de l'écraser. À la fin, la liste des fichiers
inclus est affichée.

### Prévisualiser le contenu de l'archive

```bash
rendu preview          # arborescence du dossier courant
rendu preview ./tp3    # arborescence du dossier ./tp3
```

Affiche, sans rien écrire sur le disque, l'arbre des fichiers qui seraient
inclus, en appliquant les mêmes règles que la création.

### Choisir ce qui entre dans l'archive

Par défaut, tout le contenu du dossier est archivé, à l'exception de ce que le
`.gitignore` du dossier exclut et des motifs toujours exclus (`.git/`,
`.gitignore`, `.rendu.yml`, `node_modules/`, `*.zip`, `.DS_Store`).

Pour contrôler plus finement, placez un fichier **`.rendu.yml`** à la racine du
dossier archivé. `rendu create` en génère un pré-rempli :

```bash
rendu create          # crée ./.rendu.yml
rendu create ./tp3    # crée ./tp3/.rendu.yml
# alias : rendu generate | rendu init | rendu gen
```

Si le fichier existe déjà, `rendu` demande confirmation avant de l'écraser.

#### Format du `.rendu.yml`

Les trois entrées sont **facultatives** :

| Clé       | Rôle                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `root`    | Chemin (fichier ou dossier) qui **doit exister** dans le dossier fourni. Sinon `rendu` s'arrête : « ce n'est pas le bon dossier ». Simple garde-fou — sans effet sur le contenu réellement archivé. |
| `include` | Liste de motifs façon `.gitignore`. Si elle est renseignée, elle agit comme **liste blanche** : seuls les fichiers correspondants sont archivés.                                                  |
| `exclude` | Liste de motifs façon `.gitignore` retirés **en plus** du `.gitignore` et des motifs toujours exclus.                                                                                             |

Fichier généré par `rendu create` :

```yaml
# Pointe vers un fichier à la racine du répertoire du rendu.
# Si ce fichier n'existe pas, une erreur est générée.
root: package.json

# Fichiers à inclure dans le rendu (motifs façon .gitignore)
include:
  - "*"

# Fichiers à ignorer pour le rendu (motifs façon .gitignore)
exclude:
  - node_modules
  - vendor
  - .git
  - .next
```

#### Ordre de priorité

Du plus fort au plus faible :

1. Motifs toujours exclus **et** `.gitignore` du dossier — jamais archivés.
2. `exclude` du `.rendu.yml` — retirés en plus.
3. `include` du `.rendu.yml`, s'il est renseigné — ne conserve que les fichiers
   correspondants.
4. Sinon, tout ce qui a survécu aux étapes précédentes est archivé.

Le `.gitignore` reste donc **prépondérant** : un fichier qu'il exclut n'est
jamais archivé, même si `include` le désigne.

### Mettre à jour Rendu

```bash
rendu upgrade
```

Vérifie la dernière version publiée sur npm et, après confirmation, lance
`npm install -g @arthur.eudeline/rendu@latest`.

## Commandes

| Commande               | Description                                              |
| ---------------------- | ------------------------------------------------------- |
| `rendu [path]`         | Crée l'archive du dossier indiqué (courant par défaut) |
| `rendu preview [path]` | Affiche l'arborescence des fichiers qui seraient inclus |
| `rendu create [path]`  | Génère un `.rendu.yml` pré-rempli (alias : `generate`, `init`, `gen`) |
| `rendu config`         | Définit ou met à jour votre prénom / nom               |
| `rendu upgrade`        | Met à jour le CLI vers la dernière version             |
| `rendu -v`             | Affiche la version installée                           |

## Licence

MIT — Arthur Eudeline
