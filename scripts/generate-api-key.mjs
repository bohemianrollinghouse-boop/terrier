/**
 * Génère une clé d'API pour Terrier et l'écrit dans .env.local (non versionné).
 *
 *   node scripts/generate-api-key.mjs
 *
 * Relancer le script fait tourner la clé : l'ancienne cesse aussitôt de
 * fonctionner, et il faut la remplacer côté ChatGPT. En production, la clé ne
 * vit pas dans un fichier mais dans Secret Manager :
 *
 *   firebase apphosting:secrets:set TERRIER_API_KEY
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

const key = `trr_${randomBytes(24).toString("base64url")}`;

const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const withoutKey = existing
  .split("\n")
  .filter((line) => !line.startsWith("TERRIER_API_KEY="))
  .join("\n")
  .replace(/\n+$/, "");

writeFileSync(envPath, `${withoutKey}\nTERRIER_API_KEY=${key}\n`, "utf8");

console.log("Clé d'API écrite dans .env.local.");
console.log("Pour la lire :   node -e \"console.log(require('fs').readFileSync('.env.local','utf8'))\"");
console.log("Redémarrez le serveur de développement pour qu'elle soit prise en compte.");
