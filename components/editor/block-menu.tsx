"use client";

import { useEffect } from "react";
import type { Block, BlockType } from "@/lib/types";
import { BLOCK_DEFS } from "./block-defs";

type Props = {
  block: Block;
  position: { top: number; left: number };
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTurnInto: (type: BlockType) => void;
  onMove: (direction: -1 | 1) => void;
  onIndent: (direction: -1 | 1) => void;
};

export default function BlockMenu({
  block,
  position,
  onClose,
  onDelete,
  onDuplicate,
  onTurnInto,
  onMove,
  onIndent,
}: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const item =
    "flex w-full items-center justify-between gap-6 rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-hover";
  const shortcut = "text-xs text-muted";

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div
        className="pop pop-in thin-scroll fixed z-50 max-h-[420px] w-64 overflow-y-auto p-1.5"
        style={{ top: position.top, left: position.left }}
      >
        <button type="button" className={item} onClick={onDelete}>
          <span>Supprimer</span>
          <span className={shortcut}>Suppr</span>
        </button>
        <button type="button" className={item} onClick={onDuplicate}>
          <span>Dupliquer</span>
          <span className={shortcut}>Ctrl+D</span>
        </button>
        <div className="my-1 h-px bg-line" />
        <button type="button" className={item} onClick={() => onMove(-1)}>
          <span>Monter</span>
          <span className={shortcut}>Ctrl+Maj+↑</span>
        </button>
        <button type="button" className={item} onClick={() => onMove(1)}>
          <span>Descendre</span>
          <span className={shortcut}>Ctrl+Maj+↓</span>
        </button>
        <button type="button" className={item} onClick={() => onIndent(1)}>
          <span>Indenter</span>
          <span className={shortcut}>Tab</span>
        </button>
        <button type="button" className={item} onClick={() => onIndent(-1)} disabled={block.indent === 0}>
          <span className={block.indent === 0 ? "text-muted" : undefined}>Désindenter</span>
          <span className={shortcut}>Maj+Tab</span>
        </button>
        <div className="my-1 h-px bg-line" />
        <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted">Transformer en</p>
        {BLOCK_DEFS.map((def) => (
          <button
            key={def.type}
            type="button"
            className={`${item} ${def.type === block.type ? "bg-active" : ""}`}
            onClick={() => onTurnInto(def.type)}
          >
            <span className="flex items-center gap-2.5">
              <span className="grid size-5 place-items-center text-[13px] text-muted">{def.glyph}</span>
              {def.label}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
