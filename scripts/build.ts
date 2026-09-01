#!/usr/bin/env bun
/**
 * Compile le binaire standalone Rendu pour chaque plateforme supportée et
 * génère les sous-packages npm correspondants dans npm/rendu-<plateforme>/.
 * Ces sous-packages sont référencés en `optionalDependencies` par le
 * package racine (voir bin/rendu.js), à la manière d'esbuild/swc.
 */
import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };

interface Target {
  bunTarget: string;
  suffix: string;
  os: string;
  cpu: string;
  binaryName: string;
}

const TARGETS: Target[] = [
  { bunTarget: "bun-darwin-arm64", suffix: "darwin-arm64", os: "darwin", cpu: "arm64", binaryName: "rendu" },
  { bunTarget: "bun-darwin-x64", suffix: "darwin-x64", os: "darwin", cpu: "x64", binaryName: "rendu" },
  { bunTarget: "bun-linux-arm64", suffix: "linux-arm64", os: "linux", cpu: "arm64", binaryName: "rendu" },
  { bunTarget: "bun-linux-x64", suffix: "linux-x64", os: "linux", cpu: "x64", binaryName: "rendu" },
  { bunTarget: "bun-windows-x64", suffix: "win32-x64", os: "win32", cpu: "x64", binaryName: "rendu.exe" },
];

const ROOT = join(import.meta.dir, "..");
const version = pkg.version;

// Le DSN Sentry est injecté en dur dans le binaire compilé (--define), car
// les étudiants n'ont pas de variable d'environnement RENDU_SENTRY_DSN sur
// leur poste. Sans elle, la remontée d'erreurs est silencieusement désactivée.
const sentryDsn = process.env.RENDU_SENTRY_DSN;
if (!sentryDsn) {
  console.warn(
    "⚠ RENDU_SENTRY_DSN non défini : la remontée d'erreurs Sentry sera désactivée dans ce build.",
  );
}

for (const target of TARGETS) {
  const pkgDir = join(ROOT, "npm", `rendu-${target.suffix}`);
  const binDir = join(pkgDir, "bin");
  await mkdir(binDir, { recursive: true });

  const outfile = join(binDir, target.binaryName);
  console.log(`→ Compilation pour ${target.suffix}…`);

  const proc = Bun.spawn({
    cmd: [
      "bun",
      "build",
      "./src/index.ts",
      "--compile",
      `--target=${target.bunTarget}`,
      ...(sentryDsn ? [`--define:process.env.RENDU_SENTRY_DSN=${JSON.stringify(sentryDsn)}`] : []),
      "--outfile",
      outfile,
    ],
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Échec de la compilation pour ${target.suffix} (code ${exitCode})`);
  }

  if (target.os !== "win32") {
    await chmod(outfile, 0o755);
  }

  const subPackageJson = {
    name: `@arthur.eudeline/rendu-${target.suffix}`,
    version,
    description: `Binaire natif de Rendu pour ${target.os}/${target.cpu}.`,
    os: [target.os],
    cpu: [target.cpu],
    license: pkg.license,
  };

  await Bun.write(
    join(pkgDir, "package.json"),
    JSON.stringify(subPackageJson, null, 2) + "\n",
  );
}

// Garde les versions des optionalDependencies du package racine synchronisées.
const rootPackageJsonPath = join(ROOT, "package.json");
const rootPackageJson = await Bun.file(rootPackageJsonPath).json();
for (const target of TARGETS) {
  rootPackageJson.optionalDependencies[`@arthur.eudeline/rendu-${target.suffix}`] = version;
}
await Bun.write(rootPackageJsonPath, JSON.stringify(rootPackageJson, null, 2) + "\n");

console.log(`\n✔ Compilation terminée pour ${TARGETS.length} plateformes (version ${version}).`);
