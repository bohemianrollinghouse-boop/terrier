"use client";

import { useState, type ClipboardEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { Block } from "@/lib/types";
import Editable from "./editable";
import EmojiPicker from "../emoji-picker";
import { CODE_LANGS } from "./block-defs";

export type DropHint = "before" | "after" | null;

type Props = {
  block: Block;
  index: number;
  listNumber: number;
  hasChildren: boolean;
  isFocused: boolean;
  isDragging: boolean;
  dropHint: DropHint;
  register: (el: HTMLElement | null) => void;
  onChange: (html: string) => void;
  onPatch: (patch: Partial<Block>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLElement>) => void;
  onFocus: () => void;
  onAddBelow: () => void;
  onOpenMenu: (anchor: HTMLElement) => void;
  onDragHandleDown: (event: ReactPointerEvent) => void;
};

const TEXT_CLASS: Record<string, string> = {
  paragraph: "py-[3px] text-[16px] leading-[1.65]",
  h1: "pt-7 pb-1 text-[30px] font-bold leading-[1.25] tracking-[-0.01em]",
  h2: "pt-5 pb-0.5 text-[24px] font-semibold leading-[1.3]",
  h3: "pt-4 pb-0.5 text-[19px] font-semibold leading-[1.35]",
};

const PLACEHOLDERS: Record<string, string> = {
  h1: "Titre 1",
  h2: "Titre 2",
  h3: "Titre 3",
  bulleted: "Élément de liste",
  numbered: "Élément de liste",
  todo: "À faire",
  toggle: "Liste à basculer",
  quote: "Citation",
  callout: "Écrivez quelque chose d'important",
  code: "Votre code ici",
};

export default function BlockRow({
  block,
  listNumber,
  hasChildren,
  isFocused,
  isDragging,
  dropHint,
  register,
  onChange,
  onPatch,
  onKeyDown,
  onPaste,
  onFocus,
  onAddBelow,
  onOpenMenu,
  onDragHandleDown,
}: Props) {
  const [emojiAt, setEmojiAt] = useState<{ top: number; left: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const placeholder =
    PLACEHOLDERS[block.type] ?? (isFocused ? "Tapez / pour ajouter un bloc, ou écrivez" : undefined);

  const editable = (extraClass = "", plainText = false) => (
    <Editable
      html={block.content}
      plainText={plainText}
      register={register}
      placeholder={placeholder}
      className={`rich ${extraClass}`}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={onFocus}
    />
  );

  const marker = (node: React.ReactNode, className = "") => (
    <span
      contentEditable={false}
      className={`shrink-0 select-none pt-[3px] text-[16px] leading-[1.65] text-ink ${className}`}
    >
      {node}
    </span>
  );

  let body: React.ReactNode;

  switch (block.type) {
    case "h1":
    case "h2":
    case "h3":
    case "paragraph":
      body = editable(TEXT_CLASS[block.type]);
      break;

    case "bulleted":
      body = (
        <div className="flex gap-2">
          {marker("•", "w-5 text-center text-[20px] leading-[1.35]")}
          <div className="min-w-0 flex-1">{editable(TEXT_CLASS.paragraph)}</div>
        </div>
      );
      break;

    case "numbered":
      body = (
        <div className="flex gap-2">
          {marker(`${listNumber}.`, "w-5 text-right tabular-nums")}
          <div className="min-w-0 flex-1">{editable(TEXT_CLASS.paragraph)}</div>
        </div>
      );
      break;

    case "todo":
      body = (
        <div className="flex gap-2">
          <span contentEditable={false} className="flex w-5 shrink-0 justify-center pt-[6px]">
            <input
              type="checkbox"
              checked={block.checked}
              onChange={(event) => onPatch({ checked: event.target.checked })}
              className="size-[15px] cursor-pointer accent-accent"
              aria-label="Tâche terminée"
            />
          </span>
          <div className="min-w-0 flex-1">
            {editable(`${TEXT_CLASS.paragraph} ${block.checked ? "todo-done" : ""}`)}
          </div>
        </div>
      );
      break;

    case "toggle":
      body = (
        <div className="flex gap-1">
          <span contentEditable={false} className="flex w-5 shrink-0 justify-center pt-[5px]">
            <button
              type="button"
              onClick={() => onPatch({ collapsed: !block.collapsed })}
              className="grid size-5 place-items-center rounded hover:bg-hover"
              aria-label={block.collapsed ? "Déplier" : "Replier"}
              aria-expanded={!block.collapsed}
            >
              <svg
                viewBox="0 0 12 12"
                className={`size-3 fill-current transition-transform ${block.collapsed ? "" : "rotate-90"} ${
                  hasChildren ? "text-ink" : "text-muted"
                }`}
              >
                <path d="M3 1.5 L9 6 L3 10.5 Z" />
              </svg>
            </button>
          </span>
          <div className="min-w-0 flex-1">{editable(TEXT_CLASS.paragraph)}</div>
        </div>
      );
      break;

    case "quote":
      body = (
        <div className="my-1 border-l-[3px] border-ink pl-3.5">
          {editable("py-[3px] text-[16px] leading-[1.6]")}
        </div>
      );
      break;

    case "callout":
      body = (
        <div className="my-1 flex gap-3 rounded-md bg-callout px-4 py-3">
          <button
            type="button"
            contentEditable={false}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setEmojiAt({ top: rect.bottom + 6, left: rect.left });
            }}
            className="h-6 shrink-0 select-none rounded px-0.5 text-[18px] leading-6 hover:bg-hover"
            aria-label="Changer l'icône de l'encadré"
          >
            {block.meta.emoji || "\u{1F4A1}"}
          </button>
          <div className="min-w-0 flex-1">{editable("text-[16px] leading-[1.6]")}</div>
          {emojiAt && (
            <EmojiPicker
              position={emojiAt}
              onPick={(emoji) => {
                onPatch({ meta: { ...block.meta, emoji } });
                setEmojiAt(null);
              }}
              onClose={() => setEmojiAt(null)}
            />
          )}
        </div>
      );
      break;

    case "code":
      body = (
        <div className="my-1.5 overflow-hidden rounded-md border border-line bg-code">
          <div contentEditable={false} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
            <select
              value={block.meta.lang || "texte"}
              onChange={(event) => onPatch({ meta: { ...block.meta, lang: event.target.value } })}
              className="cursor-pointer rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted outline-none hover:border-line"
              aria-label="Langage"
            >
              {CODE_LANGS.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                const text = new DOMParser().parseFromString(block.content, "text/html").documentElement.textContent;
                await navigator.clipboard.writeText(text ?? "");
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }}
              className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-hover"
            >
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <pre className="thin-scroll overflow-x-auto px-3.5 pb-3 pt-0.5">
            {editable("font-mono text-[13.5px] leading-[1.6] whitespace-pre-wrap", true)}
          </pre>
        </div>
      );
      break;

    case "divider":
      body = (
        <div contentEditable={false} className="py-3">
          <hr className="border-0 border-t border-line-strong" />
        </div>
      );
      break;

    case "image":
      body = block.meta.url ? (
        <figure className="my-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.meta.url}
            alt={block.meta.caption || ""}
            className="max-h-[70vh] max-w-full rounded-md border border-line object-contain"
          />
          <figcaption className="pt-1.5 text-[13px] text-muted">
            {editable("min-h-5")}
          </figcaption>
        </figure>
      ) : (
        <div contentEditable={false} className="my-1.5">
          <form
            className="flex items-center gap-2 rounded-md bg-code px-3 py-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("url") as HTMLInputElement | null;
              const url = input?.value.trim();
              if (url) onPatch({ meta: { ...block.meta, url } });
            }}
          >
            <span className="text-[15px]">{"\u{1F5BC}"}</span>
            <input
              name="url"
              type="url"
              placeholder="Collez un lien d'image (https://...)"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
            <button type="submit" className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white">
              Inserer
            </button>
          </form>
        </div>
      );
      break;

    default:
      body = editable(TEXT_CLASS.paragraph);
  }

  return (
    <div
      className={`block-row group ${dropHint ? `drop-${dropHint}` : ""} ${isDragging ? "is-dragging" : ""}`}
      style={{ marginLeft: block.indent * 24 }}
      data-block-id={block.id}
    >
      <div className="block-gutter w-11 justify-end pr-1 pt-[3px]" contentEditable={false}>
        <button
          type="button"
          onClick={onAddBelow}
          className="grid size-6 place-items-center rounded text-muted hover:bg-hover"
          aria-label="Insérer un bloc en dessous"
          title="Insérer un bloc en dessous"
        >
          <svg viewBox="0 0 16 16" className="size-4 fill-current">
            <path d="M7.25 3h1.5v4.25H13v1.5H8.75V13h-1.5V8.75H3v-1.5h4.25V3Z" />
          </svg>
        </button>
        <button
          type="button"
          onPointerDown={onDragHandleDown}
          onClick={(event) => onOpenMenu(event.currentTarget)}
          className="grid size-6 cursor-grab place-items-center rounded text-muted hover:bg-hover active:cursor-grabbing"
          aria-label="Options du bloc"
          title="Glisser pour déplacer, cliquer pour les options"
        >
          <svg viewBox="0 0 10 16" className="size-4 fill-current">
            <circle cx="3" cy="4" r="1.1" />
            <circle cx="7" cy="4" r="1.1" />
            <circle cx="3" cy="8" r="1.1" />
            <circle cx="7" cy="8" r="1.1" />
            <circle cx="3" cy="12" r="1.1" />
            <circle cx="7" cy="12" r="1.1" />
          </svg>
        </button>
      </div>
      <div className="min-w-0 flex-1">{body}</div>
    </div>
  );
}
