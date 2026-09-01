import { Effect } from "effect";
import ignoreFactory from "ignore";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  RenduFileParseError,
  RenduFileReadError,
  RenduFileWriteError,
  RenduRootMismatchError,
} from "./errors";

/** Nom du fichier de configuration d'archive, à la racine du dossier fourni. */
export const RENDU_FILE = ".rendu.yml";

/** Contenu pré-rempli écrit par `rendu create`, à adapter par l'étudiant. */
export const RENDU_FILE_TEMPLATE = `# Pointe vers un fichier à la racine du répertoire du rendu.
# Si ce fichier n'existe pas, une erreur est générée.
root: package.json

# Fichiers et dossiers à inclure dans le rendu (motifs façon .gitignore).
include:
  - "*"

# Fichiers et dossiers à exclure du rendu (motifs façon .gitignore, récursifs :
# un motif sans "/" au début ou au milieu s'applique à n'importe quelle
# profondeur). Les artefacts courants sont déjà exclus d'office : node_modules,
# dist, build, .git, .env, .DS_Store, .idea, .vscode, .claude, *.log, *.zip…
exclude:
  - node_modules"
`;

/**
 * Motifs toujours exclus, quoi qu'il arrive : ni `.gitignore` ni `.rendu.yml`
 * (via `include`) ne peuvent les réintégrer. Syntaxe `.gitignore` : les motifs
 * sans `/` initial s'appliquent récursivement, à n'importe quelle profondeur.
 */
const HARD_IGNORES = [
  // Rendu & gestion de versions
  ".git/",
  ".gitignore",
  ".gitattributes",
  ".hg/",
  ".svn/",
  RENDU_FILE,
  // Dépendances & artefacts de build
  "node_modules/",
  "vendor/",
  "bower_components/",
  "dist/",
  "build/",
  "out/",
  "target/",
  ".next/",
  ".nuxt/",
  ".svelte-kit/",
  ".turbo/",
  ".parcel-cache/",
  ".cache/",
  "coverage/",
  "__pycache__/",
  ".venv/",
  "venv/",
  // Éditeurs, IDE & outils
  ".vscode/",
  ".idea/",
  ".claude/",
  ".cursor/",
  ".zed/",
  "*.swp",
  "*~",
  // Fichiers système
  ".DS_Store",
  ".AppleDouble",
  "Thumbs.db",
  "desktop.ini",
  // Secrets & journaux
  ".env",
  ".env.*",
  "*.log",
  // Archives
  "*.zip",
  "*.tar",
  "*.tar.gz",
  "*.tgz",
  "*.rar",
];

/**
 * Schéma du fichier `.rendu.yml`, placé à la racine du dossier archivé.
 *
 * ```yaml
 * root: src/main.c        # garde-fou : doit exister dans le dossier fourni
 * include:                # liste blanche, style .gitignore
 *   - src/
 *   - rapport.pdf
 * exclude:                # exclusions supplémentaires, style .gitignore
 *   - "**\/*.log"
 * ```
 */
export const RenduFileSchema = z
  .object({
    /**
     * Fichier ou dossier qui doit exister dans le dossier fourni par l'étudiant.
     * Sert de garde-fou : s'il est absent, on refuse l'archive (mauvais dossier).
     */
    root: z.string().min(1, "`root` ne peut pas être vide").nullish(),
    /**
     * Motifs (syntaxe `.gitignore`) agissant comme liste blanche : s'ils sont
     * renseignés, seuls les fichiers correspondants sont archivés.
     */
    include: z.array(z.string().min(1)).nullish(),
    /** Motifs (syntaxe `.gitignore`) exclus en plus du `.gitignore`. */
    exclude: z.array(z.string().min(1)).nullish(),
  })
  .strict();

export type RenduFile = z.infer<typeof RenduFileSchema>;

const readOptionalFile = (path: string) =>
  Effect.gen(function* () {
    const file = Bun.file(path);
    const exists = yield* Effect.tryPromise({
      try: () => file.exists(),
      catch: (cause) => new RenduFileReadError({ cause }),
    });
    if (!exists) return undefined;
    return yield* Effect.tryPromise({
      try: () => file.text(),
      catch: (cause) => new RenduFileReadError({ cause }),
    });
  });

