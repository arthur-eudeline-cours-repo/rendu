#!/usr/bin/env bun
/**
 * Publie Rendu sur npm : d'abord les 5 sous-packages de binaires natifs
 * (@arthur.eudeline/rendu-<os>-<arch>), puis le package racine
 * (@arthur.eudeline/rendu) qui les référence en `optionalDependencies`.
 *
 * L'ordre est important : au moment où npm installe le package racine, il doit
 * pouvoir résoudre les `optionalDependencies` correspondant à la plateforme de
 * l'utilisateur. Elles doivent donc déjà exister sur le registre.
 *
 * Le script est idempotent : une version déjà publiée est simplement ignorée,
 * ce qui permet de relancer après un échec partiel.
 *
 * Usage :
 *   bun scripts/publish.ts [options]
 *
 * Options :
 *   --dry-run          Simule la publication (npm publish --dry-run), ne pousse rien.
 *   --skip-build       Ne recompile pas les binaires (suppose npm/ déjà à jour).
 *   --otp <code>       Code OTP 2FA transmis à npm publish.
 *   --tag <dist-tag>   dist-tag npm (défaut : latest).
 *   --provenance       Ajoute --provenance (CI avec OIDC uniquement).
 *   --yes, -y          N'affiche pas la confirmation interactive.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import chalk from "chalk";
import pkg from "../package.json" with { type: "json" };

interface Target {
  suffix: string;
  os: string;
  cpu: string;
  binaryName: string;
}

const TARGETS: Target[] = [
  { suffix: "darwin-arm64", os: "darwin", cpu: "arm64", binaryName: "rendu" },
  { suffix: "darwin-x64", os: "darwin", cpu: "x64", binaryName: "rendu" },
  { suffix: "linux-arm64", os: "linux", cpu: "arm64", binaryName: "rendu" },
  { suffix: "linux-x64", os: "linux", cpu: "x64", binaryName: "rendu" },
  { suffix: "win32-x64", os: "win32", cpu: "x64", binaryName: "rendu.exe" },
];

const ROOT = join(import.meta.dir, "..");
const VERSION = pkg.version;

// --- Analyse des arguments ---------------------------------------------------

const args = process.argv.slice(2);
function flag(name: string): boolean {
  return args.includes(name);
}
function option(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const dryRun = flag("--dry-run");
const skipBuild = flag("--skip-build");
const provenance = flag("--provenance");
const assumeYes = flag("--yes") || flag("-y");
const otp = option("--otp");
const distTag = option("--tag") ?? "latest";

// --- Helpers ---------------------------------------------------------------

async function run(
  cmd: string[],
  opts: { cwd?: string; capture?: boolean } = {},
): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn({
    cmd,
    cwd: opts.cwd ?? ROOT,
    stdout: opts.capture ? "pipe" : "inherit",
    stderr: opts.capture ? "pipe" : "inherit",
  });
  const stdout = opts.capture ? await new Response(proc.stdout).text() : "";
  const code = await proc.exited;
  return { code, stdout };
}

/** True si `<name>@<version>` est déjà présent sur le registre npm. */
async function isPublished(name: string, version: string): Promise<boolean> {
  const { code, stdout } = await run(
    ["npm", "view", `${name}@${version}`, "version"],
    { capture: true },
  );
  return code === 0 && stdout.trim().length > 0;
}

function publishArgs(): string[] {
  const a = ["npm", "publish", "--access", "public", "--tag", distTag];
  if (dryRun) a.push("--dry-run");
  if (otp) a.push("--otp", otp);
  if (provenance) a.push("--provenance");
  return a;
}

// --- Déroulé -------------------------------------------------------------------

