"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const EMOJIS: { emoji: string; name: string }[] = [
  { emoji: "\u{1F4C4}", name: "page document fichier" },
  { emoji: "\u{1F4DD}", name: "note memo ecrire" },
  { emoji: "\u{1F4D3}", name: "journal carnet" },
  { emoji: "\u{1F4DA}", name: "livres notes cours" },
  { emoji: "\u{1F4C1}", name: "dossier" },
  { emoji: "\u{1F5C2}", name: "classeur archive" },
  { emoji: "\u{1F4CC}", name: "epingle important" },
  { emoji: "\u{1F4CB}", name: "presse papier taches" },
  { emoji: "✅", name: "fait valide coche" },
  { emoji: "\u{1F5D3}", name: "calendrier date" },
  { emoji: "⏰", name: "reveil temps" },
  { emoji: "\u{1F3AF}", name: "objectif cible" },
  { emoji: "\u{1F680}", name: "fusee projet lancement" },
  { emoji: "\u{1F4A1}", name: "idee ampoule astuce" },
  { emoji: "\u{1F525}", name: "feu urgent" },
  { emoji: "⭐", name: "etoile favori" },
  { emoji: "❤️", name: "coeur amour" },
  { emoji: "\u{1F9E0}", name: "cerveau reflexion" },
  { emoji: "\u{1F4CA}", name: "graphique donnees" },
  { emoji: "\u{1F4B0}", name: "argent budget" },
  { emoji: "\u{1F3E0}", name: "maison accueil" },
  { emoji: "\u{1F464}", name: "personne profil" },
  { emoji: "\u{1F465}", name: "equipe personnes" },
  { emoji: "\u{1F4AC}", name: "discussion message" },
  { emoji: "\u{1F4E7}", name: "mail courrier" },
  { emoji: "\u{1F517}", name: "lien url" },
  { emoji: "\u{1F527}", name: "outil reglage" },
  { emoji: "⚙️", name: "parametres engrenage" },
  { emoji: "\u{1F4BB}", name: "code ordinateur dev" },
  { emoji: "\u{1F41E}", name: "bug probleme" },
  { emoji: "\u{1F9EA}", name: "test experience" },
  { emoji: "\u{1F5BC}", name: "image photo" },
  { emoji: "\u{1F3B5}", name: "musique" },
  { emoji: "\u{1F374}", name: "recette cuisine" },
  { emoji: "✈️", name: "voyage avion" },
  { emoji: "\u{1F33F}", name: "plante nature" },
  { emoji: "\u{1F304}", name: "matin lever" },
  { emoji: "\u{1F319}", name: "nuit lune" },
  { emoji: "\u{1F44B}", name: "bonjour bienvenue" },
  { emoji: "\u{1F389}", name: "fete celebration" },
];

type Props = {
  position: { top: number; left: number };
  onPick: (emoji: string) => void;
  onClear?: () => void;
  onClose: () => void;
};

export default function EmojiPicker({ position, onPick, onClear, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EMOJIS;
    return EMOJIS.filter((item) => item.name.includes(q));
  }, [query]);

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div className="pop pop-in fixed z-50 w-72 p-2" style={{ top: position.top, left: position.left }}>
        <div className="flex items-center gap-2 pb-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une icône"
            className="min-w-0 flex-1 rounded-md border border-line bg-app px-2 py-1 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          />
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:bg-hover"
            >
              Retirer
            </button>
          )}
        </div>
        <div className="thin-scroll grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
          {results.map((item) => (
            <button
              key={item.emoji}
              type="button"
              title={item.name}
              onClick={() => onPick(item.emoji)}
              className="grid aspect-square place-items-center rounded-md text-xl hover:bg-hover"
            >
              {item.emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
