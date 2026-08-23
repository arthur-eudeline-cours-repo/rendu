import { Effect } from "effect";
import ignoreFactory, { type Ignore } from "ignore";
import { join } from "node:path";
import { RenduIgnoreReadError } from "./errors";

/** Motifs toujours exclus, même en l'absence de fichier .rendu */
const DEFAULT_IGNORES = [".git/", ".rendu", "node_modules/", "*.zip", ".DS_Store"];

/**
 * Charge les règles d'exclusion pour `rootPath` : les motifs par défaut,
 * complétés par le fichier `.rendu` (syntaxe `.gitignore`) s'il existe.
 */
export const loadIgnoreRules = (
  rootPath: string,
): Effect.Effect<Ignore, RenduIgnoreReadError> =>
  Effect.gen(function* () {
    const ig = ignoreFactory().add(DEFAULT_IGNORES);
    const file = Bun.file(join(rootPath, ".rendu"));

    const exists = yield* Effect.tryPromise({
      try: () => file.exists(),
      catch: (cause) => new RenduIgnoreReadError({ cause }),
    });

    if (exists) {
      const content = yield* Effect.tryPromise({
        try: () => file.text(),
        catch: (cause) => new RenduIgnoreReadError({ cause }),
      });
      ig.add(content);
    }

    return ig;
  });
