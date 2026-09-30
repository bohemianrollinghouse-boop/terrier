"use client";

import { useEffect, useRef } from "react";
import type { BlockDef } from "./block-defs";

type Props = {
  items: BlockDef[];
  activeIndex: number;
  position: { top: number; left: number };
  onPick: (def: BlockDef) => void;
  onHover: (index: number) => void;
};

export default function SlashMenu({ items, activeIndex, position, onPick, onHover }: Props) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div
      className="pop pop-in thin-scroll fixed z-50 max-h-80 w-80 overflow-y-auto p-1.5"
      style={{ top: position.top, left: position.left }}
      role="listbox"
      aria-label="Blocs"
    >
      <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Blocs de base</p>
      {items.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted">Aucun résultat</p>
      ) : (
        items.map((def, index) => (
          <button
            key={def.type}
            ref={index === activeIndex ? activeRef : undefined}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(def);
            }}
            className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left ${
              index === activeIndex ? "bg-active" : ""
            }`}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-md border border-line bg-app text-[15px] text-ink-soft">
              {def.glyph}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm text-ink">{def.label}</span>
              <span className="block truncate text-xs text-muted">{def.hint}</span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}
