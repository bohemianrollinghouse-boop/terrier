/**
 * Importe l'export Notion (import/) à travers l'API HTTP de Terrier.
 *
 *   node scripts/import-via-api.mjs
 *   node scripts/import-via-api.mjs --url http://localhost:3000
 *
 * Pensé pour la production, où écrire dans Firestore en direct réclamerait des
 * identifiants Google : ici la clé d'API suffit. Elle est lue dans la variable
 * TERRIER_API_KEY, ou à défaut dans .env.local, et n'est jamais affichée.
 *
 * Contrairement à import-notion.mjs, les identifiants de page sont attribués
 * par le serveur et non dérivés de Notion : relancer le script créerait des
 * doublons. Il refuse donc de s'exécuter sur un espace déjà peuplé, à moins
 * qu'on insiste avec --force.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDatabase, buildDocs, buildRows, countBodies } from "./notion-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_URL = "https://terrier--terrier-myenn.europe-west4.hosted.app";

const args = process.argv.slice(2);
const force = args.includes("--force");
const urlFlag = args.indexOf("--url");
const base = (urlFlag !== -1 ? args[urlFlag + 1] : process.env.TERRIER_BASE_URL) ?? DEFAULT_URL;

function apiKey() {
  if (process.env.TERRIER_API_KEY) return process.env.TERRIER_API_KEY;
  const envFile = path.join(root, ".env.local");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const match = /^TERRIER_API_KEY=(.*)$/.exec(line.trim());
      if (match) return match[1];
    }
  }
  return null;
}

const key = apiKey();
if (!key) {
  console.error("Aucune clé d'API : définissez TERRIER_API_KEY, ou placez-la dans .env.local.");
  process.exit(1);
}

async function call(method, route, body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const hint = response.status === 401 ? " — la clé d'API n'est pas celle du serveur visé" : "";
    throw new Error(`${method} ${route} a répondu ${response.status}${hint}\n${detail.slice(0, 300)}`);
  }
  return response.json();
}

const creer = async (payload) => (await call("POST", "/api/pages", payload)).page.id;

/* ----------------------------------------------------------------- lancer */

console.log(`Cible : ${base}`);

const existantes = (await call("GET", "/api/pages")).pages ?? [];
if (existantes.length && !force) {
  console.error(`\nL'espace contient déjà ${existantes.length} page(s).`);
  console.error("Cet import n'est pas idempotent : le relancer créerait des doublons.");
  console.error("Videz l'espace d'abord, ou passez --force en connaissance de cause.");
  process.exit(1);
}

const db = buildDatabase();
const dbId = await creer({
  kind: db.kind,
  title: db.title,
  icon: db.icon,
  schema: db.schema,
  views: db.views,
});
console.log(`Base       : ${db.title} (${dbId})`);

const rows = buildRows();
let faites = 0;
for (const row of rows) {
  await creer({ parentId: dbId, dbId, title: row.title, icon: row.icon, props: row.props, blocks: row.blocks });
  faites += 1;
  if (faites % 10 === 0 || faites === rows.length) console.log(`  tâches   : ${faites}/${rows.length}`);
}

// Les identifiants Notion disparaissent au passage : on retient la
// correspondance pour rattacher chaque document à son parent réel.
const reels = new Map();
const docs = buildDocs();
for (const doc of docs) {
  const id = await creer({
    parentId: doc.parentId ? (reels.get(doc.parentId) ?? null) : null,
    title: doc.title,
    icon: doc.icon,
    blocks: doc.blocks,
  });
  reels.set(doc.id, id);
}

console.log(`Documents  : ${docs.length}`);
console.log(`Corps lus  : ${countBodies()} fichier(s) dans import/bodies`);
console.log("\nImport terminé.");
