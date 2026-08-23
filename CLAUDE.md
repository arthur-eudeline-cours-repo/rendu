# Projet

Rendu est un outils CLI basé sur Bun single file executable. Il permettra à mes étudiants de créer des archives ZIP contenu les rendu de leurs travaux pratiques en informatique.

Rendu utilise au maximum les API Natives de Bun.

Rendu permettra d'ajouter plusieurs fichiers et dossiers à une archive ZIP nommée selon le nom de l'utilisateur. Le prénom et nom seront demandés à l'initialisation et stoqué dans le dossier personnel de l'utilisateur via la librairie `@clack/prompts`.

Rendu utilisera un système de fichier de configuration `.rendu` qui reprendra la même syntaxe que `.gitignore`

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
- `rendu upgrade` permet de mettre à jour le CLI
- `rendu ./path` permet de faire créer une archive de rendu pour chemin donné


# Publication
Cet outil devra être publiable sur NPM pour pouvoir l'installer via 
```
npm i -g @arthur.eudeline/rendu
````
Cela devra installer le bon binaire pour l'achitecture de l'ordinateur de l'utilisateur.
Il ajoutera la commande globale `rendu` 