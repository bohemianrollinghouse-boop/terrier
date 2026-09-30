import { applicationDefault, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "terrier-local";

declare global {
  var __terrierFirestore: Firestore | undefined;
}

/**
 * En local on parle à l'émulateur Firestore (aucune clé de service à poser sur
 * le disque) ; en production App Hosting fournit les identifiants par défaut.
 */
function app(): App {
  const existing = getApps();
  if (existing.length) return existing[0];
  const useEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  return initializeApp(
    useEmulator ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID },
  );
}

/**
 * Le cache vit sur globalThis : en développement, Next recharge les modules à
 * chaque édition, et une variable de module laisserait rappeler settings() sur
 * une instance Firestore déjà configurée — ce que le SDK refuse.
 */
export function firestore(): Firestore {
  if (globalThis.__terrierFirestore) return globalThis.__terrierFirestore;
  const db = getFirestore(app());
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Le SDK garde une instance unique par application : en développement, Next
    // recharge nos modules sans la recréer, et settings() proteste. Les réglages
    // sont déjà ceux voulus, il n'y a rien à rattraper.
  }
  globalThis.__terrierFirestore = db;
  return db;
}

export function adminAuth(): Auth {
  return getAuth(app());
}

export const projectId = PROJECT_ID;
