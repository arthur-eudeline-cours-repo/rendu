import { Effect } from "effect";
import JSZip from "jszip";
import { join } from "node:path";
import { ArchiveWriteError, FileScanError, RenduIgnoreReadError } from "./errors";
import { loadSelectionRules } from "./renduignore";

/**
 * Liste les fichiers de `sourcePath` (chemins relatifs) à inclure dans
 * l'archive : `.gitignore` exclut, `.rendu` (liste blanche) restreint.
 */
export const listArchivableFiles = (sourcePath: string) =>
  Effect.gen(function* () {
    const rules = yield* loadSelectionRules(sourcePath);

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
): Effect.Effect<BuildArchiveResult, ArchiveWriteError | FileScanError | RenduIgnoreReadError> =>
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
