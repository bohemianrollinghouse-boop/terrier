"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { UNTITLED, type PageMeta } from "@/lib/types";
import { useWorkspace } from "./workspace-context";

export default function TrashDialog({ onClose }: { onClose: () => void }) {
  const { refresh } = useWorkspace();
  const router = useRouter();
  const [items, setItems] = useState<PageMeta[] | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const load = () => {
    api
      .listTrash()
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(load, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const restore = async (id: string) => {
    await api.restorePage(id);
    await refresh();
    load();
    router.push(`/p/${id}`);
    onClose();
  };

  const destroy = async (id: string) => {
    await api.deletePageForever(id);
    load();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/30" onMouseDown={onClose} />
      <div className="pop pop-in relative w-full max-w-xl overflow-hidden" role="dialog" aria-modal="true" aria-label="Corbeille">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-medium text-ink">Corbeille</h2>
          {items && items.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (!confirmEmpty) {
                  setConfirmEmpty(true);
                  return;
                }
                await api.emptyTrash();
                setConfirmEmpty(false);
                load();
              }}
              className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-hover"
            >
              {confirmEmpty ? "Confirmer la suppression définitive" : "Vider la corbeille"}
            </button>
          )}
        </div>

        <div className="thin-scroll max-h-[50vh] overflow-y-auto p-1.5">
          {items === null ? (
            <p className="px-2 py-4 text-sm text-muted">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted">La corbeille est vide.</p>
          ) : (
            items.map((page) => (
              <div key={page.id} className="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-hover">
                <span className="w-5 shrink-0 text-center">{page.icon || "\u{1F4C4}"}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{page.title || UNTITLED}</span>
                <button
                  type="button"
                  onClick={() => void restore(page.id)}
                  className="shrink-0 rounded px-2 py-1 text-xs text-ink-soft hover:bg-active"
                >
                  Restaurer
                </button>
                <button
                  type="button"
                  onClick={() => void destroy(page.id)}
                  className="shrink-0 rounded px-2 py-1 text-xs text-red-500 hover:bg-active"
                >
                  Supprimer
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
