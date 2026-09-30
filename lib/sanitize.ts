/**
 * Nettoyage du HTML inline produit par les zones contentEditable.
 * On garde une allowlist minuscule : le contenu d'un bloc n'a jamais besoin
 * de plus que du gras / italique / souligné / barré / code / lien / saut de ligne.
 */

const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "s", "strike", "code", "br", "a"]);
const SAFE_HREF = /^(https?:\/\/|mailto:|#|\/)/i;

export function sanitizeInline(input: string): string {
  if (!input) return "";

  let html = input
    // éléments dont on jette aussi le contenu
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|style|iframe|object|embed|svg|math)\b[^>]*>/gi, "")
    // les navigateurs collent volontiers des div/p : on les convertit en sauts de ligne
    .replace(/<\/(div|p|li|h[1-6])\s*>/gi, "<br>")
    .replace(/<(div|p|li|h[1-6])\b[^>]*>/gi, "");

  html = html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g, (_m, slash, rawTag, rawAttrs) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (slash) return `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "a") {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(String(rawAttrs));
      const url = (href?.[2] ?? href?.[3] ?? href?.[4] ?? "").trim();
      if (!SAFE_HREF.test(url)) return "<span>".replace("<span>", "");
      const safe = url.replace(/"/g, "&quot;");
      return `<a href="${safe}" target="_blank" rel="noreferrer noopener">`;
    }
    return `<${tag}>`;
  });

  // les <> orphelins restants ne sont pas du balisage : on les échappe
  return html.replace(/<(?!\/?(?:b|strong|i|em|u|s|strike|code|br|a)\b)/g, "&lt;").trim();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
