import * as p from "@clack/prompts";
import chalk from "chalk";
import { Effect } from "effect";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildArchive, formatArchiveError } from "../lib/archive";
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

/**
 * Crée une archive ZIP du dossier `inputPath` pour l'utilisateur configuré.
 * Demande la configuration à la volée si elle n'existe pas encore.
 */
export async function runArchiveCommand(inputPath: string): Promise<void> {
  p.intro(chalk.bgMagenta.black(" rendu "));

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
    p.intro(chalk.bgMagenta.black(" rendu "));
  }

  const sourcePath = resolve(inputPath);

  if (!(await pathIsDirectory(sourcePath))) {
    p.cancel(`Le chemin "${inputPath}" n'existe pas ou n'est pas un dossier.`);
    process.exit(1);
  }

  const folderName = toFolderName(config);
  const outputPath = join(process.cwd(), `${folderName}.zip`);

  if (await Bun.file(outputPath).exists()) {
    const overwrite = await p.confirm({
      message: `Le fichier ${chalk.cyan(`${folderName}.zip`)} existe déjà. L'écraser ?`,
      initialValue: false,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Opération annulée.");
      process.exit(1);
    }
  }

  const spinner = p.spinner();
  spinner.start(`Création de l'archive depuis ${chalk.cyan(inputPath)}`);

  const result = await Effect.runPromise(
    Effect.match(buildArchive({ sourcePath, folderName, outputPath }), {
      onFailure: (error) => ({ ok: false as const, error }),
      onSuccess: (value) => ({ ok: true as const, value }),
    }),
  );

  if (!result.ok) {
    spinner.error("Échec de la création de l'archive.");
    p.log.error(chalk.red(formatArchiveError(result.error, inputPath)));
    reportError(result.error, { command: "archive", errorType: result.error._tag });
    await flushSentry();
    process.exit(1);
  }

  if (result.value.files.length === 0) {
    spinner.stop("Aucun fichier à inclure.");
    p.outro(chalk.yellow(`Vérifiez le contenu du dossier ou votre ${RENDU_FILE}.`));
    return;
  }

  spinner.stop(`Archive créée : ${chalk.cyan(outputPath)}`);

  p.note(
    result.value.files.map((f) => `${chalk.dim("+")} ${f}`).join("\n"),
    `${result.value.files.length} fichier(s) inclus`,
  );

  p.outro(chalk.green("Rendu prêt à être déposé !"));
}
