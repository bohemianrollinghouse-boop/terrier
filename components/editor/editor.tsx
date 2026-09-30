"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { api, saveBlocksBeacon } from "@/lib/client";
import { emptyBlock, newId, UNTITLED, type Block, type BlockType, type PageMeta, type PropertyValue } from "@/lib/types";
import { PropertyCell } from "../database/property-cell";
import { useWorkspace } from "../workspace-context";
import EmojiPicker from "../emoji-picker";
import Editable from "./editable";
import BlockRow, { type DropHint } from "./block-row";
import BlockMenu from "./block-menu";
import SlashMenu from "./slash-menu";
import { filterDefs, type BlockDef } from "./block-defs";
import {
  caretOffset,
  deleteBeforeCaret,
  execFormat,
  insertText,
  isCaretAtEnd,
  isCaretAtStart,
  placeCaret,
  splitAtCaret,
  textBeforeCaret,
  toggleInlineCode,
  type CaretTarget,
} from "./caret";

const LIST_TYPES: BlockType[] = ["bulleted", "numbered", "todo"];
const RESET_ON_ENTER: BlockType[] = ["bulleted", "numbered", "todo", "quote", "toggle", "callout"];
const MENU_WIDTH = 320;
const MENU_HEIGHT = 330;

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const decodeHtml = (html: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.documentElement.textContent ?? "";
};

