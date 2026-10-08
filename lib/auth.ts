import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminAuth } from "./firebase-admin";

/**
 * Deux portes d'entrée, une seule identité derrière :
 *  - le navigateur présente un cookie de session Firebase (connexion Google) ;
 *  - un agent externe (ChatGPT, script) présente la clé d'API en en-tête.
 * La liste blanche d'adresses décide qui a le droit d'entrer par la première.
 */

export const SESSION_COOKIE = "terrier_session";
const FIVE_DAYS = 60 * 60 * 24 * 5;

export function allowedEmails(): string[] {
  return (process.env.TERRIER_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | undefined): boolean {
  if (!email) return false;
  const list = allowedEmails();
  // Sans liste configurée, personne n'entre : mieux vaut une porte fermée qu'ouverte.
  return list.includes(email.toLowerCase());
}

export async function createSessionCookie(idToken: string): Promise<{ value: string; maxAge: number } | null> {
  const decoded = await adminAuth().verifyIdToken(idToken);
  if (!isAllowedEmail(decoded.email)) return null;
  const value = await adminAuth().createSessionCookie(idToken, { expiresIn: FIVE_DAYS * 1000 });
  return { value, maxAge: FIVE_DAYS };
}

export type Viewer = { email: string; via: "session" | "api-key" };

/**
 * Échappatoire de développement : en local, tant qu'aucune liste blanche n'est
 * configurée, on travaille sans se connecter. La double condition rend la chose
 * impossible en production, où NODE_ENV vaut "production" et où la liste est
 * fournie par apphosting.yaml.
 */
function devBypass(): Viewer | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.TERRIER_ALLOWED_EMAILS) return null;
  return { email: "dev@localhost", via: "session" };
}
/**
 * La cle d'API presentee est-elle la bonne ? Comparaison a longueur constante,
 * pour ne pas laisser deviner la cle octet par octet.
 *
 * Exportee parce que le serveur MCP l'accepte aussi dans l'URL : son client ne
 * sait pas toujours poser un en-tete.
 */
export function apiKeyMatches(presented: string): boolean {
  const key = process.env.TERRIER_API_KEY;
  if (!key || !presented) return false;
  if (presented.length !== key.length) return false;
  return timingSafeEqual(presented, key);
}


/** Identifie l'appelant, ou null s'il n'a rien de valable à présenter. */
export async function currentViewer(request?: Request): Promise<Viewer | null> {
  const bypass = devBypass();
  if (bypass) return bypass;

  if (request) {
    const header = request.headers.get("authorization") ?? request.headers.get("x-api-key") ?? "";
    const presented = header.replace(/^Bearer\s+/i, "").trim();
    if (apiKeyMatches(presented)) {
      return { email: "api-key", via: "api-key" };
    }
  }

  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    if (!isAllowedEmail(decoded.email)) return null;
    return { email: decoded.email!, via: "session" };
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** À appeler en tête de chaque route API. Renvoie une réponse 401 si l'appelant n'est pas connu. */
export async function requireViewer(request: Request): Promise<{ viewer: Viewer } | { error: NextResponse }> {
  const viewer = await currentViewer(request);
  if (!viewer) {
    return {
      error: NextResponse.json(
        { error: "Non authentifié : connectez-vous, ou présentez la clé d'API dans l'en-tête Authorization." },
        { status: 401 },
      ),
    };
  }
  return { viewer };
}
