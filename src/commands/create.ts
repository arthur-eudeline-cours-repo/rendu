import * as p from "@clack/prompts";
import chalk from "chalk";
import { Effect } from "effect";
import { join, resolve } from "node:path";
import { stat } from "node:fs/promises";
import { RENDU_FILE, RENDU_FILE_TEMPLATE, writeRenduFile } from "../lib/rendufile";
import { flushSentry, reportError } from "../lib/sentry";

async function pathIsDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Crée un fichier `.rendu.yml` pré-rempli à la racine de `inputPath`, que
 * l'étudiant n'a plus qu'à adapter à son rendu.
 */
export async function runCreateCommand(inputPath: string): Promise<void> {
  p.intro(chalk.bgMagenta.black(" rendu create "));

  const targetDir = resolve(inputPath);

  if (!(await pathIsDirectory(targetDir))) {
    p.cancel(`Le chemin "${inputPath}" n'existe pas ou n'est pas un dossier.`);
    process.exit(1);
  }

  const target = join(targetDir, RENDU_FILE);

  if (await Bun.file(target).exists()) {
    const overwrite = await p.confirm({
      message: `${chalk.cyan(RENDU_FILE)} existe déjà dans ce dossier. L'écraser ?`,
      initialValue: false,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Opération annulée.");
      process.exit(1);
    }
  }

  const result = await Effect.runPromise(
    Effect.match(writeRenduFile(targetDir), {
      onFailure: (error) => ({ ok: false as const, error }),
      onSuccess: (path) => ({ ok: true as const, path }),
    }),
  );

  if (!result.ok) {
    p.log.error(chalk.red(String(result.error.cause ?? result.error)));
    reportError(result.error, { command: "create", errorType: result.error._tag });
    await flushSentry();
    process.exit(1);
  }

  p.note(RENDU_FILE_TEMPLATE.trimEnd(), result.path);
  p.outro(
    chalk.green(
      `${RENDU_FILE} créé. Adaptez ${chalk.bold("root")}, ${chalk.bold(
        "include",
      )} et ${chalk.bold("exclude")} à votre rendu.`,
    ),
  );
}