/**
 * Lit et valide le `.rendu.yml` à la racine de `rootPath`, s'il existe.
 * Renvoie `undefined` si le fichier est absent ou vide.
 */
export const loadRenduFile = (
  rootPath: string,
): Effect.Effect<RenduFile | undefined, RenduFileReadError | RenduFileParseError> =>
  Effect.gen(function* () {
    const content = yield* readOptionalFile(join(rootPath, RENDU_FILE));
    if (content === undefined || content.trim() === "") return undefined;

    const raw = yield* Effect.try({
      try: () => Bun.YAML.parse(content) as unknown,
      catch: (cause) => new RenduFileParseError({ cause }),
    });

    if (raw === null || raw === undefined) return undefined;

    const parsed = RenduFileSchema.safeParse(raw);
    if (!parsed.success) {
      return yield* Effect.fail(new RenduFileParseError({ cause: parsed.error }));
    }
    return parsed.data;
  });

/**
 * Vérifie que le garde-fou `root` du `.rendu.yml` pointe vers un fichier ou un
 * dossier existant dans `rootPath`. Sans `.rendu.yml` ou sans `root`, ne fait rien.
 */
export const assertRenduRoot = (
  rootPath: string,
  renduFile: RenduFile | undefined,
): Effect.Effect<void, RenduRootMismatchError> =>
  Effect.gen(function* () {
    const root = renduFile?.root;
    if (!root) return;

    const exists = yield* Effect.promise(async () => {
      try {
        await stat(join(rootPath, root));
        return true;
      } catch {
        return false;
      }
    });

    if (!exists) {
      return yield* Effect.fail(
        new RenduRootMismatchError({ root, sourcePath: rootPath }),
      );
    }
  });

export interface SelectionRules {
  /** `true` si le fichier (chemin relatif à la racine archivée) doit figurer dans l'archive. */
  includes(relativePath: string): boolean;
}

/**
 * Construit les règles de sélection des fichiers à archiver.
 *
 * Précédence, du plus fort au plus faible :
 *  1. `HARD_IGNORES` et le `.gitignore` du dossier — toujours exclus.
 *  2. `exclude` du `.rendu.yml` — exclus en plus.
 *  3. `include` du `.rendu.yml`, s'il est renseigné — agit comme liste blanche :
 *     seuls les fichiers correspondant à ses motifs sont retenus.
 *  4. Sinon, tout ce qui a survécu aux étapes 1–2 est inclus.
 *
 * Autrement dit `.gitignore` reste prépondérant : un fichier qu'il exclut le
 * reste même si `include` le désigne.
 */
export const buildSelectionRules = (
  rootPath: string,
  renduFile: RenduFile | undefined,
): Effect.Effect<SelectionRules, RenduFileReadError> =>
  Effect.gen(function* () {
    const blocked = ignoreFactory().add(HARD_IGNORES);

    const gitignore = yield* readOptionalFile(join(rootPath, ".gitignore"));
    if (gitignore) blocked.add(gitignore);

    if (renduFile?.exclude?.length) blocked.add(renduFile.exclude);

    const allowed = renduFile?.include?.length
      ? ignoreFactory().add(renduFile.include)
      : undefined;

    return {
      includes(relativePath: string): boolean {
        if (blocked.ignores(relativePath)) return false;
        if (allowed && !allowed.ignores(relativePath)) return false;
        return true;
      },
    };
  });

/**
 * Écrit le `.rendu.yml` pré-rempli à la racine de `rootPath` et renvoie son
 * chemin absolu. N'effectue aucune vérification d'existence : l'appelant décide
 * s'il faut écraser un fichier présent.
 */
export const writeRenduFile = (
  rootPath: string,
): Effect.Effect<string, RenduFileWriteError> =>
  Effect.gen(function* () {
    const target = join(rootPath, RENDU_FILE);
    yield* Effect.tryPromise({
      try: () => Bun.write(target, RENDU_FILE_TEMPLATE),
      catch: (cause) => new RenduFileWriteError({ cause }),
    });
    return target;
  });
