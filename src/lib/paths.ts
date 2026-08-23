import { homedir } from "node:os";
import { join } from "node:path";

/** Dossier personnel de configuration de Rendu (~/.rendu) */
export const CONFIG_DIR = join(homedir(), ".rendu");

/** Fichier de configuration utilisateur (~/.rendu/config.json) */
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
