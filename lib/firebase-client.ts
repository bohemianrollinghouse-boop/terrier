"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, type Auth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
};

export const authConfigured = !!config.apiKey && !!config.authDomain;

function app(): FirebaseApp {
  return getApps().length ? getApps()[0] : initializeApp(config);
}

function auth(): Auth {
  return getAuth(app());
}

/**
 * Connexion Google, puis échange du jeton contre un cookie de session côté
 * serveur : le navigateur n'a plus besoin du SDK ensuite, et les routes API
 * valident le cookie sans aller-retour supplémentaire.
 */
export async function signInWithGoogle(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const credential = await signInWithPopup(auth(), new GoogleAuthProvider());
    const idToken = await credential.user.getIdToken();
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      await signOut(auth()).catch(() => {});
      return { ok: false, message: data.error ?? "Connexion refusée." };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connexion impossible.";
    return { ok: false, message };
  }
}

export async function signOutEverywhere(): Promise<void> {
  await fetch("/api/session", { method: "DELETE" }).catch(() => {});
  if (authConfigured) await signOut(auth()).catch(() => {});
}
