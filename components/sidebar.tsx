"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type TreeNode } from "@/lib/client";
import { useStoredValue, writeStore } from "@/lib/local-store";
import { applyThemeInBrowser, type Theme } from "@/lib/theme";
import { signOutEverywhere } from "@/lib/firebase-client";
import { UNTITLED, type PageMeta } from "@/lib/types";
import { useWorkspace } from "./workspace-context";

const STORAGE_KEY = "terrier:expanded";

type Props = {
  currentId: string | null;
  theme: Theme;
  viewer: string;
  onOpenSearch: () => void;
  onOpenTrash: () => void;
  onCollapse: () => void;
};

export default function Sidebar({ currentId, theme, viewer, onOpenSearch, onOpenTrash, onCollapse }: Props) {
  const { pages, tree, createPage, trashPage, toggleFavorite, refresh } = useWorkspace();
  const router = useRouter();
  const [menuFor, setMenuFor] = useState<{ page: PageMeta; top: number; left: number } | null>(null);

  const rawExpanded = useStoredValue(STORAGE_KEY);
  const [themeChoice, setThemeChoice] = useState<Theme>(theme);

  const expanded = useMemo(() => {
    try {
      return new Set<string>(rawExpanded ? (JSON.parse(rawExpanded) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  }, [rawExpanded]);

  const persist = (next: Set<string>) => writeStore(STORAGE_KEY, JSON.stringify([...next]));

  // Deplie automatiquement les parents de la page ouverte.
  useEffect(() => {
    if (!currentId) return;
    const byId = new Map(pages.map((p) => [p.id, p]));
    const ancestors: string[] = [];
    let cursor = byId.get(currentId)?.parentId ?? null;
    let guard = 0;
    while (cursor && guard < 20) {
      ancestors.push(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
      guard += 1;
    }
    if (!ancestors.length || ancestors.every((id) => expanded.has(id))) return;
    persist(new Set([...expanded, ...ancestors]));
  }, [currentId, pages, expanded]);

  const toggleExpanded = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persist(next);
  };

  const applyTheme = (value: Theme) => {
    setThemeChoice(value);
    applyThemeInBrowser(value);
  };

  const favorites = useMemo(() => pages.filter((page) => page.isFavorite), [pages]);

  const newPage = async (parentId: string | null) => {
    const page = await createPage(parentId);
    if (parentId) persist(new Set([...expanded, parentId]));
    router.push(`/p/${page.id}`);
  };

  const duplicate = async (page: PageMeta) => {
    const { blocks } = await api.getPage(page.id);
    const copy = await api.createPage({
      parentId: page.parentId,
      title: page.title ? `${page.title} (copie)` : "",
      icon: page.icon,
    });
    await api.saveBlocks(copy.id, blocks);
    await refresh();
    router.push(`/p/${copy.id}`);
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const { page, children } = node;
    const isOpen = expanded.has(page.id);
    const isCurrent = page.id === currentId;

    return (
      <div key={page.id}>
        <div
          className={`group flex items-center gap-0.5 rounded-md pr-1 ${isCurrent ? "bg-active" : "hover:bg-hover"}`}
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          <button
            type="button"
            onClick={() => toggleExpanded(page.id)}
            className={`grid size-5 shrink-0 place-items-center rounded text-muted hover:bg-active ${
              children.length ? "" : "invisible"
            }`}
            aria-label={isOpen ? "Replier" : "Déplier"}
            aria-expanded={isOpen}
          >
            <svg viewBox="0 0 12 12" className={`size-2.5 fill-current transition-transform ${isOpen ? "rotate-90" : ""}`}>
              <path d="M3 1.5 L9 6 L3 10.5 Z" />
            </svg>
          </button>

          <Link
            href={`/p/${page.id}`}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-sm text-ink-soft"
            title={page.title || UNTITLED}
          >
            <span className="w-4 shrink-0 text-center text-[13px]">{page.icon || "\u{1F4C4}"}</span>
            <span className={`truncate ${isCurrent ? "font-medium text-ink" : ""}`}>{page.title || UNTITLED}</span>
          </Link>

          <button
            type="button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setMenuFor({ page, top: rect.bottom + 4, left: rect.left - 140 });
            }}
            className="grid size-5 shrink-0 place-items-center rounded text-muted opacity-0 hover:bg-active group-hover:opacity-100"
            aria-label="Options de la page"
          >
            <svg viewBox="0 0 16 4" className="size-3.5 fill-current">
              <circle cx="2" cy="2" r="1.4" />
              <circle cx="8" cy="2" r="1.4" />
              <circle cx="14" cy="2" r="1.4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => void newPage(page.id)}
            className="grid size-5 shrink-0 place-items-center rounded text-muted opacity-0 hover:bg-active group-hover:opacity-100"
            aria-label="Nouvelle sous-page"
            title="Nouvelle sous-page"
          >
            <svg viewBox="0 0 16 16" className="size-3.5 fill-current">
              <path d="M7.25 3h1.5v4.25H13v1.5H8.75V13h-1.5V8.75H3v-1.5h4.25V3Z" />
            </svg>
          </button>
        </div>

        {isOpen && children.length > 0 && <div>{children.map((child) => renderNode(child, depth + 1))}</div>}
        {isOpen && children.length === 0 && (
          <p className="py-1 text-xs text-muted" style={{ paddingLeft: 30 + depth * 12 }}>
            Aucune page à l&apos;intérieur
          </p>
        )}
      </div>
    );
  };

  const sectionTitle = "px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted";
  const railButton = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-hover";

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex items-center gap-1 px-2 pt-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1">
          <span className="grid size-6 shrink-0 place-items-center rounded bg-hover text-sm">{"\u{1F430}"}</span>
          <span className="truncate text-sm font-medium text-ink">Terrier</span>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="grid size-7 shrink-0 place-items-center rounded text-muted hover:bg-hover"
          aria-label="Replier la barre latérale"
          title="Replier la barre latérale"
        >
          <svg viewBox="0 0 16 16" className="size-4 fill-current">
            <path d="M2 3h12v1.5H2V3Zm0 4.25h7v1.5H2v-1.5ZM2 11.5h12V13H2v-1.5Z" />
          </svg>
        </button>
      </div>

      <div className="px-2 pt-2">
        <button type="button" onClick={onOpenSearch} className={railButton}>
          <svg viewBox="0 0 16 16" className="size-4 fill-current text-muted">
            <path d="M10.5 6.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-.82 4.24a5.5 5.5 0 1 1 1.06-1.06l3.29 3.29-1.06 1.06-3.29-3.29Z" />
          </svg>
          Rechercher
          <span className="ml-auto text-[11px] text-muted">Ctrl K</span>
        </button>
        <button type="button" onClick={() => void newPage(null)} className={railButton}>
          <svg viewBox="0 0 16 16" className="size-4 fill-current text-muted">
            <path d="M7.25 3h1.5v4.25H13v1.5H8.75V13h-1.5V8.75H3v-1.5h4.25V3Z" />
          </svg>
          Nouvelle page
        </button>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto px-2 pb-4">
        {favorites.length > 0 && (
          <>
            <p className={sectionTitle}>Favoris</p>
            {favorites.map((page) => (
              <Link
                key={page.id}
                href={`/p/${page.id}`}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm ${
                  page.id === currentId ? "bg-active font-medium text-ink" : "text-ink-soft hover:bg-hover"
                }`}
              >
                <span className="w-4 shrink-0 text-center text-[13px]">{page.icon || "\u{1F4C4}"}</span>
                <span className="truncate">{page.title || UNTITLED}</span>
              </Link>
            ))}
          </>
        )}

        <p className={sectionTitle}>Pages privées</p>
        {tree.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted">Aucune page pour le moment.</p>
        ) : (
          tree.map((node) => renderNode(node, 0))
        )}
      </div>

      <div className="border-t border-line px-2 py-2">
        <button type="button" onClick={onOpenTrash} className={railButton}>
          <svg viewBox="0 0 16 16" className="size-4 fill-current text-muted">
            <path d="M6.5 1.5h3l.5 1H13V4H3V2.5h3l.5-1ZM4 5h8l-.6 8.1a1.5 1.5 0 0 1-1.5 1.4H6.1a1.5 1.5 0 0 1-1.5-1.4L4 5Z" />
          </svg>
          Corbeille
        </button>
        <div className="mt-1 flex items-center gap-1 rounded-md px-2 py-1">
          <span className="min-w-0 flex-1 truncate text-xs text-muted" title={viewer}>
            {viewer}
          </span>
          <button
            type="button"
            onClick={async () => {
              await signOutEverywhere();
              // Rechargement complet volontaire : on ne veut garder aucun état
              // de la personne précédente en mémoire.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/login";
            }}
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-hover"
          >
            Se déconnecter
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-md px-2 py-1">
          <span className="flex-1 text-xs text-muted">Thème</span>
          {(["light", "dark", "system"] satisfies Theme[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => applyTheme(value)}
              className={`rounded px-1.5 py-0.5 text-[11px] ${
                themeChoice === value ? "bg-active text-ink" : "text-muted hover:bg-hover"
              }`}
              title={value === "light" ? "Clair" : value === "dark" ? "Sombre" : "Système"}
            >
              {value === "light" ? "Clair" : value === "dark" ? "Sombre" : "Auto"}
            </button>
          ))}
        </div>
      </div>

      {menuFor && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setMenuFor(null)} />
          <div className="pop pop-in fixed z-50 w-48 p-1.5" style={{ top: menuFor.top, left: Math.max(8, menuFor.left) }}>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-hover"
              onClick={() => {
                void toggleFavorite(menuFor.page.id);
                setMenuFor(null);
              }}
            >
              {menuFor.page.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            </button>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-hover"
              onClick={() => {
                void duplicate(menuFor.page);
                setMenuFor(null);
              }}
            >
              Dupliquer
            </button>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-hover"
              onClick={() => {
                void newPage(menuFor.page.id);
                setMenuFor(null);
              }}
            >
              Nouvelle sous-page
            </button>
            <div className="my-1 h-px bg-line" />
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-red-500 hover:bg-hover"
              onClick={() => {
                void trashPage(menuFor.page.id);
                setMenuFor(null);
              }}
            >
              Mettre à la corbeille
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
