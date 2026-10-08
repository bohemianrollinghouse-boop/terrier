/**
 * Lecture de l'export Notion (import/) et construction des pages Terrier.
 *
 * Deux scripts s'appuient dessus : import-notion.mjs, qui écrit directement
 * dans Firestore, et import-via-api.mjs, qui passe par l'API HTTP. Le schéma
 * des propriétés et la définition des vues ne vivent donc qu'à un seul endroit.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownToBlocks } from "./markdown-to-blocks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const IMPORT_DIR = path.join(root, "import");
const BODIES_DIR = path.join(IMPORT_DIR, "bodies");

export const DB_ID = "db-my-rolling-day";

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

export function bodyFor(name) {
  const file = path.join(BODIES_DIR, `${name}.md`);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

export function countBodies() {
  return existsSync(BODIES_DIR) ? readdirSync(BODIES_DIR).filter((f) => f.endsWith(".md")).length : 0;
}

function tasksSource() {
  return JSON.parse(readFileSync(path.join(IMPORT_DIR, "tasks.json"), "utf8"));
}

/** La base « My Rolling Day » : ses propriétés typées et ses cinq vues. */
export function buildDatabase() {
  const source = tasksSource();
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

  return { id: DB_ID, kind: "database", title: "My Rolling Day — Suivi de dev", icon: "🚐", position: 2, schema, views };
}

/** Les lignes de la base : une par tâche, corps de page compris. */
export function buildRows() {
  return tasksSource().rows.map((row) => ({
    id: `task-${row.ref}`,
    title: row.titre,
    icon: "",
    position: row.ref,
    createdAt: row.ajouteLe ?? null,
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
  }));
}

/** Les documents hors base, dans l'ordre où ils doivent être créés (parents d'abord). */
export function buildDocs() {
  const manifest = path.join(IMPORT_DIR, "pages.json");
  if (!existsSync(manifest)) return [];
  return JSON.parse(readFileSync(manifest, "utf8")).map((doc, index) => ({
    id: doc.id,
    parentId: doc.parentId ?? null,
    title: doc.title,
    icon: doc.icon ?? "",
    position: doc.position ?? index + 1,
    blocks: markdownToBlocks(bodyFor(doc.id)),
  }));
}
