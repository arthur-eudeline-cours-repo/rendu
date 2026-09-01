#!/usr/bin/env node
/**
 * Configuration Tegami (https://tegami.fuma-nama.dev) : calcul du numéro de
 * version et du CHANGELOG.md à partir des commits conventionnels
 * (`feat:` → minor, `fix:` → patch, `feat!:`/`BREAKING CHANGE` → major) ou de
 * fichiers de changelog déposés sous `.tegami/`.
 *
 * Tegami ne publie PAS ici : la publication multi-plateforme (les 5 sous-paquets
 * `@arthur.eudeline/rendu-<os>-<arch>` + le paquet racine, dans l'ordre) et la
 * création du tag git sont gérées par `scripts/publish.ts`. On se limite donc à
 * `tegami version` (bump + changelog) ; aucun plugin git/github n'est branché
 * pour éviter que Tegami ne touche à `.git/config` ou ne crée des commits.
 *
 * Usage :
 *   node scripts/tegami.mts            # TUI : décrire un changement (crée .tegami/*.md)
 *   node scripts/tegami.mts version    # applique le bump : package.json + CHANGELOG.md
 *   node scripts/tegami.mts plan       # affiche le bump calculé sans rien écrire
 *   node scripts/tegami.mts --help
 */
import { tegami } from "tegami";
import { runCli } from "tegami/cli";

const ROOT_PACKAGE = "@arthur.eudeline/rendu";

const paper = tegami({
  // Le bump est déduit des commits conventionnels depuis le dernier tag git.
  // Un fichier .tegami/*.md reste possible pour forcer un niveau précis.
  conventionalCommits: true,
  packages: {
    [ROOT_PACKAGE]: {},
  },
  // Les sous-paquets de binaires natifs sont des artefacts générés par
  // scripts/build.ts, jamais versionnés par Tegami.
  ignore: [/^@arthur\.eudeline\/rendu-/],
});

// Commande maison `plan` : montre le prochain numéro de version sans modifier
// le disque (utile pour `release:dry` et pour vérifier ses commits).
if (process.argv[2] === "plan") {
  const draft = await paper.draft();
  const ctx = await paper._internal.context();
  const lines: string[] = [];
  for (const pkg of ctx.graph.getPackages()) {
    const pd = draft.getPackageDraft(pkg.id);
    if (!pd) continue;
    const next = pd.bumpVersion(pkg);
    if (!pkg.version || !next || next === pkg.version) continue;
    lines.push(`${pkg.id}: ${pkg.version} → ${next}`);
    for (const reason of pd.bumpReasons ?? []) lines.push(`  - ${reason}`);
  }
  console.log(
    lines.length > 0
      ? lines.join("\n")
      : "Aucun changement à publier (pas de commit conventionnel ni de fichier .tegami/ en attente).",
  );
  process.exit(0);
}

await runCli(paper);
