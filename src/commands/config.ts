import * as p from "@clack/prompts";
import chalk from "chalk";
import { Effect } from "effect";
import { readConfig, writeConfig, type UserConfig } from "../lib/config";
import { flushSentry, reportError } from "../lib/sentry";

/**
 * Demande le prénom et le nom à l'utilisateur, puis enregistre la
 * configuration dans son dossier personnel (~/.rendu/config.json).
 */
export async function runConfigCommand(): Promise<void> {
  p.intro(chalk.bgCyan.black(" rendu config "));

  const existing = await Effect.runPromise(
    Effect.match(readConfig, {
      onFailure: () => undefined,
      onSuccess: (config) => config,
    }),
  );

  const firstName = await p.text({
    message: "Quel est votre prénom ?",
    initialValue: existing?.firstName,
    validate: (value) => ((value ?? "").trim().length === 0 ? "Le prénom est requis." : undefined),
  });

  if (p.isCancel(firstName)) {
    p.cancel("Configuration annulée.");
    process.exit(1);
  }

  const lastName = await p.text({
    message: "Quel est votre nom ?",
    initialValue: existing?.lastName,
    validate: (value) => ((value ?? "").trim().length === 0 ? "Le nom est requis." : undefined),
  });

  if (p.isCancel(lastName)) {
    p.cancel("Configuration annulée.");
    process.exit(1);
  }

  const config: UserConfig = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
  };

  const spinner = p.spinner();
  spinner.start("Enregistrement de la configuration");

  const result = await Effect.runPromise(
    Effect.match(writeConfig(config), {
      onFailure: (error) => ({ ok: false as const, error }),
      onSuccess: () => ({ ok: true as const }),
    }),
  );

  if (!result.ok) {
    spinner.error("Échec de l'enregistrement de la configuration.");
    reportError(result.error, { command: "config", errorType: result.error._tag });
    await flushSentry();
    process.exit(1);
  }

  spinner.stop("Configuration enregistrée.");
  p.outro(chalk.green(`Bienvenue ${config.firstName} ${config.lastName} !`));
}
