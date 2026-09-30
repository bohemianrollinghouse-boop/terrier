/** Types partagés client + serveur. Aucun import Node ici. */

export const BLOCK_TYPES = [
  "paragraph",
  "h1",
  "h2",
  "h3",
  "bulleted",
  "numbered",
  "todo",
  "toggle",
  "quote",
  "callout",
  "code",
  "divider",
  "image",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/** Types qui ne contiennent pas de texte éditable. */
export const VOID_BLOCKS: BlockType[] = ["divider", "image"];

export type Block = {
  id: string;
  type: BlockType;
  /** HTML inline restreint (b, i, u, s, code, a, br). */
  content: string;
  checked: boolean;
  collapsed: boolean;
  indent: number;
  /** Extras selon le type : { lang } pour code, { url, caption } pour image. */
  meta: Record<string, string>;
};

/* --------------------------------------------------- bases de données */

export const PROPERTY_TYPES = ["text", "select", "multi_select", "checkbox", "date", "number", "url"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const OPTION_COLORS = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;
export type OptionColor = (typeof OPTION_COLORS)[number];

export type PropertyOption = { name: string; color: OptionColor };

export type PropertyDef = {
  id: string;
  name: string;
  type: PropertyType;
  description?: string;
  options?: PropertyOption[];
};

export type ViewFilter = {
  property: string;
  operator: "is" | "is_not" | "contains" | "is_checked" | "is_not_checked" | "is_not_empty";
  value?: string;
};

export type ViewDef = {
  id: string;
  name: string;
  type: "table" | "board";
  /** Nom de la propriété select servant de colonnes en Kanban, ou de regroupement en tableau. */
  groupBy?: string;
  filters?: ViewFilter[];
  sortBy?: { property: string; direction: "asc" | "desc" };
  /** Propriétés affichées, dans l'ordre. Vide = toutes. */
  visible?: string[];
};

/** Valeur d'une propriété sur une ligne. */
export type PropertyValue = string | string[] | boolean | number | null;

export type PageKind = "doc" | "database";

export type PageMeta = {
  id: string;
  parentId: string | null;
  /** Renseigné quand la page est une ligne d'une base : l'id de la page base. */
  dbId: string | null;
  kind: PageKind;
  title: string;
  icon: string;
  position: number;
  isFavorite: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Incrémenté à chaque écriture : sert à détecter les modifications concurrentes. */
  rev: number;
  /** Adresse de la dernière personne à avoir écrit, ou "api" pour un agent. */
  updatedBy: string;
  /** Valeurs des propriétés, pour une ligne de base. */
  props: Record<string, PropertyValue>;
  /** Schéma et vues, pour une page de type base. */
  schema: PropertyDef[];
  views: ViewDef[];
};

export type PageWithBlocks = { page: PageMeta; blocks: Block[] };

export type SearchHit = {
  id: string;
  title: string;
  icon: string;
  snippet: string;
};

export const UNTITLED = "Sans titre";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyBlock(type: BlockType = "paragraph", indent = 0): Block {
  return { id: newId(), type, content: "", checked: false, collapsed: false, indent, meta: {} };
}

/** Texte brut d'un bloc (pour les extraits de recherche et les placeholders). */
export function blockText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Texte lisible d'une valeur de propriété (recherche, export, affichage brut). */
export function propertyText(value: PropertyValue): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "oui" : "non";
  return String(value);
}

export function findProperty(schema: PropertyDef[], name: string): PropertyDef | undefined {
  return schema.find((property) => property.name === name);
}

/** Classes Tailwind par couleur d'option, en clair comme en sombre. */
export const OPTION_CLASS: Record<OptionColor, string> = {
  default: "bg-hover text-ink-soft",
  gray: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  brown: "bg-amber-800/15 text-amber-800 dark:text-amber-500",
  orange: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  yellow: "bg-yellow-500/20 text-yellow-800 dark:text-yellow-400",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  purple: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  pink: "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  red: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export function optionColor(property: PropertyDef | undefined, name: string): OptionColor {
  return property?.options?.find((option) => option.name === name)?.color ?? "default";
}
