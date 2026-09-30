/**
 * Importe l'export Notion (import/) dans Firestore.
 *
 *   node scripts/import-notion.mjs            → émulateur local (.env.local)
 *   FIRESTORE_EMULATOR_HOST= node scripts/... → projet Firebase réel
 *
 * L'import est idempotent : les identifiants de page sont dérivés des
 * identifiants Notion, relancer le script met à jour au lieu de dupliquer.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { markdownToBlocks } from "./markdown-to-blocks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT_DIR = path.join(root, "import");
const BODIES_DIR = path.join(IMPORT_DIR, "bodies");

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

const page = (id, fields) => ({
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

function bodyFor(name) {
  const file = path.join(BODIES_DIR, `${name}.md`);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

/* ------------------------------------------------------- base de données */

const COLORS = {
  "🔴 Bloquant": "red",
  "🟠 Fonctionnalité": "orange",
  "🟡 Confort": "yellow",
  "À faire": "default",
  "En cours": "blue",
  Bloqué: "red",
  Fait: "green",
  Bug: "red",
  Feature: "blue",
  "Dette technique": "brown",
  "Validation device": "purple",
  "Infra / Release": "gray",
  Docs: "default",
  "Natif iOS/Android": "purple",
  Notifications: "orange",
  Recettes: "pink",
  Repas: "yellow",
  "Listes / Inventaire": "green",
  Tâches: "blue",
  Agenda: "brown",
  "Firebase / Functions": "red",
  Tests: "gray",
  "Build / Perf": "default",
  iOS: "blue",
  Android: "green",
  Web: "purple",
};

const options = (names) => names.map((name) => ({ name, color: COLORS[name] ?? "default" }));

async function importTasks() {
  const source = JSON.parse(readFileSync(path.join(IMPORT_DIR, "tasks.json"), "utf8"));

  const schema = [
    { id: "titre", name: "Tâche", type: "text" },
    { id: "statut", name: "Statut", type: "select", options: options(source.schema["Statut"].options) },
    { id: "priorite", name: "Priorité", type: "select", options: options(source.schema["Priorité"].options) },
    { id: "type", name: "Type", type: "select", options: options(source.schema["Type"].options) },
    { id: "module", name: "Module", type: "multi_select", options: options(source.schema["Module"].options) },
    { id: "plateforme", name: "Plateforme", type: "multi_select", options: options(source.schema["Plateforme"].options) },
    { id: "manuel", name: "Act. man.", type: "checkbox", description: source.schema["Act. man."].description },
    { id: "source", name: "Source", type: "text", description: source.schema["Source"].description },
    { id: "echeance", name: "Échéance", type: "date" },
    { id: "ref", name: "Réf", type: "number" },
  ];

  const views = [
    {
      id: "table",
      name: "Tableau",
      type: "table",
      filters: [{ property: "Statut", operator: "is_not", value: "Fait" }],
      visible: ["Tâche", "Statut", "Priorité", "Type", "Module", "Plateforme", "Act. man."],
    },
    { id: "kanban", name: "Kanban", type: "board", groupBy: "Statut", sortBy: { property: "Priorité", direction: "asc" } },
    {
      id: "bloquants",
      name: "Bloquants",
      type: "table",
      filters: [
        { property: "Priorité", operator: "is", value: "🔴 Bloquant" },
        { property: "Statut", operator: "is_not", value: "Fait" },
      ],
      visible: ["Tâche", "Statut", "Type", "Plateforme", "Source"],
    },
    {
      id: "manuel",
      name: "À faire à la main",
      type: "table",
      filters: [
        { property: "Act. man.", operator: "is_checked" },
        { property: "Statut", operator: "is_not", value: "Fait" },
      ],
      visible: ["Tâche", "Statut", "Priorité", "Plateforme", "Source"],
    },
    { id: "tout", name: "Tout", type: "table", visible: ["Tâche", "Statut", "Priorité", "Type", "Module", "Réf"] },
  ];

  const dbId = "db-my-rolling-day";
  await db
    .collection("pages")
    .doc(dbId)
    .set(
      page(dbId, {
        kind: "database",
        title: "My Rolling Day — Suivi de dev",
        icon: "🚐",
        position: 2,
        schema,
        views,
      }),
    );

  let written = 0;
  for (const row of source.rows) {
    const id = `task-${row.ref}`;
    await db.collection("pages").doc(id).set(
      page(id, {
        parentId: dbId,
        dbId,
        title: row.titre,
        icon: "",
        position: row.ref,
        createdAt: row.ajouteLe ?? now(),
        props: {
          Tâche: row.titre,
          Statut: row.statut,
          Priorité: row.priorite,
          Type: row.type,
          Module: row.module ?? [],
          Plateforme: row.plateforme ?? [],
          "Act. man.": !!row.manuel,
          Source: row.source ?? "",
          Échéance: row.echeance,
          Réf: row.ref,
        },
        blocks: markdownToBlocks(bodyFor(`task-${row.ref}`)),
      }),
    );
    written += 1;
  }
  return { dbId, written };
}

/* ------------------------------------------------------------- documents */

async function importDocs() {
  const manifestPath = path.join(IMPORT_DIR, "pages.json");
  if (!existsSync(manifestPath)) return 0;

  const docs = JSON.parse(readFileSync(manifestPath, "utf8"));
  let written = 0;
  for (const doc of docs) {
    await db.collection("pages").doc(doc.id).set(
      page(doc.id, {
        parentId: doc.parentId ?? null,
        title: doc.title,
        icon: doc.icon ?? "",
        position: doc.position ?? written + 1,
        blocks: markdownToBlocks(bodyFor(doc.id)),
      }),
    );
    written += 1;
  }
  return written;
}

/* ----------------------------------------------------------------- lancer */

const bodies = existsSync(BODIES_DIR) ? readdirSync(BODIES_DIR).filter((f) => f.endsWith(".md")).length : 0;
const tasks = await importTasks();
const docs = await importDocs();

console.log(`Cible        : ${useEmulator ? `émulateur (${process.env.FIRESTORE_EMULATOR_HOST})` : projectId}`);
console.log(`Corps trouvés: ${bodies} fichier(s) dans import/bodies`);
console.log(`Base         : ${tasks.dbId} — ${tasks.written} tâches`);
console.log(`Documents    : ${docs}`);
