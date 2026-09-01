import * as p from "@clack/prompts";
import chalk from "chalk";
import { Effect } from "effect";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { formatArchiveError, listArchivableFiles } from "../lib/archive";
import { RENDU_FILE } from "../lib/rendufile";
import { readConfig } from "../lib/config";
import { toFolderName } from "../lib/naming";
import { flushSentry, reportError } from "../lib/sentry";
import { runConfigCommand } from "./config";

async function pathIsDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}

interface TreeNode {
  children: Map<string, TreeNode>;
}

function createNode(): TreeNode {
  return { children: new Map() };
}

/** Insère un chemin relatif ("src/lib/a.ts") dans l'arbre. */
function insert(root: TreeNode, segments: string[]): void {
  let node = root;
  for (const segment of segments) {
    let child = node.children.get(segment);
    if (!child) {
      child = createNode();
      node.children.set(segment, child);
    }
    node = child;
  }
}

/** Rend un arbre en lignes façon `tree` (dossiers d'abord, puis ordre alphabétique). */
function renderTree(node: TreeNode, prefix = ""): string[] {
  const entries = [...node.children.entries()].sort((a, b) => {
    const aDir = a[1].children.size > 0;
    const bDir = b[1].children.size > 0;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a[0].localeCompare(b[0]);
  });

  const lines: string[] = [];
  entries.forEach(([name, child], index) => {
    const last = index === entries.length - 1;
    const isDir = child.children.size > 0;
    const branch = last ? "└── " : "├── ";
    lines.push(`${prefix}${branch}${isDir ? chalk.cyan(`${name}/`) : name}`);
    if (isDir) {
      lines.push(...renderTree(child, `${prefix}${last ? "    " : "│   "}`));
    }
  });
  return lines;
}

/**
 * Affiche l'arborescence des fichiers qui seront inclus dans l'archive de
 * `inputPath`, en appliquant les mêmes règles d'exclusion que `rendu`.
 * Demande la configuration à la volée si elle n'existe pas encore.
 */
export async function runPreviewCommand(inputPath: string): Promise<void> {
  p.intro(chalk.bgMagenta.black(" rendu preview "));

  let config = await Effect.runPromise(
    Effect.match(readConfig, { onFailure: () => undefined, onSuccess: (c) => c }),
  );

  if (!config) {
    p.log.warn("Aucune configuration trouvée : configurons votre identité.");
    await runConfigCommand();
    config = await Effect.runPromise(
      Effect.match(readConfig, { onFailure: () => undefined, onSuccess: (c) => c }),
    );
    if (!config) {
      p.cancel("Configuration manquante, abandon.");
      process.exit(1);
    }
    p.intro(chalk.bgMagenta.black(" rendu preview "));
  }

  const sourcePath = resolve(inputPath);

  if (!(await pathIsDirectory(sourcePath))) {
    p.cancel(`Le chemin "${inputPath}" n'existe pas ou n'est pas un dossier.`);
    process.exit(1);
  }

  const folderName = toFolderName(config);

  const spinner = p.spinner();
  spinner.start(`Analyse du contenu de ${chalk.cyan(inputPath)}`);

  const result = await Effect.runPromise(
    Effect.match(listArchivableFiles(sourcePath), {
      onFailure: (error) => ({ ok: false as const, error }),
      onSuccess: (value) => ({ ok: true as const, value }),
    }),
  );

  if (!result.ok) {
    spinner.error("Échec de l'analyse du dossier.");
    p.log.error(chalk.red(formatArchiveError(result.error, inputPath)));
    reportError(result.error, { command: "preview", errorType: result.error._tag });
    await flushSentry();
    process.exit(1);
  }

  const files = result.value;

  if (files.length === 0) {
    spinner.stop("Aucun fichier à inclure.");
    p.outro(chalk.yellow(`Vérifiez le contenu du dossier ou votre ${RENDU_FILE}.`));
    return;
  }

  spinner.stop(`${files.length} fichier(s) seront inclus dans l'archive.`);

  const root = createNode();
  for (const file of files) {
    insert(root, file.split("/"));
  }

  const tree = [chalk.cyan(`${folderName}/`), ...renderTree(root)].join("\n");
  p.note(tree, `Contenu de ${folderName}.zip`);

  p.outro(chalk.green(`${files.length} fichier(s) prêts à être archivés.`));
}
