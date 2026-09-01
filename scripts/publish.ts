#!/usr/bin/env bun
/**
 * Release + publication de Rendu sur npm.
 *
 * Par défaut, le script incrémente d'abord la version via Tegami, puis publie :
 *
 *   1. `tegami version` — calcule le prochain numéro depuis les commits
 *      conventionnels (`fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING
 *      CHANGE` → major) ou les fichiers `.tegami/*.md`, met à jour
 *      `package.json` et `CHANGELOG.md`.
 *   2. `bun run build` — recompile les 5 binaires natifs et propage la nouvelle
 *      version aux sous-packages + `optionalDependencies`.
 *   3. commit `release: @arthur.eudeline/rendu@x.y.z` + tag git du même nom.
 *   4. `npm publish` — d'abord les 5 sous-packages `@arthur.eudeline/rendu-<os>-
 *      <arch>`, puis le package racine `@arthur.eudeline/rendu` qui les référence
 *      en `optionalDependencies` (l'ordre est requis pour que npm résolve la
 *      bonne plateforme à l'installation).
 *
 * Idempotent : une version déjà présente sur le registre est ignorée, on peut
 * donc relancer après un échec partiel. Le `git push --follow-tags` reste manuel.
 *
 * Usage :
 *   bun scripts/publish.ts [options]
 *
 * Options :
 *   --skip-version     Ne touche pas à la version : publie `package.json` tel quel.
 *   --allow-empty      Continue même si Tegami ne détecte aucun changement.
 *   --no-git           Ne crée ni commit ni tag git.
 *   --dry-run          Montre le bump calculé + simule `npm publish`, n'écrit rien.
 *   --skip-build       Ne recompile pas les binaires (suppose npm/ déjà à jour).
 *   --otp <code>       Code OTP 2FA initial. Sinon, en terminal interactif, le
 *                      code est demandé avant la publication et redemandé si npm
 *                      le réclame ou s'il expire en cours de route (6 publications
 *                      successives dépassent souvent la fenêtre TOTP de 30 s).
 *   --tag <dist-tag>   dist-tag npm (défaut : latest).
 *   --provenance       Ajoute --provenance (CI avec OIDC uniquement).
 *   --yes, -y          N'affiche aucune confirmation interactive.
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
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
const PKG_PATH = join(ROOT, "package.json");
const LOCK_PATH = join(ROOT, ".tegami", "publish-lock.yaml");

// --- Analyse des arguments ---------------------------------------------------

const args = process.argv.slice(2);
function flag(name: string): boolean {
  return args.includes(name);
}
function option(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const skipVersion = flag("--skip-version");
const allowEmpty = flag("--allow-empty");
const noGit = flag("--no-git");
const dryRun = flag("--dry-run");
const skipBuild = flag("--skip-build");
const provenance = flag("--provenance");
const assumeYes = flag("--yes") || flag("-y");
const distTag = option("--tag") ?? "latest";

// Code OTP 2FA courant : initialisé par --otp, puis (re)saisi à la demande.
let otpCode = option("--otp");
const canPrompt = Boolean(process.stdin.isTTY);

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

async function readVersion(): Promise<string> {
  return (await Bun.file(PKG_PATH).json()).version as string;
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
  if (otpCode) a.push("--otp", otpCode);
  if (provenance) a.push("--provenance");
  return a;
}

/** Reconnaît un échec `npm publish` dû à un code OTP manquant, invalide ou expiré. */
function isOtpError(text: string): boolean {
  return /\bEOTP\b|one-time pass(?:word)?/i.test(text);
}

/** Demande un code OTP 2FA et le mémorise pour les publications suivantes. */
async function askOtp(context: string): Promise<void> {
  if (!canPrompt) {
    p.log.error(
      chalk.red(
        `npm réclame un code OTP 2FA (${context}) et l'entrée n'est pas interactive.\n` +
          "Relancez avec `--otp <code>`, ou utilisez un token d'automatisation npm sans 2FA.",
      ),
    );
    process.exit(1);
  }
  const code = await p.password({ message: `Code OTP npm 2FA (${context})` });
  if (p.isCancel(code) || !code.trim()) {
    p.cancel("Publication annulée (pas de code OTP).");
    process.exit(1);
  }
  otpCode = code.trim();
}

/**
 * Publie un package via `npm publish`, en affichant la sortie en direct et en
 * redemandant un code OTP si npm le réclame ou si le code a expiré entre deux
 * publications (jusqu'à 3 tentatives).
 */
