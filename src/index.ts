#!/usr/bin/env bun
import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { runArchiveCommand } from "./commands/archive";
import { runConfigCommand } from "./commands/config";
import { runCreateCommand } from "./commands/create";
import { runPreviewCommand } from "./commands/preview";
import { runUpgradeCommand } from "./commands/upgrade";
import { flushSentry, initSentry, reportError } from "./lib/sentry";

initSentry();

process.on("uncaughtException", async (error) => {
  reportError(error, { command: "cli", stage: "uncaughtException" });
  await flushSentry();
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  reportError(reason, { command: "cli", stage: "unhandledRejection" });
  await flushSentry();
  process.exit(1);
});

const program = new Command();

program
  .name("rendu")
  .description("Crée des archives ZIP de rendus de travaux pratiques.")
  .version(pkg.version, "-v, --version", "Affiche la version de Rendu");

program
  .command("config")
  .description("Définit ou met à jour vos informations (prénom, nom).")
  .action(async () => {
    await runConfigCommand();
  });

program
  .command("create")
  .aliases(["generate", "init", "gen"])
  .argument("[path]", "Dossier où créer le fichier .rendu.yml", ".")
  .description("Crée un fichier .rendu.yml pré-rempli à adapter à votre rendu.")
  .action(async (path: string) => {
    await runCreateCommand(path);
  });

program
  .command("preview")
  .argument("[path]", "Chemin du dossier à prévisualiser", ".")
  .description("Affiche l'arborescence des fichiers qui seront inclus dans l'archive.")
  .action(async (path: string) => {
    await runPreviewCommand(path);
  });

program
  .command("upgrade")
  .description("Met à jour Rendu vers la dernière version disponible.")
  .action(async () => {
    await runUpgradeCommand();
  });

program
  .argument("[path]", "Chemin du dossier à archiver", ".")
  .description("Crée une archive ZIP du dossier indiqué (dossier courant par défaut).")
  .action(async (path: string) => {
    await runArchiveCommand(path);
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  reportError(error, { command: "cli", stage: "parseAsync" });
  await flushSentry();
  throw error;
}

await flushSentry();
