import { Effect } from "effect";
import ignoreFactory from "ignore";
import { join } from "node:path";
import { RenduIgnoreReadError } from "./errors";

/**
 * Motifs toujours exclus, quoi qu'il arrive : ni `.gitignore` ni `.rendu`
 * ne peuvent les réintégrer.
 */
const HARD_IGNORES = [".git/", ".gitignore", ".rendu", "node_modules/", "*.zip", ".DS_Store"];

export interface SelectionRules {
  /** `true` si le fichier (chemin relatif à la racine archivée) doit figurer dans l'archive. */
  includes(relativePath: string): boolean;
}

/**
 * Construit les règles de sélection des fichiers à archiver.
 *
 * Précédence, du plus fort au plus faible :
 *  1. `HARD_IGNORES` et le `.gitignore` du dossier — toujours exclus.
 *  2. `.rendu` (syntaxe `.gitignore`), s'il existe — agit comme liste blanche :
 *     seuls les fichiers correspondant à ses motifs sont retenus.
 *  3. En l'absence de `.rendu`, tout ce qui a survécu à l'étape 1 est inclus.
 *
 * Autrement dit `.gitignore` est prépondérant : un fichier qu'il exclut le
 * reste même si `.rendu` le désigne.
 */
export const loadSelectionRules = (
  rootPath: string,
): Effect.Effect<SelectionRules, RenduIgnoreReadError> =>
  Effect.gen(function* () {
    const readOptionalFile = (name: string) =>
      Effect.gen(function* () {
        const file = Bun.file(join(rootPath, name));
        const exists = yield* Effect.tryPromise({
          try: () => file.exists(),
          catch: (cause) => new RenduIgnoreReadError({ cause }),
        });
        if (!exists) return undefined;
        return yield* Effect.tryPromise({
          try: () => file.text(),
          catch: (cause) => new RenduIgnoreReadError({ cause }),
        });
      });

    const blocked = ignoreFactory().add(HARD_IGNORES);
    const gitignore = yield* readOptionalFile(".gitignore");
    if (gitignore) blocked.add(gitignore);

    const renduContent = yield* readOptionalFile(".rendu");
    const allowed = renduContent ? ignoreFactory().add(renduContent) : undefined;

    return {
      includes(relativePath: string): boolean {
        if (blocked.ignores(relativePath)) return false;
        if (allowed && !allowed.ignores(relativePath)) return false;
        return true;
      },
    };
  });
