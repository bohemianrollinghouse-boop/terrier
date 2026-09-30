import { firestore } from "./firebase-admin";
import { sanitizeInline } from "./sanitize";
import {
  blockText,
  emptyBlock,
  newId,
  propertyText,
  type Block,
  type PageKind,
  type PageMeta,
  type PageWithBlocks,
  type PropertyDef,
  type PropertyValue,
  type SearchHit,
  type ViewDef,
} from "./types";

const PAGES = "pages";

/**
 * Un document Firestore par page. Les blocs vivent dans le document : une page
 * s'écrit et se lit d'un seul coup, ce qui colle à la sauvegarde « document
 * complet » du client. Une ligne de base de données est une page comme une
 * autre, avec `dbId` renseigné et ses valeurs dans `props`.
 */
type PageDoc = {
  parentId: string | null;
  dbId: string | null;
  kind: PageKind;
  title: string;
  icon: string;
  position: number;
  isFavorite: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rev: number;
  updatedBy: string;
  props: Record<string, PropertyValue>;
  schema: PropertyDef[];
  views: ViewDef[];
  blocks: Block[];
};

/** Rejetée par writeBlocks quand la page a bougé depuis la lecture du client. */
export class ConflictError extends Error {
  constructor(readonly current: PageWithBlocks) {
    super("La page a été modifiée ailleurs depuis son ouverture.");
    this.name = "ConflictError";
  }
}

const now = () => new Date().toISOString();

function toMeta(id: string, doc: Partial<PageDoc>): PageMeta {
  return {
    id,
    parentId: doc.parentId ?? null,
    dbId: doc.dbId ?? null,
    kind: doc.kind ?? "doc",
    title: doc.title ?? "",
    icon: doc.icon ?? "",
    position: doc.position ?? 0,
    isFavorite: !!doc.isFavorite,
    deletedAt: doc.deletedAt ?? null,
    createdAt: doc.createdAt ?? now(),
    updatedAt: doc.updatedAt ?? now(),
    rev: doc.rev ?? 0,
    updatedBy: doc.updatedBy ?? "",
    props: doc.props ?? {},
    schema: doc.schema ?? [],
    views: doc.views ?? [],
  };
}

function normalizeBlocks(blocks: Block[] | undefined): Block[] {
  if (!blocks?.length) return [];
  // L'ordre du tableau fait foi : pas de champ position à maintenir.
  return blocks.map((block) => ({
    id: block.id || newId(),
    type: block.type ?? "paragraph",
    content: sanitizeInline(block.content ?? ""),
    checked: !!block.checked,
    collapsed: !!block.collapsed,
    indent: Math.max(0, Math.min(8, Number(block.indent) || 0)),
    meta: block.meta ?? {},
  }));
}

/* ------------------------------------------------------------------ pages */

