#!/usr/bin/env bun
/**
 * Orchestrateur de release Rendu.
 *
 *   1. `tegami version`  → calcule le prochain numéro de version depuis les
 *                          commits conventionnels (ou les fichiers .tegami/),
 *                          met à jour package.json + CHANGELOG.md.
 *   2. `bun run build`   → recompile les 5 binaires natifs et propage la
 *                          nouvelle version aux sous-paquets + optionalDependencies.
 *   3. commit + tag git  → `release: @arthur.eudeline/rendu@x.y.z`
 *                          + tag `@arthur.eudeline/rendu@x.y.z`.
 *   4. `scripts/publish.ts --skip-build` → publie les 6 paquets sur npm, dans
 *                          l'ordre requis, de façon idempotente.
 *
 * Le push (`git push --follow-tags`) reste manuel.
 *
 * Usage :
 *   bun scripts/release.ts [options]
 *
 * Options :
 *   --dry-run       Montre le bump calculé + la simulation npm publish, n'écrit rien.
 *   --allow-empty   Continue même si aucun changement de version n'est détecté.
 *   --no-git        Ne crée ni commit ni tag git.
 *   --otp <code>    Code OTP 2FA transmis à npm publish.
 *   --tag <tag>     dist-tag npm (défaut : latest).
 *   --yes, -y       Pas de confirmation interactive.
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import * as p from "@clack/prompts";
import chalk from "chalk";

const ROOT = join(import.meta.dir, "..");
const PKG_PATH = join(ROOT, "package.json");
const LOCK_PATH = join(ROOT, ".tegami", "publish-lock.yaml");
const PACKAGE_NAME = "@arthur.eudeline/rendu";

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const opt = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const dryRun = has("--dry-run");
const allowEmpty = has("--allow-empty");
const noGit = has("--no-git");
const assumeYes = has("--yes") || has("-y");
const otp = opt("--otp");
const distTag = opt("--tag");

async function run(
  cmd: string[],
  opts: { capture?: boolean } = {},
): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn({
    cmd,
    cwd: ROOT,
    stdout: opts.capture ? "pipe" : "inherit",
    stderr: opts.capture ? "pipe" : "inherit",
  });
  const stdout = opts.capture ? await new Response(proc.stdout).text() : "";
  return { code: await proc.exited, stdout };
}

async function readVersion(): Promise<string> {
  return (await Bun.file(PKG_PATH).json()).version as string;
}

async function main(): Promise<void> {
  p.intro(chalk.bgBlue.black(" rendu release "));

  const currentVersion = await readVersion();
  p.log.info(`Version actuelle : ${chalk.cyan(currentVersion)}`);

  // --- Dry-run : montrer le plan, ne rien modifier. ---
  if (dryRun) {
    p.log.step("Bump calculé par Tegami :");
    await run(["node", "scripts/tegami.mts", "plan"]);
    p.log.step("Simulation de publication npm (version actuelle) :");
    await run(["bun", "scripts/publish.ts", "--dry-run", "--skip-build", "--yes"]);
    p.outro(chalk.green("Dry-run terminé : aucun fichier modifié, rien publié."));
    return;
  }

  // --- Garde-fou : arbre git propre. ---
  const status = await run(["git", "status", "--porcelain"], { capture: true });
  if (status.stdout.trim().length > 0 && !noGit) {
    p.log.warn(chalk.yellow("L'arbre de travail git n'est pas propre :"));
    p.log.message(status.stdout.trim());
    if (!assumeYes) {
      const ok = await p.confirm({
        message: "Continuer quand même ? (le commit de release inclura ces changements)",
        initialValue: false,
      });
      if (p.isCancel(ok) || !ok) {
        p.cancel("Release annulée.");
        process.exit(1);
      }
    }
  }

  // Verrou Tegami résiduel : on ne se sert jamais de `tegami publish`, donc un
  // publish-lock présent est toujours obsolète et bloquerait `tegami version`.
  if (existsSync(LOCK_PATH)) await rm(LOCK_PATH, { force: true });

  // --- 1. Bump de version via Tegami. ---
  p.log.step("Calcul et application du bump de version (tegami version)…");
  const version = await run(["node", "scripts/tegami.mts", "version"]);
  if (version.code !== 0) {
    p.log.error(chalk.red("`tegami version` a échoué."));
    process.exit(1);
  }

  const newVersion = await readVersion();
  const bumped = newVersion !== currentVersion;

  if (!bumped) {
    if (!allowEmpty) {
      p.log.warn(
        "Aucun changement de version détecté. Ajoutez des commits conventionnels " +
          "(`feat:`, `fix:`…) ou lancez `bun run changelog`, puis relancez.",
      );
      p.outro("Rien à publier.");
      return;
    }
    p.log.info(`--allow-empty : republication de la version ${chalk.cyan(newVersion)}.`);
  } else {
    p.log.success(`Nouvelle version : ${chalk.green(newVersion)}`);
  }

  // --- 2. Build + propagation de version aux sous-paquets. ---
  const s = p.spinner();
  s.start("Compilation des binaires natifs (bun run build)");
  const build = await run(["bun", "run", "build"]);
  if (build.code !== 0) {
    s.error("Échec de la compilation.");
    process.exit(1);
  }
  s.stop("Binaires compilés et versions synchronisées.");

  // --- 3. Commit + tag git. ---
  const gitTag = `${PACKAGE_NAME}@${newVersion}`;
  if (!noGit) {
    const tagExists = await run(["git", "rev-parse", "-q", "--verify", `refs/tags/${gitTag}`], {
      capture: true,
    });

    if (!assumeYes) {
      const ok = await p.confirm({
        message: `Commiter la release et créer le tag ${chalk.cyan(gitTag)} ?`,
        initialValue: true,
      });
      if (p.isCancel(ok) || !ok) {
        p.log.warn("Commit/tag ignorés. Pensez à committer manuellement avant de publier.");
      } else {
        await run(["git", "add", "-A"]);
        await run(["git", "commit", "-m", `release: ${gitTag}`]);
        if (tagExists.code === 0) {
          p.log.warn(`Le tag ${gitTag} existe déjà, non recréé.`);
        } else {
          await run(["git", "tag", gitTag]);
        }
      }
    } else {
      await run(["git", "add", "-A"]);
      await run(["git", "commit", "-m", `release: ${gitTag}`]);
      if (tagExists.code !== 0) await run(["git", "tag", gitTag]);
    }
  }

  // --- 4. Publication npm des 6 paquets. ---
  const publishArgs = ["bun", "scripts/publish.ts", "--skip-build", "--yes"];
  if (otp) publishArgs.push("--otp", otp);
  if (distTag) publishArgs.push("--tag", distTag);

  p.log.step("Publication sur npm…");
  const publish = await run(publishArgs);
  if (publish.code !== 0) {
    p.log.error(chalk.red("La publication a échoué."));
    p.log.error(
      chalk.red(
        "Le bump de version et le tag git sont en place ; relancez " +
          "`bun scripts/publish.ts` pour reprendre la publication.",
      ),
    );
    process.exit(1);
  }

  // --- 5. Nettoyage du verrou Tegami (non utilisé pour la publication). ---
  if (existsSync(LOCK_PATH)) await rm(LOCK_PATH, { force: true });

  p.outro(
    chalk.green(
      `${PACKAGE_NAME}@${newVersion} publié. Pensez à pousser : ` +
        chalk.bold("git push --follow-tags"),
    ),
  );
}

main().catch((err) => {
  p.log.error(chalk.red(err instanceof Error ? (err.stack ?? err.message) : String(err)));
  process.exit(1);
});