async function publishPackage(label: string, cwd: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const proc = Bun.spawn({ cmd: publishArgs(), cwd, stdout: "inherit", stderr: "pipe" });
    let stderr = "";
    const decoder = new TextDecoder();
    for await (const chunk of proc.stderr) {
      const text = decoder.decode(chunk, { stream: true });
      stderr += text;
      process.stderr.write(text);
    }
    const code = await proc.exited;
    if (code === 0) return;

    if (!dryRun && isOtpError(stderr)) {
      p.log.warn(
        attempt === 1
          ? `${label} : npm demande un code OTP 2FA.`
          : `${label} : code OTP refusé ou expiré, nouvelle saisie.`,
      );
      await askOtp(label);
      continue;
    }

    p.log.error(chalk.red(`Échec de la publication de ${label} (code ${code}).`));
    p.log.error(chalk.red("Les packages déjà publiés le restent ; relancez pour reprendre."));
    process.exit(1);
  }
  p.log.error(chalk.red(`Échec de la publication de ${label} : trop de tentatives OTP.`));
  process.exit(1);
}

// --- Déroulé -------------------------------------------------------------------

async function main(): Promise<void> {
  p.intro(chalk.bgBlue.black(" rendu publish "));
  p.log.info(`Package racine : ${chalk.cyan(pkg.name)}`);

  const previousVersion = await readVersion();
  p.log.info(`Version actuelle : ${chalk.cyan(previousVersion)}`);
  p.log.info(`dist-tag       : ${chalk.cyan(distTag)}`);
  if (dryRun) p.log.warn(chalk.yellow("Mode --dry-run : aucune publication réelle, aucun fichier modifié."));

  // 1. Identité npm (sauf en dry-run où l'auth n'est pas requise).
  if (!dryRun) {
    const who = await run(["npm", "whoami"], { capture: true });
    if (who.code !== 0) {
      p.log.error(chalk.red("Non authentifié auprès de npm. Lancez `npm login`."));
      process.exit(1);
    }
    p.log.info(`Compte npm     : ${chalk.cyan(who.stdout.trim())}`);
  }

  // 2. Incrément de version via Tegami.
  let version = previousVersion;
  let bumped = false;

  if (skipVersion) {
    p.log.info("--skip-version : la version n'est pas modifiée.");
  } else if (dryRun) {
    p.log.step("Bump qui serait appliqué par Tegami :");
    await run(["node", "scripts/tegami.mts", "plan"]);
  } else {
    // Arbre git sale : le commit de release embarquerait ces changements.
    const status = await run(["git", "status", "--porcelain"], { capture: true });
    if (status.stdout.trim().length > 0 && !noGit) {
      p.log.warn(chalk.yellow("L'arbre de travail git n'est pas propre :"));
      p.log.message(status.stdout.trim());
      if (!assumeYes) {
        const ok = await p.confirm({
          message: "Continuer ? Le commit de release inclura ces changements.",
          initialValue: false,
        });
        if (p.isCancel(ok) || !ok) {
          p.cancel("Publication annulée.");
          process.exit(1);
        }
      }
    }

    // Verrou Tegami résiduel : `tegami publish` n'est jamais utilisé ici, donc
    // un publish-lock présent est toujours obsolète et bloquerait `tegami version`.
    if (existsSync(LOCK_PATH)) await rm(LOCK_PATH, { force: true });

    p.log.step("Calcul et application du bump de version (tegami version)…");
    const res = await run(["node", "scripts/tegami.mts", "version"]);
    if (res.code !== 0) {
      p.log.error(chalk.red("`tegami version` a échoué."));
      process.exit(1);
    }

    version = await readVersion();
    bumped = version !== previousVersion;

    if (!bumped && !allowEmpty) {
      p.log.warn(
        "Aucun changement de version détecté. Ajoutez des commits conventionnels " +
          "(`feat:`, `fix:`…) ou lancez `bun run changelog`, puis relancez.",
      );
      p.outro("Rien à publier.");
      return;
    }
    if (bumped) p.log.success(`Nouvelle version : ${chalk.green(version)}`);
    else p.log.info(`--allow-empty : republication de la version ${chalk.cyan(version)}.`);
  }

  // 3. Build des binaires.
  if (skipBuild || dryRun) {
    p.log.info(
      dryRun && !skipBuild
        ? "--dry-run : compilation ignorée (les binaires présents sont réutilisés)."
        : "--skip-build : compilation ignorée.",
    );
  } else {
    const s = p.spinner();
    s.start("Compilation des binaires natifs (bun run build)");
    const build = await run(["bun", "run", "build"]);
    if (build.code !== 0) {
      s.error("Échec de la compilation.");
      process.exit(1);
    }
    s.stop("Binaires compilés et versions synchronisées.");
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

  // 5. Commit + tag git de la release.
  const gitTag = `${pkg.name}@${version}`;
  if (bumped && !dryRun && !noGit) {
    const doGit = assumeYes
      ? true
      : await p.confirm({
          message: `Commiter la release et créer le tag ${chalk.cyan(gitTag)} ?`,
          initialValue: true,
        });
    if (p.isCancel(doGit) || !doGit) {
      p.log.warn("Commit/tag ignorés. Pensez à committer manuellement.");
    } else {
      await run(["git", "add", "-A"]);
      await run(["git", "commit", "-m", `release: ${gitTag}`]);
      const tagExists = await run(
        ["git", "rev-parse", "-q", "--verify", `refs/tags/${gitTag}`],
        { capture: true },
      );
      if (tagExists.code === 0) p.log.warn(`Le tag ${gitTag} existe déjà, non recréé.`);
      else await run(["git", "tag", gitTag]);
    }
  }

  // 6. État de publication de chaque package pour cette version.
  const subPackages = TARGETS.map((t) => ({
    name: `@arthur.eudeline/rendu-${t.suffix}`,
    dir: join(ROOT, "npm", `rendu-${t.suffix}`),
  }));

  const plan: { name: string; dir: string; already: boolean }[] = [];
  const checkSpinner = p.spinner();
  checkSpinner.start("Vérification des versions déjà publiées");
  for (const sp of subPackages) {
    plan.push({ ...sp, already: await isPublished(sp.name, version) });
  }
  const rootAlready = await isPublished(pkg.name, version);
  checkSpinner.stop("Vérification terminée.");

  for (const item of plan) {
    p.log.step(
      `${item.name}@${version} → ${item.already ? chalk.dim("déjà publié, ignoré") : chalk.green("à publier")}`,
    );
  }
  p.log.step(
    `${pkg.name}@${version} → ${rootAlready ? chalk.dim("déjà publié, ignoré") : chalk.green("à publier")}`,
  );

  const toPublish = plan.filter((i) => !i.already).length + (rootAlready ? 0 : 1);
  if (toPublish === 0) {
    p.outro(chalk.green("Tout est déjà publié pour cette version. Rien à faire."));
    return;
  }

  // 7. Confirmation.
  if (!assumeYes && !dryRun) {
    const ok = await p.confirm({
      message: `Publier ${toPublish} package(s) en version ${version} sur npm ?`,
      initialValue: false,
    });
    if (p.isCancel(ok) || !ok) {
      p.cancel("Publication annulée.");
      process.exit(1);
    }
  }

  // 8. Pré-saisie du code OTP 2FA : évite qu'un premier `npm publish` (25-40 Mo)
  //    parte pour rien si le compte a la 2FA. Vide = compte sans 2FA / token.
  if (!dryRun && !otpCode && canPrompt) {
    const code = await p.password({
      message: "Code OTP npm 2FA (laisser vide si le compte n'a pas de 2FA ou utilise un token)",
    });
    if (p.isCancel(code)) {
      p.cancel("Publication annulée.");
      process.exit(1);
    }
    if (code.trim()) otpCode = code.trim();
  }

  // 9. Publication : sous-packages d'abord, racine ensuite.
  for (const item of plan) {
    if (item.already) continue;
    p.log.step(`Publication de ${item.name}…`);
    await publishPackage(item.name, item.dir);
  }

  if (!rootAlready) {
    p.log.step(`Publication de ${pkg.name}…`);
    await publishPackage(pkg.name, ROOT);
  }

  // 10. Nettoyage du verrou Tegami (non utilisé pour la publication).
  if (!dryRun && existsSync(LOCK_PATH)) await rm(LOCK_PATH, { force: true });

  p.outro(
    dryRun
      ? chalk.green("Dry-run terminé : aucun fichier modifié, rien publié.")
      : chalk.green(
          `Publié : ${pkg.name}@${version} et ses ${TARGETS.length} binaires.` +
            (bumped && !noGit ? ` Pensez à pousser : ${chalk.bold("git push --follow-tags")}` : ""),
        ),
  );
}

main().catch((err) => {
  p.log.error(chalk.red(err instanceof Error ? (err.stack ?? err.message) : String(err)));
  process.exit(1);
});
