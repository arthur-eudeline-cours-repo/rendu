#!/usr/bin/env node
// Lanceur npm de Rendu : délègue l'exécution au binaire natif standalone
// (compilé avec `bun build --compile`) publié pour la plateforme courante
// dans le sous-package @arthur.eudeline/rendu-<os>-<arch> (optionalDependency).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

const PLATFORM_PACKAGES = {
  "darwin-arm64": "@arthur.eudeline/rendu-darwin-arm64",
  "darwin-x64": "@arthur.eudeline/rendu-darwin-x64",
  "linux-arm64": "@arthur.eudeline/rendu-linux-arm64",
  "linux-x64": "@arthur.eudeline/rendu-linux-x64",
  "win32-x64": "@arthur.eudeline/rendu-win32-x64",
};

const platformKey = `${process.platform}-${process.arch}`;
const packageName = PLATFORM_PACKAGES[platformKey];

if (!packageName) {
  console.error(
    `rendu : plateforme non supportée (${platformKey}).\n` +
      "Plateformes disponibles : " +
      Object.keys(PLATFORM_PACKAGES).join(", "),
  );
  process.exit(1);
}

const binaryName = process.platform === "win32" ? "rendu.exe" : "rendu";

let binaryPath;
try {
  binaryPath = require_.resolve(`${packageName}/bin/${binaryName}`);
} catch {
  console.error(
    `rendu : le binaire natif "${packageName}" est introuvable.\n` +
      "Essayez de réinstaller le paquet : npm install -g @arthur.eudeline/rendu",
  );
  process.exit(1);
}

const result = spawnSync(binaryPath, process.argv.slice(2), { stdio: "inherit" });

if (result.error) {
  console.error(`rendu : impossible de lancer le binaire natif (${result.error.message}).`);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
