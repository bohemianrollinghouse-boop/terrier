"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { UNTITLED, type SearchHit } from "@/lib/types";
import { useWorkspace } from "./workspace-context";

export default function QuickFind({ onClose }: { onClose: () => void }) {
  const { pages } = useWorkspace();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  /** Résultats étiquetés par requête : on n'affiche jamais ceux d'une frappe précédente. */
  const [found, setFound] = useState<{ query: string; hits: SearchHit[] }>({ query: "", hits: [] });
  const [active, setActive] = useState(0);

  const trimmed = query.trim();

  const recents: SearchHit[] = [...pages]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8)
    .map((page) => ({ id: page.id, title: page.title, icon: page.icon, snippet: "" }));

  const results = trimmed ? (found.query === trimmed ? found.hits : []) : recents;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!trimmed) return;
    const timer = window.setTimeout(() => {
      api
        .search(trimmed)
        .then((hits) => {
          setFound({ query: trimmed, hits });
          setActive(0);
        })
        .catch(() => setFound({ query: trimmed, hits: [] }));
    }, 140);
    return () => window.clearTimeout(timer);
  }, [trimmed]);

  const open = (id: string) => {
    router.push(`/p/${id}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/30" onMouseDown={onClose} />
      <div
        className="pop pop-in relative w-full max-w-xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Recherche rapide"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => (results.length ? (index + 1) % results.length : 0));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
          }
          if (event.key === "Enter" && results[active]) {
            event.preventDefault();
            open(results[active].id);
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <svg viewBox="0 0 16 16" className="size-4 shrink-0 fill-current text-muted">
            <path d="M10.5 6.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-.82 4.24a5.5 5.5 0 1 1 1.06-1.06l3.29 3.29-1.06 1.06-3.29-3.29Z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une page ou un mot…"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
          />
          <kbd className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">Échap</kbd>
        </div>

        <div className="thin-scroll max-h-[50vh] overflow-y-auto p-1.5">
          <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {trimmed ? "Résultats" : "Pages récentes"}
          </p>
          {results.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted">Aucun résultat pour « {query} »</p>
          ) : (
            results.map((hit, index) => (
              <button
                key={hit.id}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => open(hit.id)}
                className={`flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left ${
                  index === active ? "bg-active" : ""
                }`}
              >
                <span className="w-5 shrink-0 pt-0.5 text-center">{hit.icon || "\u{1F4C4}"}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{hit.title || UNTITLED}</span>
                  {hit.snippet && <span className="block truncate text-xs text-muted">{hit.snippet}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
