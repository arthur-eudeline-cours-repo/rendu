import * as p from "@clack/prompts";
import chalk from "chalk";
import pkg from "../../package.json" with { type: "json" };

const PACKAGE_NAME: string = pkg.name;

async function fetchLatestVersion(): Promise<string | undefined> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`);
    if (!response.ok) return undefined;
    const data = (await response.json()) as { version?: string };
    return data.version;
  } catch {
    return undefined;
  }
}

/** Vérifie la disponibilité d'une nouvelle version et l'installe via npm. */
export async function runUpgradeCommand(): Promise<void> {
  p.intro(chalk.bgBlue.black(" rendu upgrade "));
  p.log.info(`Version actuelle : ${chalk.cyan(pkg.version)}`);

  const spinner = p.spinner();
  spinner.start("Vérification de la dernière version disponible");
  const latest = await fetchLatestVersion();

  if (!latest) {
    spinner.error("Impossible de contacter le registre npm.");
    process.exit(1);
  }

  if (latest === pkg.version) {
    spinner.stop("Vous utilisez déjà la dernière version.");
    p.outro(chalk.green("Rien à faire !"));
    return;
  }

  spinner.stop(`Nouvelle version disponible : ${chalk.cyan(latest)}`);

  const confirmed = await p.confirm({
    message: `Installer la version ${latest} ?`,
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Mise à jour annulée.");
    process.exit(1);
  }

  p.log.step(`Installation de ${PACKAGE_NAME}@${latest} via npm…`);

  const proc = Bun.spawn({
    cmd: ["npm", "install", "-g", `${PACKAGE_NAME}@${latest}`],
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    p.log.error(chalk.red(`Échec de la mise à jour (code ${exitCode}).`));
    p.log.error(chalk.red(`Essayez manuellement : npm install -g ${PACKAGE_NAME}@latest`));
    process.exit(1);
  }

  p.outro(chalk.green(`Rendu est à jour (${latest}) !`));
}
