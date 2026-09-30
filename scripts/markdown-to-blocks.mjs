/**
 * Conversion du Markdown enrichi exporté par Notion vers les blocs de Terrier.
 * Volontairement petit : on couvre ce que Notion produit réellement dans ces
 * pages (titres, listes, cases, citations, code, séparateurs, encadrés).
 */

import { randomUUID } from "node:crypto";

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Gras, italique, code, liens — le reste est échappé. */
export function inlineToHtml(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
  html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  html = html.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  return html.trim();
}

const block = (type, content, extra = {}) => ({
  id: randomUUID(),
  type,
  content,
  checked: false,
  collapsed: false,
  indent: 0,
  meta: {},
  ...extra,
});

export function markdownToBlocks(markdown) {
  const lines = String(markdown ?? "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let inCode = false;
  let codeLang = "texte";
  let codeLines = [];

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    const fence = /^\s*```(\w*)\s*$/.exec(line);
    if (fence) {
      if (inCode) {
        blocks.push(block("code", escapeHtml(codeLines.join("\n")), { meta: { lang: codeLang } }));
        inCode = false;
        codeLines = [];
      } else {
        inCode = true;
        codeLang = fence[1] || "texte";
      }
      continue;
    }
    if (inCode) {
      codeLines.push(raw);
      continue;
    }

    if (!line.trim()) continue;

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(block("divider", ""));
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(3, heading[1].length);
      blocks.push(block(`h${level}`, inlineToHtml(heading[2])));
      continue;
    }

    const indent = Math.floor(((/^\s*/.exec(line)?.[0].length) ?? 0) / 2);

    const todo = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (todo) {
      blocks.push(block("todo", inlineToHtml(todo[2]), { checked: todo[1].toLowerCase() === "x", indent }));
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push(block("bulleted", inlineToHtml(bullet[1]), { indent }));
      continue;
    }

    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      blocks.push(block("numbered", inlineToHtml(numbered[1]), { indent }));
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      blocks.push(block("quote", inlineToHtml(quote[1])));
      continue;
    }

    // Notion exporte ses encadrés sous la forme « <aside> emoji texte »
    const callout = /^\s*<aside>\s*(\p{Extended_Pictographic}?)\s*(.*)$/u.exec(line);
    if (callout) {
      blocks.push(block("callout", inlineToHtml(callout[2]), { meta: { emoji: callout[1] || "💡" } }));
      continue;
    }
    if (/^\s*<\/aside>\s*$/.test(line)) continue;

    const image = /^\s*!\[[^\]]*\]\((\S+)\)\s*$/.exec(line);
    if (image) {
      blocks.push(block("image", "", { meta: { url: image[1] } }));
      continue;
    }

    blocks.push(block("paragraph", inlineToHtml(line)));
  }

  if (inCode && codeLines.length) {
    blocks.push(block("code", escapeHtml(codeLines.join("\n")), { meta: { lang: codeLang } }));
  }

  return blocks.length ? blocks : [block("paragraph", "")];
}
