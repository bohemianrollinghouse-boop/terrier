"use client";

import { useSyncExternalStore } from "react";

/**
 * Petit store autour de localStorage, lu via useSyncExternalStore : les
 * preferences locales (arbre deplie, theme) sortent ainsi de l'etat React et
 * restent synchronisees entre les composants, sans effet de bord au montage.
 */

const EVENT = "terrier:store-change";

export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* navigation privee ou stockage plein : la preference n'est pas retenue */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Valeur brute stockee, ou null cote serveur et au premier rendu. */
export function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readStore(key),
    () => null,
  );
}
