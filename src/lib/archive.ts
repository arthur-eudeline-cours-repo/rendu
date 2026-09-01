import { Effect } from "effect";
import JSZip from "jszip";
import { join } from "node:path";
import {
  ArchiveWriteError,
  FileScanError,
  RenduFileParseError,
  RenduFileReadError,
  RenduRootMismatchError,
} from "./errors";
import {
  assertRenduRoot,
  buildSelectionRules,
  loadRenduFile,
  RENDU_FILE,
} from "./rendufile";

/** Union des erreurs pouvant survenir lors de la sélection/écriture d'une archive. */
export type ArchiveError =
  | ArchiveWriteError
  | FileScanError
  | RenduFileReadError
  | RenduFileParseError
  | RenduRootMismatchError;

/**
 * Liste les fichiers de `sourcePath` (chemins relatifs) à inclure dans
 * l'archive. Applique le `.rendu.yml` s'il existe : `root` sert de garde-fou,
 * `exclude` retire des fichiers, `include` agit comme liste blanche. Le
 * `.gitignore` du dossier reste prépondérant.
 */
export const listArchivableFiles = (
  sourcePath: string,
): Effect.Effect<string[], ArchiveError> =>
  Effect.gen(function* () {
    const renduFile = yield* loadRenduFile(sourcePath);
    yield* assertRenduRoot(sourcePath, renduFile);
    const rules = yield* buildSelectionRules(sourcePath, renduFile);

    const allFiles = yield* Effect.tryPromise({
      try: async () => {
        const glob = new Bun.Glob("**/*");
        const entries: string[] = [];
        for await (const entry of glob.scan({ cwd: sourcePath, dot: true, onlyFiles: true })) {
          entries.push(entry);
        }
        return entries;
      },
      catch: (cause) => new FileScanError({ cause }),
    });

    return allFiles.filter((entry) => rules.includes(entry)).sort();
  });

export interface BuildArchiveOptions {
  /** Dossier source dont le contenu doit être archivé */
  sourcePath: string;
  /** Nom du dossier racine créé dans l'archive, ex: "NOM_Prenom" */
  folderName: string;
  /** Chemin complet du fichier .zip à produire */
  outputPath: string;
}

export interface BuildArchiveResult {
  files: string[];
  outputPath: string;
}

/**
 * Construit une archive ZIP contenant un dossier `folderName/` avec tous les
 * fichiers non exclus de `sourcePath`.
 */
export const buildArchive = (
  options: BuildArchiveOptions,
): Effect.Effect<BuildArchiveResult, ArchiveError> =>
  Effect.gen(function* () {
    const files = yield* listArchivableFiles(options.sourcePath);

    const zip = new JSZip();
    const root = zip.folder(options.folderName)!;

    for (const relativeFilePath of files) {
      const absolutePath = join(options.sourcePath, relativeFilePath);
      const content = yield* Effect.tryPromise({
        try: () => Bun.file(absolutePath).arrayBuffer(),
        catch: (cause) => new ArchiveWriteError({ cause }),
      });
      root.file(relativeFilePath, content);
    }

    const buffer = yield* Effect.tryPromise({
      try: () => zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
      catch: (cause) => new ArchiveWriteError({ cause }),
    });

    yield* Effect.tryPromise({
      try: () => Bun.write(options.outputPath, buffer),
      catch: (cause) => new ArchiveWriteError({ cause }),
    });

    return { files, outputPath: options.outputPath };
  });

/**
 * Message lisible à afficher à l'étudiant pour une erreur de sélection/archive.
 * `inputPath` est le chemin tel qu'il l'a saisi (pour le contexte).
 */
export const formatArchiveError = (error: ArchiveError, inputPath: string): string => {
  const formatRenduFileCause = (cause: unknown): string => {
    const issues = (cause as { issues?: Array<{ path?: unknown[]; message?: string }> })
      ?.issues;
    if (Array.isArray(issues)) {
      return issues
        .map((issue) => {
          const at = issue.path?.length ? `${issue.path.join(".")} : ` : "";
          return `  - ${at}${issue.message ?? "valeur invalide"}`;
        })
        .join("\n");
    }
    return String(cause);
  };

  switch (error._tag) {
    case "RenduRootMismatchError":
      return (
        `Le dossier « ${inputPath} » ne contient pas « ${error.root} », ` +
        `déclaré dans ${RENDU_FILE}.\n` +
        `Vous n'archivez probablement pas le bon dossier.`
      );
    case "RenduFileParseError":
      return `${RENDU_FILE} est invalide :\n${formatRenduFileCause(error.cause)}`;
    default:
      return String(error.cause ?? error);
  }
};
