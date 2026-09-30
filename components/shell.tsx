"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { PageMeta } from "@/lib/types";
import type { Theme } from "@/lib/theme";
import { WorkspaceProvider } from "./workspace-context";
import Sidebar from "./sidebar";
import QuickFind from "./quick-find";
import TrashDialog from "./trash-dialog";

export default function Shell({
  initialPages,
  theme,
  viewer,
  children,
}: {
  initialPages: PageMeta[];
  theme: Theme;
  viewer: string;
  children: ReactNode;
}) {
  return (
    <WorkspaceProvider initialPages={initialPages}>
      <ShellFrame theme={theme} viewer={viewer}>
        {children}
      </ShellFrame>
    </WorkspaceProvider>
  );
}

function ShellFrame({ theme, viewer, children }: { theme: Theme; viewer: string; children: ReactNode }) {
  const pathname = usePathname();
  const currentId = pathname?.startsWith("/p/") ? pathname.slice(3).split("/")[0] : null;

  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState(false);
  const [trash, setTrash] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch((open) => !open);
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "\\") {
        event.preventDefault();
        setCollapsed((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden">
      {!collapsed && (
        <Sidebar
          currentId={currentId}
          theme={theme}
          viewer={viewer}
          onOpenSearch={() => setSearch(true)}
          onOpenTrash={() => setTrash(true)}
          onCollapse={() => setCollapsed(true)}
        />
      )}

      <main className="thin-scroll relative flex-1 overflow-y-auto">
        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="fixed left-3 top-2.5 z-40 grid size-7 place-items-center rounded text-muted hover:bg-hover"
            aria-label="Afficher la barre latérale"
            title="Afficher la barre latérale (Ctrl+\)"
          >
            <svg viewBox="0 0 16 16" className="size-4 fill-current">
              <path d="M2 3h12v1.5H2V3Zm0 4.25h7v1.5H2v-1.5ZM2 11.5h12V13H2v-1.5Z" />
            </svg>
          </button>
        )}
        {children}
      </main>

      {search && <QuickFind onClose={() => setSearch(false)} />}
      {trash && <TrashDialog onClose={() => setTrash(false)} />}
    </div>
  );
}
