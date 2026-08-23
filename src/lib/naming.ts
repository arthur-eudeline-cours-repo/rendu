import type { UserConfig } from "./config";

/** Retire les accents et normalise les espaces d'une chaîne pour un usage filesystem-safe. */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Construit le nom "NOM_Prenom" utilisé comme nom de dossier racine de
 * l'archive et comme nom du fichier .zip produit.
 */
export function toFolderName(config: UserConfig): string {
  const lastName = slugify(config.lastName).toUpperCase();
  const firstName = slugify(config.firstName);

  return `${lastName}_${firstName}`;
}
