"use client";

import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ClipboardEvent } from "react";

type Props = {
  html: string;
  /** Lecture en texte brut (blocs de code) plutot qu'en HTML inline. */
  plainText?: boolean;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  tag?: "div" | "span";
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  register?: (el: HTMLElement | null) => void;
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * contentEditable non controle : React n'ecrit dans le DOM que lorsque la valeur
 * vient d'ailleurs (split, fusion, changement de type). Sans cela le caret
 * sauterait a chaque frappe.
 */
export default function Editable({
  html,
  plainText = false,
  className,
  style,
  placeholder,
  tag = "div",
  onChange,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
  register,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const local = useRef(html);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (html === local.current) return;
    // Une commande d'edition (gras, saut de ligne, code inline) a deja mis le DOM
    // a jour : on ne reecrit pas, sinon le caret repartirait au debut du bloc.
    const domValue = plainText ? escapeHtml((el.innerText ?? "").replace(/\n$/, "")) : el.innerHTML;
    local.current = html;
    if (html !== domValue) el.innerHTML = html;
  }, [html, plainText]);

  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== html) {
      el.innerHTML = html;
      local.current = html;
    }
    // Synchronisation initiale uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const read = () => {
    const el = ref.current;
    if (!el) return "";
    if (plainText) return escapeHtml((el.innerText ?? "").replace(/\n$/, ""));
    return el.innerHTML;
  };

  const Tag = tag as "div";

  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        ref.current = el;
        register?.(el);
      }}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder}
      className={className}
      style={style}
      onInput={() => {
        const value = read();
        local.current = value;
        onChange(value);
      }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={onFocus}
      onBlur={() => {
        // Nettoie les balises vides laissees par le navigateur.
        const value = read();
        if (value !== local.current) {
          local.current = value;
          onChange(value);
        }
        onBlur?.();
      }}
    />
  );
}