/** Toutes les pages vivantes. Les lignes de base sont exclues de l'arbre. */
export async function listPages(includeRows = false): Promise<PageMeta[]> {
  const snapshot = await firestore().collection(PAGES).get();
  return snapshot.docs
    .map((doc) => toMeta(doc.id, doc.data() as PageDoc))
    .filter((page) => !page.deletedAt && (includeRows || !page.dbId))
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

export async function listRows(dbId: string): Promise<PageMeta[]> {
  const snapshot = await firestore().collection(PAGES).where("dbId", "==", dbId).get();
  return snapshot.docs
    .map((doc) => toMeta(doc.id, doc.data() as PageDoc))
    .filter((page) => !page.deletedAt)
    .sort((a, b) => a.position - b.position);
}

export async function listTrash(): Promise<PageMeta[]> {
  const snapshot = await firestore().collection(PAGES).get();
  return snapshot.docs
    .map((doc) => toMeta(doc.id, doc.data() as PageDoc))
    .filter((page) => page.deletedAt)
    .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
}

export async function getPage(id: string): Promise<PageMeta | null> {
  const doc = await firestore().collection(PAGES).doc(id).get();
  return doc.exists ? toMeta(doc.id, doc.data() as PageDoc) : null;
}

export async function getBlocks(pageId: string): Promise<Block[]> {
  const doc = await firestore().collection(PAGES).doc(pageId).get();
  if (!doc.exists) return [];
  return normalizeBlocks((doc.data() as PageDoc).blocks);
}

async function nextPosition(parentId: string | null, dbId: string | null): Promise<number> {
  const siblings = dbId
    ? await listRows(dbId)
    : (await listPages()).filter((page) => page.parentId === parentId);
  return siblings.reduce((max, page) => Math.max(max, page.position), 0) + 1;
}

export async function createPage(input: {
  parentId?: string | null;
  dbId?: string | null;
  kind?: PageKind;
  title?: string;
  icon?: string;
  blocks?: Block[];
  props?: Record<string, PropertyValue>;
  schema?: PropertyDef[];
  views?: ViewDef[];
  id?: string;
  by?: string;
}): Promise<PageMeta> {
  const id = input.id ?? newId();
  const stamp = now();
  const parentId = input.parentId ?? null;
  const dbId = input.dbId ?? null;

  const doc: PageDoc = {
    parentId,
    dbId,
    kind: input.kind ?? "doc",
    title: input.title ?? "",
    icon: input.icon ?? "",
    position: await nextPosition(parentId, dbId),
    isFavorite: false,
    deletedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
    rev: 1,
    updatedBy: input.by ?? "",
    props: input.props ?? {},
    schema: input.schema ?? [],
    views: input.views ?? [],
    blocks: normalizeBlocks(input.blocks ?? (input.kind === "database" ? [] : [emptyBlock()])),
  };

  await firestore().collection(PAGES).doc(id).set(doc);
  return toMeta(id, doc);
}

export async function updatePage(
  id: string,
  patch: {
    title?: string;
    icon?: string;
    parentId?: string | null;
    isFavorite?: boolean;
    position?: number;
    props?: Record<string, PropertyValue>;
    schema?: PropertyDef[];
    views?: ViewDef[];
  },
  by = "",
): Promise<PageMeta | null> {
  const page = await getPage(id);
  if (!page) return null;

  const update: Record<string, unknown> = { updatedAt: now(), rev: page.rev + 1, updatedBy: by };
  if (patch.title !== undefined) update.title = patch.title.slice(0, 500);
  if (patch.icon !== undefined) update.icon = patch.icon.slice(0, 16);
  if (patch.isFavorite !== undefined) update.isFavorite = patch.isFavorite;
  if (patch.position !== undefined) update.position = patch.position;
  if (patch.schema !== undefined) update.schema = patch.schema;
  if (patch.views !== undefined) update.views = patch.views;
  if (patch.props !== undefined) update.props = { ...page.props, ...patch.props };
  if (patch.parentId !== undefined && !(await isDescendant(patch.parentId, id))) {
    update.parentId = patch.parentId;
    update.position = await nextPosition(patch.parentId, page.dbId);
  }

  await firestore().collection(PAGES).doc(id).update(update);
  return getPage(id);
}

/** Empêche de déplacer une page dans sa propre descendance. */
async function isDescendant(candidate: string | null, ancestor: string): Promise<boolean> {
  if (!candidate) return false;
  if (candidate === ancestor) return true;
  const pages = await listPages(true);
  const byId = new Map(pages.map((page) => [page.id, page]));
  let cursor: string | null = candidate;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
    if (cursor === ancestor) return true;
  }
  return false;
}

async function descendantIds(id: string): Promise<string[]> {
  const snapshot = await firestore().collection(PAGES).get();
  const all = snapshot.docs.map((doc) => toMeta(doc.id, doc.data() as PageDoc));
  const ids = [id];
  for (let cursor = 0; cursor < ids.length; cursor += 1) {
    for (const page of all) {
      // une page de base emporte ses lignes, une page normale emporte ses sous-pages
      if ((page.parentId === ids[cursor] || page.dbId === ids[cursor]) && !ids.includes(page.id)) {
        ids.push(page.id);
      }
    }
  }
  return ids;
}

