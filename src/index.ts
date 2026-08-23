#!/usr/bin/env bun
import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { runConfigCommand } from "./commands/config";
import { runCreateCommand } from "./commands/create";
import { runUpgradeCommand } from "./commands/upgrade";

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
  .command("upgrade")
  .description("Met à jour Rendu vers la dernière version disponible.")
  .action(async () => {
    await runUpgradeCommand();
  });

program
  .argument("[path]", "Chemin du dossier à archiver", ".")
  .description("Crée une archive ZIP du dossier indiqué (dossier courant par défaut).")
  .action(async (path: string) => {
    await runCreateCommand(path);
  });

await program.parseAsync(process.argv);
