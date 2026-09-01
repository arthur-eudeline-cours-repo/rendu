# Rendu

**Rendu** est un outil en ligne de commande qui aide à préparer
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
- Fichier `.rendu` (même syntaxe que `.gitignore`) qui agit comme **liste
  blanche** : s'il est présent, seuls les fichiers qu'il désigne sont archivés
  (et jamais ceux exclus par `.gitignore`).
- Toujours exclus : `.git/`, `.gitignore`, `.rendu`, `node_modules/`, `*.zip`,
  `.DS_Store`.
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

Par défaut, tout le contenu du dossier est archivé, à l'exception de ce que son
`.gitignore` exclut et des motifs toujours exclus.

Pour restreindre plus finement, placez un fichier `.rendu` à la racine du dossier
archivé. Il suit la syntaxe de `.gitignore` mais fonctionne comme une **liste
blanche** : seuls les fichiers correspondant à ses motifs sont archivés.

```gitignore
# Seuls ces éléments entrent dans l'archive
src/
rapport.pdf
Makefile
```

`.gitignore` reste prépondérant : un fichier qu'il exclut n'est pas archivé,
même si `.rendu` le désigne.

### Mettre à jour Rendu

```bash
rendu upgrade
```

Vérifie la dernière version publiée sur npm et, après confirmation, lance
`npm install -g @arthur.eudeline/rendu@latest`.

## Commandes

| Commande         | Description                                             |
| ---------------- | ------------------------------------------------------- |
| `rendu [path]`   | Crée l'archive du dossier indiqué (courant par défaut) |
| `rendu preview [path]` | Affiche l'arborescence des fichiers qui seraient inclus |
| `rendu config`   | Définit ou met à jour votre prénom / nom               |
| `rendu upgrade`  | Met à jour le CLI vers la dernière version             |
| `rendu -v`       | Affiche la version installée                           |

## Licence

MIT — Arthur Eudeline
