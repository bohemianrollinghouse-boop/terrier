import type { Block, PageMeta, PageWithBlocks, PropertyValue, SearchHit } from "./types";

/** Renvoyé par saveBlocks quand quelqu'un d'autre a écrit entre-temps. */
export type SaveConflict = { conflict: true; page: PageMeta; blocks: Block[] };
export type SaveResult = { conflict: false; rev: number } | SaveConflict;

async function json<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
  });
  if (response.status === 401) {
    // Rechargement complet volontaire : la session a expiré, on veut un rendu
    // serveur neuf plutôt qu'une navigation cliente avec un état périmé.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Session expirée");
  }
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${input} -> ${response.status}`);
  return (await response.json()) as T;
}

export const api = {
  listPages: () => json<{ pages: PageMeta[] }>("/api/pages").then((r) => r.pages),

  getPage: (id: string) => json<PageWithBlocks & { rows?: PageMeta[] }>(`/api/pages/${id}`),

  createPage: (input: { parentId?: string | null; title?: string; icon?: string; kind?: "doc" | "database" } = {}) =>
    json<{ page: PageMeta }>("/api/pages", { method: "POST", body: JSON.stringify(input) }).then((r) => r.page),

  updatePage: (
    id: string,
    patch: Partial<Pick<PageMeta, "title" | "icon" | "parentId" | "isFavorite" | "position" | "schema" | "views">> & {
      props?: Record<string, PropertyValue>;
    },
  ) => json<{ page: PageMeta }>(`/api/pages/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).then((r) => r.page),

  trashPage: (id: string) => json<{ ok: true }>(`/api/pages/${id}`, { method: "DELETE" }),

  deletePageForever: (id: string) => json<{ ok: true }>(`/api/pages/${id}?forever=1`, { method: "DELETE" }),

  restorePage: (id: string) => json<{ page: PageMeta }>(`/api/pages/${id}/restore`, { method: "POST" }),

  saveBlocks: async (id: string, blocks: Block[], rev?: number): Promise<SaveResult> => {
    const response = await fetch(`/api/pages/${id}/blocks`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blocks, rev }),
    });
    if (response.status === 409) {
      const data = (await response.json()) as { page: PageMeta; blocks: Block[] };
      return { conflict: true, page: data.page, blocks: data.blocks };
    }
    if (response.status === 401) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new Error("Session expirée");
    }
    if (!response.ok) throw new Error(`PUT blocks -> ${response.status}`);
    const data = (await response.json()) as { rev: number };
    return { conflict: false, rev: data.rev };
  },

  listRows: (dbId: string) =>
    json<{ database: PageMeta; rows: PageMeta[] }>(`/api/databases/${dbId}/rows`).then((r) => r.rows),

  createRow: (dbId: string, input: { title?: string; props?: Record<string, PropertyValue> }) =>
    json<{ row: PageMeta }>(`/api/databases/${dbId}/rows`, { method: "POST", body: JSON.stringify(input) }).then(
      (r) => r.row,
    ),

  listTrash: () => json<{ pages: PageMeta[] }>("/api/trash").then((r) => r.pages),

  emptyTrash: () => json<{ ok: true }>("/api/trash", { method: "DELETE" }),

  search: (q: string) => json<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.hits),
};

/** Sauvegarde de dernière chance quand l'onglet se ferme. */
export function saveBlocksBeacon(id: string, blocks: Block[]): void {
  try {
    fetch(`/api/pages/${id}/blocks`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blocks }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* rien de plus à tenter */
  }
}

export type TreeNode = { page: PageMeta; children: TreeNode[] };

export function buildTree(pages: PageMeta[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  // Les lignes de base de données ne remontent pas dans l'arbre de la barre latérale.
  for (const page of pages.filter((candidate) => !candidate.dbId)) {
    nodes.set(page.id, { page, children: [] });
  }

  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.page.parentId ? nodes.get(node.page.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (list: TreeNode[]) => {
    list.sort((a, b) => a.page.position - b.page.position || a.page.createdAt.localeCompare(b.page.createdAt));
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}