async function main(): Promise<void> {
  p.intro(chalk.bgBlue.black(" rendu publish "));
  p.log.info(`Package racine : ${chalk.cyan(pkg.name)}`);
  p.log.info(`Version        : ${chalk.cyan(VERSION)}`);
  p.log.info(`dist-tag       : ${chalk.cyan(distTag)}`);
  if (dryRun) p.log.warn(chalk.yellow("Mode --dry-run : aucune publication réelle."));

  // 1. Identité npm (sauf en dry-run où l'auth n'est pas requise).
  if (!dryRun) {
    const who = await run(["npm", "whoami"], { capture: true });
    if (who.code !== 0) {
      p.log.error(chalk.red("Non authentifié auprès de npm. Lancez `npm login`."));
      process.exit(1);
    }
    p.log.info(`Compte npm     : ${chalk.cyan(who.stdout.trim())}`);
  }

  // 2. Avertissement si l'arbre git est sale.
  const status = await run(["git", "status", "--porcelain"], { capture: true });
  if (status.stdout.trim().length > 0) {
    p.log.warn(chalk.yellow("L'arbre de travail git contient des modifications non commitées."));
  }

  // 3. Build des binaires.
  if (skipBuild) {
    p.log.info("--skip-build : compilation ignorée.");
  } else {
    const s = p.spinner();
    s.start("Compilation des binaires natifs (bun run build)");
    const build = await run(["bun", "run", "build"]);
    if (build.code !== 0) {
      s.error("Échec de la compilation.");
      process.exit(1);
    }
    s.stop("Binaires compilés.");
  }

  // 4. Vérifie que chaque binaire attendu est présent.
  const missing: string[] = [];
  for (const t of TARGETS) {
    const binPath = join(ROOT, "npm", `rendu-${t.suffix}`, "bin", t.binaryName);
    if (!existsSync(binPath)) missing.push(`npm/rendu-${t.suffix}/bin/${t.binaryName}`);
  }
  if (missing.length > 0) {
    p.log.error(chalk.red(`Binaires manquants :\n  ${missing.join("\n  ")}`));
    p.log.error(chalk.red("Lancez `bun run build` (ou retirez --skip-build)."));
    process.exit(1);
  }

  // 5. État de publication de chaque package pour cette version.
  const subPackages = TARGETS.map((t) => ({
    name: `@arthur.eudeline/rendu-${t.suffix}`,
    dir: join(ROOT, "npm", `rendu-${t.suffix}`),
  }));

  const plan: { name: string; dir: string; already: boolean }[] = [];
  const checkSpinner = p.spinner();
  checkSpinner.start("Vérification des versions déjà publiées");
  for (const sp of subPackages) {
    plan.push({ ...sp, already: await isPublished(sp.name, VERSION) });
  }
  const rootAlready = await isPublished(pkg.name, VERSION);
  checkSpinner.stop("Vérification terminée.");

  for (const item of plan) {
    p.log.step(
      `${item.name}@${VERSION} → ${item.already ? chalk.dim("déjà publié, ignoré") : chalk.green("à publier")}`,
    );
  }
  p.log.step(
    `${pkg.name}@${VERSION} → ${rootAlready ? chalk.dim("déjà publié, ignoré") : chalk.green("à publier")}`,
  );

  const toPublish = plan.filter((i) => !i.already).length + (rootAlready ? 0 : 1);
  if (toPublish === 0) {
    p.outro(chalk.green("Tout est déjà publié pour cette version. Rien à faire."));
    return;
  }

  // 6. Confirmation.
  if (!assumeYes && !dryRun) {
    const ok = await p.confirm({
      message: `Publier ${toPublish} package(s) en version ${VERSION} sur npm ?`,
      initialValue: false,
    });
    if (p.isCancel(ok) || !ok) {
      p.cancel("Publication annulée.");
      process.exit(1);
    }
  }

  // 7. Publication : sous-packages d'abord, racine ensuite.
  for (const item of plan) {
    if (item.already) continue;
    p.log.step(`Publication de ${item.name}…`);
    const res = await run(publishArgs(), { cwd: item.dir });
    if (res.code !== 0) {
      p.log.error(chalk.red(`Échec de la publication de ${item.name} (code ${res.code}).`));
      p.log.error(chalk.red("Les sous-packages déjà publiés le restent ; relancez pour reprendre."));
      process.exit(1);
    }
  }

  if (!rootAlready) {
    p.log.step(`Publication de ${pkg.name}…`);
    const res = await run(publishArgs(), { cwd: ROOT });
    if (res.code !== 0) {
      p.log.error(chalk.red(`Échec de la publication du package racine (code ${res.code}).`));
      process.exit(1);
    }
  }

  p.outro(
    dryRun
      ? chalk.green("Dry-run terminé : aucun package poussé.")
      : chalk.green(`Publié : ${pkg.name}@${VERSION} et ses ${TARGETS.length} binaires.`),
  );
}

main().catch((err) => {
  p.log.error(chalk.red(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