/** Longueur du texte visible, sans trim (pour positionner le caret). */
const plainLength = (html: string) => decodeHtml(html.replace(/<br\s*\/?>/gi, "\n")).length;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MARKDOWN: { pattern: RegExp; type: BlockType }[] = [
  { pattern: /^#$/, type: "h1" },
  { pattern: /^##$/, type: "h2" },
  { pattern: /^###$/, type: "h3" },
  { pattern: /^[-*+]$/, type: "bulleted" },
  { pattern: /^1\.$/, type: "numbered" },
  { pattern: /^\[ ?\]$/, type: "todo" },
  { pattern: /^>$/, type: "quote" },
  { pattern: /^>>$/, type: "toggle" },
  { pattern: /^```$/, type: "code" },
];

function markdownTypeFor(line: string): { type: BlockType; rest: string } | null {
  for (const { pattern, type } of MARKDOWN) {
    const match = /^(\S+)\s/.exec(`${line} `);
    if (match && pattern.test(match[1])) return { type, rest: line.slice(match[1].length).trimStart() };
  }
  return null;
}

type SlashState = { blockId: string; query: string; index: number; top: number; left: number };
type MenuState = { index: number; top: number; left: number };

export default function Editor({
  page,
  initialBlocks,
  database,
}: {
  page: PageMeta;
  initialBlocks: Block[];
  /** Renseignée quand la page est une ligne de base : donne le schéma à afficher. */
  database?: PageMeta;
}) {
  const { pages, patchLocal, toggleFavorite } = useWorkspace();
  const [props, setProps] = useState<Record<string, PropertyValue>>(page.props ?? {});

  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks.length ? initialBlocks : [emptyBlock()]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [iconPickerAt, setIconPickerAt] = useState<{ top: number; left: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; where: "before" | "after" } | null>(null);
  /** Non nul dès qu'une écriture a été refusée : quelqu'un d'autre a modifié la page. */
  const [conflictWith, setConflictWith] = useState<string | null>(null);
  /** Derniers blocs effectivement enregistrés, pour en déduire l'indicateur. */
  const [savedSnapshot, setSavedSnapshot] = useState<Block[]>(initialBlocks.length ? initialBlocks : []);
  const [savedOnce, setSavedOnce] = useState(false);
  const [failed, setFailed] = useState(false);

  const els = useRef(new Map<string, HTMLElement>());
  const titleEl = useRef<HTMLElement | null>(null);
  const focusReq = useRef<{ id: string; at: CaretTarget } | null>(null);
  const blocksRef = useRef(blocks);
  const dirty = useRef(false);
  const revRef = useRef(page.rev);
  const dragInfo = useRef<{ id: string; moved: boolean } | null>(null);
  const dropRef = useRef<{ id: string; where: "before" | "after" } | null>(null);
  const suppressClick = useRef(false);

  const updateDrop = (next: { id: string; where: "before" | "after" } | null) => {
    dropRef.current = next;
    setDrop(next);
  };

  // Miroir des blocs pour les sauvegardes differees et les gestionnaires d'evenements.
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const registerEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  }, []);

  const requestFocus = (id: string, at: CaretTarget = "end") => {
    focusReq.current = { id, at };
  };

  /* --------------------------------------------------------- sauvegarde */

  // L'indicateur se déduit de l'état plutôt que de s'écrire depuis l'effet :
  // « en cours » dès que les blocs s'écartent du dernier envoi réussi.
  const status: "idle" | "saving" | "saved" =
    conflictWith || failed ? "idle" : blocks !== savedSnapshot ? "saving" : savedOnce ? "saved" : "idle";

  // Rien n'est envoyé tant que les blocs n'ont pas réellement changé.
  useEffect(() => {
    if (blocks === savedSnapshot) return;
    if (conflictWith) return; // plus rien n'est envoyé tant que le conflit n'est pas tranché
    dirty.current = true;
    const timer = window.setTimeout(() => {
      api
        .saveBlocks(page.id, blocks, revRef.current)
        .then((result) => {
          if (result.conflict) {
            setConflictWith(result.page.updatedBy || "quelqu'un d'autre");
            return;
          }
          revRef.current = result.rev;
          dirty.current = false;
          setFailed(false);
          setSavedOnce(true);
          setSavedSnapshot(blocks);
        })
        .catch(() => setFailed(true));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [blocks, savedSnapshot, page.id, conflictWith]);

  useEffect(() => {
    const flush = () => {
      if (dirty.current) saveBlocksBeacon(page.id, blocksRef.current);
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [page.id]);

  useEffect(() => {
    if (title === page.title) return;
    const timer = window.setTimeout(() => {
      void api.updatePage(page.id, { title });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [title, page.id, page.title]);

  useEffect(() => {
    const request = focusReq.current;
    if (!request) return;
    focusReq.current = null;
    const el = els.current.get(request.id);
    if (el) placeCaret(el, request.at);
  });

  // Une page vierge (celle qu'on vient de creer) s'ouvre curseur dans le titre.
  useEffect(() => {
    const blank = !page.title && initialBlocks.length <= 1 && !initialBlocks[0]?.content;
    if (blank && titleEl.current) placeCaret(titleEl.current, "end");
  }, [page.id, page.title, initialBlocks]);

  /* ------------------------------------------------------- vue calculee */

  const numbers = useMemo(() => {
    const map = new Map<string, number>();
    const counters: number[] = [];
    for (const block of blocks) {
      if (block.type === "numbered") {
        counters.length = block.indent + 1;
        counters[block.indent] = (counters[block.indent] ?? 0) + 1;
        map.set(block.id, counters[block.indent]);
      } else if (block.type !== "paragraph" || block.content) {
        counters.length = block.indent;
      }
    }
    return map;
  }, [blocks]);

  const hidden = useMemo(() => {
    const set = new Set<string>();
    blocks.forEach((block, index) => {
      if (block.type !== "toggle" || !block.collapsed) return;
      for (let i = index + 1; i < blocks.length && blocks[i].indent > block.indent; i += 1) set.add(blocks[i].id);
    });
    return set;
  }, [blocks]);

  const hasChildren = useCallback(
    (index: number) => {
      const block = blocks[index];
      const next = blocks[index + 1];
      return !!next && next.indent > block.indent;
    },
    [blocks],
  );

  const breadcrumb = useMemo(() => {
    const byId = new Map(pages.map((p) => [p.id, p]));
    // Une ligne de base n'est pas dans l'arbre : on repart de sa base.
    if (database) return [...(byId.get(database.id) ? [byId.get(database.id)!] : [database]), page];

    const chain: PageMeta[] = [];
    let cursor: PageMeta | undefined = byId.get(page.id);
    let guard = 0;
    while (cursor && guard < 20) {
      chain.unshift(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      guard += 1;
    }
    return chain;
  }, [pages, page, database]);

  const current = pages.find((p) => p.id === page.id);

  /* ---------------------------------------------------------- mutations */

  const patchBlock = useCallback((id: string, patch: Partial<Block>) => {
    setBlocks((prev) => prev.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  }, []);

  const setIndent = useCallback((index: number, direction: -1 | 1) => {
    setBlocks((prev) => {
      const block = prev[index];
      if (!block) return prev;
      const ceiling = index === 0 ? 0 : prev[index - 1].indent + 1;
      const next = Math.max(0, Math.min(direction > 0 ? ceiling : block.indent - 1, block.indent + direction));
      if (next === block.indent) return prev;
      const copy = [...prev];
      copy[index] = { ...block, indent: next };
      return copy;
    });
  }, []);

  /** Nombre de blocs formant le sous-arbre a partir de index (bloc + descendants indentes). */
  const subtreeLength = (list: Block[], index: number) => {
    let count = 1;
    while (index + count < list.length && list[index + count].indent > list[index].indent) count += 1;
    return count;
  };

  const moveSubtree = useCallback((from: number, to: number) => {
    setBlocks((prev) => {
      if (from === to) return prev;
      const copy = [...prev];
      const count = subtreeLength(copy, from);
      if (to > from && to < from + count) return prev;
      const slice = copy.splice(from, count);
      const insertAt = to > from ? to - count : to;
      copy.splice(Math.max(0, Math.min(copy.length, insertAt)), 0, ...slice);
      return copy;
    });
  }, []);

  const moveByStep = useCallback((index: number, direction: -1 | 1) => {
    setBlocks((prev) => {
      const count = subtreeLength(prev, index);
      const target = direction < 0 ? index - 1 : index + count + 1;
      if (target < 0 || target > prev.length) return prev;
      const copy = [...prev];
      const slice = copy.splice(index, count);
      const insertAt = direction < 0 ? index - 1 : target - count;
      copy.splice(Math.max(0, Math.min(copy.length, insertAt)), 0, ...slice);
      return copy;
    });
  }, []);

  const insertBlockAt = useCallback((index: number, block: Block) => {
    setBlocks((prev) => {
      const copy = [...prev];
      copy.splice(index, 0, block);
      return copy;
    });
  }, []);

  const removeAt = useCallback((index: number) => {
    setBlocks((prev) => {
      if (prev.length === 1) return [emptyBlock()];
      const copy = [...prev];
      copy.splice(index, 1);
      return copy;
    });
  }, []);

  const turnInto = useCallback(
    (index: number, type: BlockType) => {
      setBlocks((prev) => {
        const block = prev[index];
        if (!block) return prev;
        const copy = [...prev];
        copy[index] = {
          ...block,
          type,
          checked: type === "todo" ? block.checked : false,
          collapsed: false,
          meta: type === "code" ? { lang: block.meta.lang ?? "texte" } : type === "callout" ? { emoji: block.meta.emoji ?? "\u{1F4A1}" } : {},
          content: type === "divider" || type === "image" ? "" : block.content,
        };
        return copy;
      });
      const block = blocksRef.current[index];
      if (block && type !== "divider" && type !== "image") requestFocus(block.id, "end");
    },
    [],
  );

  const addBelow = useCallback(
    (index: number) => {
      const block = blocksRef.current[index];
      const fresh = emptyBlock("paragraph", block?.indent ?? 0);
      insertBlockAt(index + 1, fresh);
      requestFocus(fresh.id, "start");
    },
    [insertBlockAt],
  );

  /* ------------------------------------------------------------- menu / */

  const menuPosition = (el: HTMLElement) => {
    const selection = window.getSelection();
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    const rect = range?.getClientRects()[0] ?? el.getBoundingClientRect();
    const top = rect.bottom + MENU_HEIGHT + 12 > window.innerHeight ? Math.max(8, rect.top - MENU_HEIGHT - 8) : rect.bottom + 6;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 12));
    return { top, left };
  };

  const applyDef = (def: BlockDef, block: Block, index: number) => {
    const needle = `/${slash?.query ?? ""}`;
    const el = els.current.get(block.id);
    const stripped = el
      ? deleteBeforeCaret(el, needle.length)
      : block.content.replace(new RegExp(`${escapeRegExp(needle)}(?=\\s*$)`), "");
    setSlash(null);
    setBlocks((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (!target) return prev;
      copy[index] = {
        ...target,
        content: def.type === "divider" || def.type === "image" ? "" : stripped,
        type: def.type,
        checked: false,
        collapsed: false,
        meta:
          def.type === "code"
            ? { lang: "texte" }
            : def.type === "callout"
              ? { emoji: "\u{1F4A1}" }
              : {},
      };
      if (def.type === "divider" || def.type === "image") {
        const fresh = emptyBlock("paragraph", target.indent);
        copy.splice(index + 1, 0, fresh);
        requestFocus(fresh.id, "start");
      } else {
        requestFocus(target.id, "end");
      }
      return copy;
    });
  };

  /** Releve le contenu reel du bloc apres une commande d'edition du navigateur. */
  const syncFromDom = (id: string) => {
    const el = els.current.get(id);
    if (!el) return;
    const isCode = blocksRef.current.find((b) => b.id === id)?.type === "code";
    patchBlock(id, { content: isCode ? escapeHtml((el.innerText ?? "").replace(/\n$/, "")) : el.innerHTML });
  };

  /* ------------------------------------------------------------ clavier */

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, block: Block, index: number) => {
    const el = event.currentTarget;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;

    if (slash && slash.blockId === block.id) {
      const items = filterDefs(slash.query);
      if (key === "ArrowDown" || (key === "Tab" && !event.shiftKey && items.length > 1)) {
        event.preventDefault();
        setSlash({ ...slash, index: items.length ? (slash.index + 1) % items.length : 0 });
        return;
      }
      if (key === "ArrowUp") {
        event.preventDefault();
        setSlash({ ...slash, index: items.length ? (slash.index - 1 + items.length) % items.length : 0 });
        return;
      }
      if (key === "Enter" && items.length) {
        event.preventDefault();
        applyDef(items[Math.min(slash.index, items.length - 1)], block, index);
        return;
      }
      if (key === "Escape") {
        event.preventDefault();
        setSlash(null);
        return;
      }
    }

    if (mod && !event.shiftKey && ["b", "i", "u"].includes(key.toLowerCase())) {
      event.preventDefault();
      execFormat(key.toLowerCase() === "b" ? "bold" : key.toLowerCase() === "i" ? "italic" : "underline");
      syncFromDom(block.id);
      return;
    }
    if (mod && event.shiftKey && key.toLowerCase() === "s") {
      event.preventDefault();
      execFormat("strikeThrough");
      syncFromDom(block.id);
      return;
    }
    if (mod && key.toLowerCase() === "e" && block.type !== "code") {
      event.preventDefault();
      const html = toggleInlineCode(el);
      if (html !== null) patchBlock(block.id, { content: html });
      return;
    }
    if (mod && key.toLowerCase() === "d") {
      event.preventDefault();
      const clone = { ...block, id: newId() };
      insertBlockAt(index + 1, clone);
      requestFocus(clone.id, "end");
      return;
    }
    if (mod && event.shiftKey && (key === "ArrowUp" || key === "ArrowDown")) {
      event.preventDefault();
      moveByStep(index, key === "ArrowUp" ? -1 : 1);
      requestFocus(block.id, caretOffset(el));
      return;
    }

    if (key === "Tab") {
      event.preventDefault();
      setIndent(index, event.shiftKey ? -1 : 1);
      requestFocus(block.id, caretOffset(el));
      return;
    }

    if (key === " " && block.type !== "code") {
      const before = textBeforeCaret(el);
      const match = MARKDOWN.find(({ pattern }) => pattern.test(before));
      if (match && caretOffset(el) === before.length) {
        event.preventDefault();
        const content = deleteBeforeCaret(el, before.length);
        setBlocks((prev) => {
          const copy = [...prev];
          copy[index] = {
            ...copy[index],
            type: match.type,
            content,
            meta: match.type === "code" ? { lang: "texte" } : match.type === "callout" ? { emoji: "\u{1F4A1}" } : copy[index].meta,
          };
          return copy;
        });
        requestFocus(block.id, "start");
        return;
      }
    }

    if (key === "Enter") {
      if (block.type === "code" && !mod) {
        event.preventDefault();
        insertText("\n");
        syncFromDom(block.id);
        return;
      }
      if (event.shiftKey) {
        event.preventDefault();
        document.execCommand("insertLineBreak");
        syncFromDom(block.id);
        return;
      }

      event.preventDefault();
      const text = decodeHtml(block.content).trim();

      if (text === "---") {
        setBlocks((prev) => {
          const copy = [...prev];
          copy[index] = { ...copy[index], type: "divider", content: "" };
          const fresh = emptyBlock("paragraph", copy[index].indent);
          copy.splice(index + 1, 0, fresh);
          requestFocus(fresh.id, "start");
          return copy;
        });
        return;
      }

      if (!text && RESET_ON_ENTER.includes(block.type)) {
        if (block.indent > 0) setIndent(index, -1);
        else patchBlock(block.id, { type: "paragraph", checked: false, meta: {} });
        requestFocus(block.id, "start");
        return;
      }

      const { before, after } = splitAtCaret(el);
      const nextType: BlockType = LIST_TYPES.includes(block.type) ? block.type : "paragraph";
      const fresh: Block = { ...emptyBlock(nextType, block.indent), content: after };
      setBlocks((prev) => {
        const copy = [...prev];
        copy[index] = { ...copy[index], content: before };
        copy.splice(index + 1, 0, fresh);
        return copy;
      });
      requestFocus(fresh.id, "start");
      return;
    }

    if (key === "Backspace") {
      if (!isCaretAtStart(el)) return;
      if (block.indent > 0) {
        event.preventDefault();
        setIndent(index, -1);
        requestFocus(block.id, "start");
        return;
      }
      if (block.type !== "paragraph") {
        event.preventDefault();
        patchBlock(block.id, { type: "paragraph", checked: false, collapsed: false, meta: {} });
        requestFocus(block.id, "start");
        return;
      }
      if (index === 0) return;

      event.preventDefault();
      const previous = blocks[index - 1];
      if (previous.type === "divider" || previous.type === "image") {
        removeAt(index - 1);
        requestFocus(block.id, "start");
        return;
      }
      const caretAt = plainLength(previous.content);
      setBlocks((prev) => {
        const copy = [...prev];
        copy[index - 1] = { ...previous, content: previous.content + block.content };
        copy.splice(index, 1);
        return copy;
      });
      requestFocus(previous.id, caretAt);
      return;
    }

    if (key === "Delete" && isCaretAtEnd(el)) {
      const next = blocks[index + 1];
      if (!next) return;
      event.preventDefault();
      if (next.type === "divider" || next.type === "image") {
        removeAt(index + 1);
        return;
      }
      const caretAt = plainLength(block.content);
      setBlocks((prev) => {
        const copy = [...prev];
        copy[index] = { ...block, content: block.content + next.content };
        copy.splice(index + 1, 1);
        return copy;
      });
      requestFocus(block.id, caretAt);
      return;
    }

    if (key === "ArrowUp" && caretOffset(el) === 0) {
      const target = [...blocks.slice(0, index)].reverse().find((b) => !hidden.has(b.id) && els.current.has(b.id));
      if (target) {
        event.preventDefault();
        placeCaret(els.current.get(target.id)!, "end");
      } else if (titleEl.current) {
        event.preventDefault();
        placeCaret(titleEl.current, "end");
      }
      return;
    }

    if (key === "ArrowDown" && isCaretAtEnd(el)) {
      const target = blocks.slice(index + 1).find((b) => !hidden.has(b.id) && els.current.has(b.id));
      if (target) {
        event.preventDefault();
        placeCaret(els.current.get(target.id)!, "start");
      }
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLElement>, block: Block, index: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();

    const lines = text.replace(/\r/g, "").split("\n");
    if (lines.length === 1) {
      insertText(text);
      syncFromDom(block.id);
      return;
    }

    insertText(lines[0]);
    const el = els.current.get(block.id);
    const head = el ? el.innerHTML : block.content;

    const created: Block[] = [];
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (!trimmed && created.length && !created[created.length - 1].content) continue;
      const md = block.type === "code" ? null : markdownTypeFor(trimmed);
      created.push({
        ...emptyBlock(md?.type ?? (block.type === "code" ? "code" : "paragraph"), block.indent),
        content: escapeHtml(md ? md.rest : trimmed),
      });
    }

    setBlocks((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], content: head };
      copy.splice(index + 1, 0, ...created);
      return copy;
    });
    const last = created[created.length - 1];
    if (last) requestFocus(last.id, "end");
  };

  const onContentChange = (block: Block, html: string) => {
    patchBlock(block.id, { content: html });

    if (block.type === "code") return;
    const el = els.current.get(block.id);
    if (!el) return;
    const before = textBeforeCaret(el);
    const match = /(?:^|\s)\/([\p{L}\d-]*)$/u.exec(before);
    if (match) {
      const position = menuPosition(el);
      setSlash((prev) => ({
        blockId: block.id,
        query: match[1],
        index: prev && prev.blockId === block.id && prev.query === match[1] ? prev.index : 0,
        ...position,
      }));
    } else if (slash?.blockId === block.id) {
      setSlash(null);
    }
  };

  /* -------------------------------------------------------- glisser-deposer */

  /**
   * Deplacement a la souris ou au doigt (pointer events) plutot qu'en
   * drag-and-drop HTML5 : le curseur reste precis, le tactile fonctionne, et
   * un simple clic sur la poignee continue d'ouvrir le menu du bloc.
   */
  const onDragHandleDown = (block: Block) => (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    dragInfo.current = { id: block.id, moved: false };

    const onMove = (moveEvent: PointerEvent) => {
      const info = dragInfo.current;
      if (!info) return;
      if (!info.moved) {
        if (Math.abs(moveEvent.clientY - startY) < 4 && Math.abs(moveEvent.clientX - startX) < 4) return;
        info.moved = true;
        setDragId(info.id);
        document.body.style.cursor = "grabbing";
      }
      moveEvent.preventDefault();
      const row = (document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as HTMLElement | null)?.closest(
        "[data-block-id]",
      ) as HTMLElement | null;
      const id = row?.dataset.blockId;
      if (!row || !id || id === info.id) {
        updateDrop(null);
        return;
      }
      const rect = row.getBoundingClientRect();
      updateDrop({ id, where: moveEvent.clientY < rect.top + rect.height / 2 ? "before" : "after" });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";

      const info = dragInfo.current;
      const target = dropRef.current;
      dragInfo.current = null;
      setDragId(null);
      updateDrop(null);
      if (!info?.moved) return;

      // Le relachement suit un deplacement : ce n'est pas un clic sur la poignee.
      suppressClick.current = true;
      if (!target) return;

      const list = blocksRef.current;
      const from = list.findIndex((b) => b.id === info.id);
      const at = list.findIndex((b) => b.id === target.id);
      if (from < 0 || at < 0) return;
      moveSubtree(from, target.where === "before" ? at : at + subtreeLength(list, at));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* ------------------------------------------------------------- rendu */

  const slashItems = slash ? filterDefs(slash.query) : [];
  const menuBlock = menu ? blocks[menu.index] : null;

  return (
    <div className="flex min-h-full flex-col">
      {conflictWith && (
        <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm">
          <span className="flex-1 text-ink">
            Cette page a été modifiée par <b>{conflictWith}</b> pendant que vous écriviez. Vos dernières
            modifications ne sont pas enregistrées.
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
          >
            Recharger sa version
          </button>
          <button
            type="button"
            onClick={async () => {
              // Forcer : on repart de la révision actuelle et on réécrit par-dessus.
              const fresh = await api.getPage(page.id);
              revRef.current = fresh.page.rev;
              setConflictWith(null);
              setBlocks((current) => [...current]);
            }}
            className="shrink-0 rounded-md px-2.5 py-1 text-xs text-ink-soft hover:bg-hover"
          >
            Garder la mienne
          </button>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-11 items-center gap-2 bg-app/85 px-3 backdrop-blur-sm">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm">
          {breadcrumb.map((crumb, index) => (
            <span key={crumb.id} className="flex min-w-0 items-center gap-1">
              {index > 0 && <span className="text-muted">/</span>}
              <Link
                href={`/p/${crumb.id}`}
                className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-ink-soft hover:bg-hover"
              >
                {crumb.icon && <span>{crumb.icon}</span>}
                <span className="truncate">{(crumb.id === page.id ? title : crumb.title) || UNTITLED}</span>
              </Link>
            </span>
          ))}
        </nav>
        <span className="shrink-0 text-xs text-muted">
          {status === "saving" ? "Enregistrement…" : status === "saved" ? "Enregistré" : ""}
        </span>
        <button
          type="button"
          onClick={() => void toggleFavorite(page.id)}
          className="grid size-7 shrink-0 place-items-center rounded hover:bg-hover"
          aria-label={current?.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          title={current?.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        >
          <svg
            viewBox="0 0 20 20"
            className={`size-4 ${current?.isFavorite ? "fill-amber-400" : "fill-none stroke-current stroke-[1.6] text-muted"}`}
          >
            <path d="M10 2.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.47l-4.7 2.48.9-5.23-3.8-3.7 5.25-.76L10 2.5Z" />
          </svg>
        </button>
      </header>

      <div className="mx-auto w-full max-w-[860px] flex-1 overflow-x-clip px-6 pb-40 sm:px-[76px]">
        <div className="group/icon pt-16">
          {icon ? (
            <button
              type="button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setIconPickerAt({ top: rect.bottom + 8, left: rect.left });
              }}
              className="-ml-1 mb-1 rounded-md px-1 text-[70px] leading-none hover:bg-hover"
              aria-label="Changer l'icône de la page"
            >
              {icon}
            </button>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setIconPickerAt({ top: rect.bottom + 8, left: rect.left });
              }}
              className="mb-1 rounded px-1.5 py-1 text-sm text-muted opacity-0 transition-opacity hover:bg-hover group-hover/icon:opacity-100"
            >
              ☺ Ajouter une icône
            </button>
          )}

          <Editable
            html={escapeHtml(title)}
            plainText
            register={(el) => {
              titleEl.current = el;
            }}
            placeholder={UNTITLED}
            className="text-[40px] font-bold leading-[1.15] tracking-[-0.02em]"
            onChange={(value) => {
              const next = decodeHtml(value);
              setTitle(next);
              patchLocal(page.id, { title: next });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || (event.key === "ArrowDown" && blocks.length)) {
                event.preventDefault();
                const first = blocks.find((b) => els.current.has(b.id));
                if (first) placeCaret(els.current.get(first.id)!, "start");
              }
            }}
          />
        </div>

        {database && database.schema.length > 0 && (
          <dl className="mt-5 grid grid-cols-[minmax(110px,150px)_1fr] items-start gap-x-3 gap-y-0.5 border-b border-line pb-4">
            {database.schema
              .filter((property) => property.type !== "text" || property.name !== "Tâche")
              .map((property) => (
                <div key={property.id} className="contents">
                  <dt className="py-1.5 text-sm text-muted" title={property.description}>
                    {property.name}
                  </dt>
                  <dd className="relative min-w-0 py-0.5">
                    <PropertyCell
                      property={property}
                      value={props[property.name] ?? null}
                      onChange={(next) => {
                        setProps((current) => ({ ...current, [property.name]: next }));
                        void api.updatePage(page.id, { props: { [property.name]: next } });
                      }}
                    />
                  </dd>
                </div>
              ))}
          </dl>
        )}

        <div className="pt-3">
          {blocks.map((block, index) =>
            hidden.has(block.id) ? null : (
              <BlockRow
                key={block.id}
                block={block}
                index={index}
                listNumber={numbers.get(block.id) ?? 1}
                hasChildren={hasChildren(index)}
                isFocused={focusedId === block.id}
                isDragging={dragId === block.id}
                dropHint={(drop?.id === block.id ? drop.where : null) as DropHint}
                register={(el) => registerEl(block.id, el)}
                onChange={(html) => onContentChange(block, html)}
                onPatch={(patch) => patchBlock(block.id, patch)}
                onKeyDown={(event) => onKeyDown(event, block, index)}
                onPaste={(event) => onPaste(event, block, index)}
                onFocus={() => setFocusedId(block.id)}
                onAddBelow={() => addBelow(index)}
                onOpenMenu={(anchor) => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  const rect = anchor.getBoundingClientRect();
                  setMenu({
                    index,
                    top: Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - 440)),
                    left: rect.left,
                  });
                }}
                onDragHandleDown={onDragHandleDown(block)}
              />
            ),
          )}

          <div
            className="min-h-40 cursor-text"
            onClick={() => {
              const last = blocks[blocks.length - 1];
              if (last && last.type === "paragraph" && !decodeHtml(last.content).trim()) {
                const el = els.current.get(last.id);
                if (el) placeCaret(el, "end");
                return;
              }
              const fresh = emptyBlock("paragraph", 0);
              insertBlockAt(blocks.length, fresh);
              requestFocus(fresh.id, "start");
            }}
          />
        </div>
      </div>

      {slash && (
        <SlashMenu
          items={slashItems}
          activeIndex={Math.min(slash.index, Math.max(0, slashItems.length - 1))}
          position={{ top: slash.top, left: slash.left }}
          onHover={(index) => setSlash((prev) => (prev ? { ...prev, index } : prev))}
          onPick={(def) => {
            const index = blocks.findIndex((b) => b.id === slash.blockId);
            if (index >= 0) applyDef(def, blocks[index], index);
          }}
        />
      )}

      {menu && menuBlock && (
        <BlockMenu
          block={menuBlock}
          position={{ top: menu.top, left: menu.left }}
          onClose={() => setMenu(null)}
          onDelete={() => {
            removeAt(menu.index);
            setMenu(null);
          }}
          onDuplicate={() => {
            insertBlockAt(menu.index + 1, { ...menuBlock, id: newId() });
            setMenu(null);
          }}
          onTurnInto={(type) => {
            turnInto(menu.index, type);
            setMenu(null);
          }}
          onMove={(direction) => {
            moveByStep(menu.index, direction);
            setMenu(null);
          }}
          onIndent={(direction) => {
            setIndent(menu.index, direction);
            setMenu(null);
          }}
        />
      )}

      {iconPickerAt && (
        <EmojiPicker
          position={iconPickerAt}
          onPick={(emoji) => {
            setIcon(emoji);
            patchLocal(page.id, { icon: emoji });
            void api.updatePage(page.id, { icon: emoji });
            setIconPickerAt(null);
          }}
          onClear={() => {
            setIcon("");
            patchLocal(page.id, { icon: "" });
            void api.updatePage(page.id, { icon: "" });
            setIconPickerAt(null);
          }}
          onClose={() => setIconPickerAt(null)}
        />
      )}
    </div>
  );
}