export async function trashPage(id: string): Promise<void> {
  const stamp = now();
  const batch = firestore().batch();
  for (const child of await descendantIds(id)) {
    batch.update(firestore().collection(PAGES).doc(child), { deletedAt: stamp, updatedAt: stamp });
  }
  await batch.commit();
}

export async function restorePage(id: string): Promise<void> {
  const stamp = now();
  const batch = firestore().batch();
  for (const child of await descendantIds(id)) {
    batch.update(firestore().collection(PAGES).doc(child), { deletedAt: null, updatedAt: stamp });
  }
  await batch.commit();

  // Si le parent est lui-même à la corbeille, la page remonte à la racine.
  const page = await getPage(id);
  if (page?.parentId) {
    const parent = await getPage(page.parentId);
    if (!parent || parent.deletedAt) await updatePage(id, { parentId: null });
  }
}

export async function deletePageForever(id: string): Promise<void> {
  const batch = firestore().batch();
  for (const child of await descendantIds(id)) {
    batch.delete(firestore().collection(PAGES).doc(child));
  }
  await batch.commit();
}

export async function emptyTrash(): Promise<void> {
  const batch = firestore().batch();
  for (const page of await listTrash()) batch.delete(firestore().collection(PAGES).doc(page.id));
  await batch.commit();
}

/* ----------------------------------------------------------------- blocks */

/**
 * Écrit le document complet. Si l'appelant annonce la révision qu'il a lue et
 * qu'elle n'est plus la bonne, l'écriture est refusée : à deux, mieux vaut un
 * refus visible qu'un écrasement silencieux du travail de l'autre.
 */
export async function writeBlocks(
  pageId: string,
  blocks: Block[],
  options: { expectedRev?: number; by?: string } = {},
): Promise<{ blocks: Block[]; rev: number }> {
  const normalized = normalizeBlocks(blocks);
  const ref = firestore().collection(PAGES).doc(pageId);

  return firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Page introuvable");
    const doc = snapshot.data() as PageDoc;
    const currentRev = doc.rev ?? 0;

    if (options.expectedRev !== undefined && options.expectedRev !== currentRev) {
      throw new ConflictError({
        page: toMeta(pageId, doc),
        blocks: normalizeBlocks(doc.blocks),
      });
    }

    const rev = currentRev + 1;
    transaction.update(ref, { blocks: normalized, updatedAt: now(), rev, updatedBy: options.by ?? "" });
    return { blocks: normalized, rev };
  });
}

/* ----------------------------------------------------------------- search */

export async function search(query: string, limit = 20): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const snapshot = await firestore().collection(PAGES).get();
  const hits: (SearchHit & { updatedAt: string })[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() as PageDoc;
    if (data.deletedAt) continue;

    const body = [
      ...(data.blocks ?? []).map((block) => blockText(block.content)),
      ...Object.values(data.props ?? {}).map(propertyText),
    ]
      .filter(Boolean)
      .join(" ");

    const haystack = `${data.title ?? ""} ${body}`.toLowerCase();
    if (!haystack.includes(q)) continue;

    const at = body.toLowerCase().indexOf(q);
    const start = at < 0 ? 0 : Math.max(0, at - 40);
    const snippet = body.slice(start, start + 140);
    hits.push({
      id: doc.id,
      title: data.title ?? "",
      icon: data.icon ?? "",
      snippet: (start > 0 ? "…" : "") + snippet + (body.length > start + 140 ? "…" : ""),
      updatedAt: data.updatedAt ?? "",
    });
  }

  return hits
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map(({ id, title, icon, snippet }) => ({ id, title, icon, snippet }));
}

/* ------------------------------------------------------------------ setup */

export async function isEmpty(): Promise<boolean> {
  const snapshot = await firestore().collection(PAGES).limit(1).get();
  return snapshot.empty;
}
