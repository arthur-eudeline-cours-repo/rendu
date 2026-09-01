# Projet

Rendu est un outils CLI basé sur Bun single file executable. Il permettra à mes étudiants de créer des archives ZIP contenu les rendu de leurs travaux pratiques en informatique.

Rendu utilise au maximum les API Natives de Bun.

Rendu permettra d'ajouter plusieurs fichiers et dossiers à une archive ZIP nommée selon le nom de l'utilisateur. Le prénom et nom seront demandés à l'initialisation et stoqué dans le dossier personnel de l'utilisateur via la librairie `@clack/prompts`.

Rendu utilisera un fichier de configuration d'archive `.rendu.yml`, placé à la racine du dossier fourni par l'étudiant. Il est optionnel et comporte trois entrées :
- `root` : chemin (fichier ou dossier) qui doit exister dans le dossier fourni ; sinon Rendu refuse l'archive (« ce n'est pas le bon dossier »). Garde-fou uniquement : tout le dossier fourni est archivé.
- `include` : liste de motifs façon `.gitignore` mais en liste blanche (si renseignée, seuls les fichiers correspondants sont archivés)
- `exclude` : liste de motifs façon `.gitignore` exclus en plus

Le `.gitignore` du dossier reste prépondérant sur `include`/`exclude`.

Une archive ZIP crée par Rendu devra produire un dossier `NOM_Prenom/` avec le contenu de l'archive lors de sa décompression


# Librairies
- Bun native API 
- Zod validation
- @clack/prompts
- commander
- chalk
- Effect.ts pour la gestion propre des erreurs

# Architecture 
Décide toi même s'il faut partir sur un monorepo ou autre. 
Utilise commander.js en façade et redirige le plus vite possible le workflow vers Effect.ts

# Commandes
Chaque commande devra être bien documentée et ergonomique. Les commandes devront utiliser au maximum `@clack/prompts` pour logger un maximum d'information
- `rendu config` permet de définir/mettre à jour les informations de configuration
- `rendu create ./path` (alias `generate`, `init`, `gen`) génère un fichier `.rendu.yml` pré-rempli à adapter
- `rendu preview ./path` affiche l'arborescence des fichiers qui seraient archivés
- `rendu upgrade` permet de mettre à jour le CLI
- `rendu ./path` permet de faire créer une archive de rendu pour chemin donné


# Publication
Cet outil devra être publiable sur NPM pour pouvoir l'installer via 
```
npm i -g @arthur.eudeline/rendu
````
Cela devra installer le bon binaire pour l'achitecture de l'ordinateur de l'utilisateur.
Il ajoutera la commande globale `rendu` 