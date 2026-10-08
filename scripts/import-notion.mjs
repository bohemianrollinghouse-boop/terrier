/**
 * Importe l'export Notion (import/) dans Firestore, en direct.
 *
 *   node scripts/import-notion.mjs            → émulateur local (.env.local)
 *   FIRESTORE_EMULATOR_HOST= node scripts/... → projet Firebase réel
 *
 * L'import est idempotent : les identifiants de page sont dérivés des
 * identifiants Notion, relancer le script met à jour au lieu de dupliquer.
 *
 * Viser le projet réel demande des identifiants Google (gcloud auth
 * application-default login). Sans eux, scripts/import-via-api.mjs fait le
 * même travail à travers l'API HTTP, avec la clé d'API pour seul sésame.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { buildDatabase, buildDocs, buildRows, countBodies } from "./notion-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// .env.local à la main : le script tourne hors de Next.
if (existsSync(path.join(root, ".env.local"))) {
  for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? "terrier-local";
const useEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
if (!getApps().length) {
  initializeApp(useEmulator ? { projectId } : { credential: applicationDefault(), projectId });
}
const db = getFirestore();
const now = () => new Date().toISOString();

const page = (fields) => ({
  parentId: null,
  dbId: null,
  kind: "doc",
  title: "",
  icon: "",
  position: 0,
  isFavorite: false,
  deletedAt: null,
  createdAt: now(),
  updatedAt: now(),
  rev: 1,
  updatedBy: "import Notion",
  props: {},
  schema: [],
  views: [],
  blocks: [],
  ...fields,
});

async function importTasks() {
  const base = buildDatabase();
  await db
    .collection("pages")
    .doc(base.id)
    .set(
      page({
        kind: base.kind,
        title: base.title,
        icon: base.icon,
        position: base.position,
        schema: base.schema,
        views: base.views,
      }),
    );

  const rows = buildRows();
  for (const row of rows) {
    await db
      .collection("pages")
      .doc(row.id)
      .set(
        page({
          parentId: base.id,
          dbId: base.id,
          title: row.title,
          icon: row.icon,
          position: row.position,
          createdAt: row.createdAt ?? now(),
          props: row.props,
          blocks: row.blocks,
        }),
      );
  }
  return { dbId: base.id, written: rows.length };
}

async function importDocs() {
  const docs = buildDocs();
  for (const doc of docs) {
    await db
      .collection("pages")
      .doc(doc.id)
      .set(
        page({
          parentId: doc.parentId,
          title: doc.title,
          icon: doc.icon,
          position: doc.position,
          blocks: doc.blocks,
        }),
      );
  }
  return docs.length;
}

const bodies = countBodies();
const tasks = await importTasks();
const docs = await importDocs();

console.log(`Cible        : ${useEmulator ? `émulateur (${process.env.FIRESTORE_EMULATOR_HOST})` : projectId}`);
console.log(`Corps trouvés: ${bodies} fichier(s) dans import/bodies`);
console.log(`Base         : ${tasks.dbId} — ${tasks.written} tâches`);
console.log(`Documents    : ${docs}`);
