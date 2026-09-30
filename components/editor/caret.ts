/** Manipulation du caret dans les zones contentEditable. */

export type CaretTarget = "start" | "end" | number;

export function placeCaret(el: HTMLElement, at: CaretTarget = "end"): void {
  el.focus();
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  if (at === "start") {
    range.selectNodeContents(el);
    range.collapse(true);
  } else if (at === "end") {
    range.selectNodeContents(el);
    range.collapse(false);
  } else {
    const { node, offset } = nodeAtOffset(el, at);
    range.setStart(node, offset);
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Retrouve le noeud texte correspondant a un offset global de caracteres. */
function nodeAtOffset(el: HTMLElement, target: number): { node: Node; offset: number } {
  let remaining = Math.max(0, target);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    last = node;
    const len = node.data.length;
    if (remaining <= len) return { node, offset: remaining };
    remaining -= len;
  }
  if (last) return { node: last, offset: last.data.length };
  return { node: el, offset: 0 };
}

/**
 * Supprime les `count` caracteres qui precedent le caret et renvoie le nouveau
 * HTML. On passe par un Range plutot que par une decoupe de chaine : le HTML
 * encode certains caracteres (`>` devient `&gt;`), une comparaison textuelle
 * laisserait trainer le prefixe.
 */
export function deleteBeforeCaret(el: HTMLElement, count: number): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return el.innerHTML;
  const caret = selection.getRangeAt(0);
  if (!el.contains(caret.startContainer)) return el.innerHTML;

  const target = Math.max(0, caretOffset(el) - count);
  const start = nodeAtOffset(el, target);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(caret.endContainer, caret.endOffset);
  range.deleteContents();
  el.normalize();

  placeCaret(el, target);
  return el.innerHTML;
}

function currentRange(el: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  return range;
}

/** Position du caret en nombre de caracteres depuis le debut du bloc. */
export function caretOffset(el: HTMLElement): number {
  const range = currentRange(el);
  if (!range) return 0;
  const probe = document.createRange();
  probe.selectNodeContents(el);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length;
}

export function isCaretAtStart(el: HTMLElement): boolean {
  const range = currentRange(el);
  if (!range) return false;
  return range.collapsed && caretOffset(el) === 0;
}

export function isCaretAtEnd(el: HTMLElement): boolean {
  const range = currentRange(el);
  if (!range) return false;
  return range.collapsed && caretOffset(el) === (el.innerText ?? "").replace(/\n$/, "").length;
}

function fragmentToHtml(fragment: DocumentFragment): string {
  const holder = document.createElement("div");
  holder.appendChild(fragment);
  return holder.innerHTML;
}

/** Coupe le contenu du bloc au caret, en conservant la mise en forme inline. */
export function splitAtCaret(el: HTMLElement): { before: string; after: string } {
  const range = currentRange(el);
  if (!range) return { before: el.innerHTML, after: "" };

  const head = document.createRange();
  head.selectNodeContents(el);
  head.setEnd(range.startContainer, range.startOffset);

  const tail = document.createRange();
  tail.selectNodeContents(el);
  tail.setStart(range.endContainer, range.endOffset);

  return { before: fragmentToHtml(head.cloneContents()), after: fragmentToHtml(tail.cloneContents()) };
}

/** Texte brut situe avant le caret (pour les raccourcis markdown et le menu /). */
export function textBeforeCaret(el: HTMLElement): string {
  const range = currentRange(el);
  if (!range) return "";
  const probe = document.createRange();
  probe.selectNodeContents(el);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString();
}

/** Insere du texte brut a la position du caret. */
export function insertText(text: string): void {
  document.execCommand("insertText", false, text);
}

export function execFormat(command: "bold" | "italic" | "underline" | "strikeThrough"): void {
  document.execCommand(command, false);
}

/** Enveloppe la selection dans <code> (ou la deroule si elle l'est deja). */
export function toggleInlineCode(el: HTMLElement): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;

  const inCode = (node: Node | null): HTMLElement | null => {
    let cursor: Node | null = node;
    while (cursor && cursor !== el) {
      if (cursor.nodeType === 1 && (cursor as HTMLElement).tagName === "CODE") return cursor as HTMLElement;
      cursor = cursor.parentNode;
    }
    return null;
  };

  const existing = inCode(range.startContainer);
  if (existing) {
    const parent = existing.parentNode;
    if (!parent) return null;
    while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
    parent.removeChild(existing);
  } else {
    if (range.collapsed) return null;
    const code = document.createElement("code");
    code.appendChild(range.extractContents());
    range.insertNode(code);
    const after = document.createRange();
    after.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(after);
  }
  el.normalize();
  return el.innerHTML;
}
