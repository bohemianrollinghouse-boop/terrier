"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, buildTree, type TreeNode } from "@/lib/client";
import type { PageMeta } from "@/lib/types";

type WorkspaceValue = {
  pages: PageMeta[];
  tree: TreeNode[];
  refresh: () => Promise<void>;
  /** Mise a jour optimiste (titre / icone tapes dans l'editeur). */
  patchLocal: (id: string, patch: Partial<PageMeta>) => void;
  createPage: (parentId?: string | null) => Promise<PageMeta>;
  renamePage: (id: string, title: string) => Promise<void>;
  setIcon: (id: string, icon: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  movePage: (id: string, parentId: string | null) => Promise<void>;
  trashPage: (id: string) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ initialPages, children }: { initialPages: PageMeta[]; children: ReactNode }) {
  const [pages, setPages] = useState<PageMeta[]>(initialPages);
  const router = useRouter();

  const refresh = useCallback(async () => {
    setPages(await api.listPages());
  }, []);

  const patchLocal = useCallback((id: string, patch: Partial<PageMeta>) => {
    setPages((current) => current.map((page) => (page.id === id ? { ...page, ...patch } : page)));
  }, []);

  const createPage = useCallback(
    async (parentId: string | null = null) => {
      const page = await api.createPage({ parentId });
      setPages((current) => [...current, page]);
      return page;
    },
    [],
  );

  const renamePage = useCallback(
    async (id: string, title: string) => {
      patchLocal(id, { title });
      await api.updatePage(id, { title });
    },
    [patchLocal],
  );

  const setIcon = useCallback(
    async (id: string, icon: string) => {
      patchLocal(id, { icon });
      await api.updatePage(id, { icon });
    },
    [patchLocal],
  );

  const toggleFavorite = useCallback(
    async (id: string) => {
      const page = pages.find((p) => p.id === id);
      if (!page) return;
      patchLocal(id, { isFavorite: !page.isFavorite });
      await api.updatePage(id, { isFavorite: !page.isFavorite });
    },
    [pages, patchLocal],
  );

  const movePage = useCallback(
    async (id: string, parentId: string | null) => {
      await api.updatePage(id, { parentId });
      await refresh();
    },
    [refresh],
  );

  const trashPage = useCallback(
    async (id: string) => {
      await api.trashPage(id);
      const remaining = await api.listPages();
      setPages(remaining);
      router.push(remaining.length ? `/p/${remaining[0].id}` : "/");
    },
    [router],
  );

  const value = useMemo<WorkspaceValue>(
    () => ({
      pages,
      tree: buildTree(pages),
      refresh,
      patchLocal,
      createPage,
      renamePage,
      setIcon,
      toggleFavorite,
      movePage,
      trashPage,
    }),
    [pages, refresh, patchLocal, createPage, renamePage, setIcon, toggleFavorite, movePage, trashPage],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace doit être utilisé dans un WorkspaceProvider");
  return value;
}
