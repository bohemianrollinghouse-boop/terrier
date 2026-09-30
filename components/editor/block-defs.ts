import type { BlockType } from "@/lib/types";

export type BlockDef = {
  type: BlockType;
  label: string;
  hint: string;
  glyph: string;
  keywords: string[];
};

export const BLOCK_DEFS: BlockDef[] = [
  {
    type: "paragraph",
    label: "Texte",
    hint: "Commencez à écrire du texte simple.",
    glyph: "Aa",
    keywords: ["texte", "text", "paragraphe", "p"],
  },
  { type: "h1", label: "Titre 1", hint: "Grand titre de section.", glyph: "H1", keywords: ["titre", "h1", "heading"] },
  { type: "h2", label: "Titre 2", hint: "Titre de section moyen.", glyph: "H2", keywords: ["titre", "h2", "heading"] },
  { type: "h3", label: "Titre 3", hint: "Petit titre de section.", glyph: "H3", keywords: ["titre", "h3", "heading"] },
  {
    type: "bulleted",
    label: "Liste à puces",
    hint: "Une liste simple, non ordonnée.",
    glyph: "•",
    keywords: ["liste", "puce", "bullet", "ul"],
  },
  {
    type: "numbered",
    label: "Liste numérotée",
    hint: "Une liste ordonnée.",
    glyph: "1.",
    keywords: ["liste", "numero", "ordered", "ol"],
  },
  {
    type: "todo",
    label: "Case à cocher",
    hint: "Suivez vos tâches avec une liste.",
    glyph: "☑",
    keywords: ["todo", "tache", "case", "checkbox", "cocher"],
  },
  {
    type: "toggle",
    label: "Liste à basculer",
    hint: "Masquez le contenu indenté dessous.",
    glyph: "▸",
    keywords: ["toggle", "basculer", "replier", "accordeon"],
  },
  {
    type: "quote",
    label: "Citation",
    hint: "Mettez en avant une citation.",
    glyph: "“",
    keywords: ["citation", "quote", "blockquote"],
  },
  {
    type: "callout",
    label: "Encadré",
    hint: "Faites ressortir une information.",
    glyph: "\u{1F4A1}",
    keywords: ["encadre", "callout", "info", "astuce"],
  },
  {
    type: "code",
    label: "Code",
    hint: "Un extrait de code à largeur fixe.",
    glyph: "{ }",
    keywords: ["code", "snippet", "pre"],
  },
  {
    type: "divider",
    label: "Séparateur",
    hint: "Une ligne pour séparer deux parties.",
    glyph: "—",
    keywords: ["separateur", "divider", "ligne", "hr"],
  },
  {
    type: "image",
    label: "Image",
    hint: "Intégrez une image par son lien.",
    glyph: "\u{1F5BC}",
    keywords: ["image", "photo", "img", "illustration"],
  },
];

export const DEF_BY_TYPE: Record<BlockType, BlockDef> = BLOCK_DEFS.reduce(
  (acc, def) => ({ ...acc, [def.type]: def }),
  {} as Record<BlockType, BlockDef>,
);

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function filterDefs(query: string): BlockDef[] {
  const q = normalize(query.trim());
  if (!q) return BLOCK_DEFS;
  return BLOCK_DEFS.filter(
    (def) => normalize(def.label).includes(q) || def.keywords.some((kw) => normalize(kw).startsWith(q)),
  );
}

export const CODE_LANGS = [
  "texte",
  "bash",
  "css",
  "html",
  "javascript",
  "json",
  "python",
  "rust",
  "sql",
  "typescript",
];
