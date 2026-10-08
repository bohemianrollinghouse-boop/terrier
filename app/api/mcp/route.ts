import { NextResponse } from "next/server";
import { apiKeyMatches } from "@/lib/auth";
import { createPage, getBlocks, getPage, listPages, search, updatePage, writeBlocks } from "@/lib/db";
import type { Block } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Serveur MCP (Model Context Protocol) de Terrier.
 *
 * Un connecteur personnalisé de ChatGPT parle ce protocole : du JSON-RPC 2.0
 * sur un simple POST. Les outils exposés doublent ceux de l'API REST ; search
 * et fetch portent les noms et les formats qu'attend ChatGPT, les autres sont
 * nommés en clair pour que le modèle devine leur usage.
 *
 * La clé d'API s'accepte ici dans l'en-tête Authorization comme dans l'URL
 * (?key=…) : certains clients MCP ne savent déclarer qu'une adresse, sans
 * en-tête, et l'URL reste alors le seul endroit où glisser un secret.
 */

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const PROTOCOL = "2025-06-18";

function origine(request: Request): string {
  const headers = request.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? new URL(request.url).host;
  const enLocal = host.startsWith("localhost") || host.startsWith("127.");
  const proto = headers.get("x-forwarded-proto") ?? (enLocal ? "http" : "https");
  return `${proto}://${host}`;
}

function autorise(request: Request): boolean {
  const brut = (request.headers.get("authorization") ?? request.headers.get("x-api-key") ?? "").trim();
  const enTete = brut.toLowerCase().startsWith("bearer ") ? brut.slice(7).trim() : brut;
  if (apiKeyMatches(enTete)) return true;
  return apiKeyMatches(new URL(request.url).searchParams.get("key") ?? "");
}

/* ------------------------------------------------------------------ outils */

const texte = { type: "string" } as const;

const TYPES_DE_BLOC = [
  "paragraph",
  "h1",
  "h2",
  "h3",
  "bulleted",
  "numbered",
  "todo",
  "toggle",
  "quote",
  "callout",
  "code",
  "divider",
];

const schemaBlocs = {
  type: "array",
  description: "Contenu de la page, bloc par bloc.",
  items: {
    type: "object",
    properties: {
      type: { type: "string", enum: TYPES_DE_BLOC },
      texte,
      coche: { type: "boolean", description: "Pour les blocs todo." },
    },
    required: ["type", "texte"],
  },
};

const OUTILS = [
  {
    name: "search",
    description:
      "Cherche dans Terrier : titres, contenus et propriétés. À utiliser avant toute création, pour ne pas ouvrir une page qui existe déjà.",
    inputSchema: { type: "object", properties: { query: texte }, required: ["query"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "fetch",
    description: "Lit une page entière de Terrier à partir de son identifiant, contenu compris.",
    inputSchema: { type: "object", properties: { id: texte }, required: ["id"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "lister_pages",
    description: "Liste toutes les pages de l'espace, avec leur identifiant, leur titre et leur page parente.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "creer_page",
    description:
      "Crée une page dans Terrier. Pour la ranger sous une autre, passer l'identifiant de celle-ci en parentId.",
    inputSchema: {
      type: "object",
      properties: {
        titre: texte,
        icone: { type: "string", description: "Un emoji, facultatif." },
        parentId: { type: "string", description: "Identifiant de la page parente, facultatif." },
        blocs: schemaBlocs,
      },
      required: ["titre"],
    },
  },
  {
    name: "remplacer_contenu",
    description:
      "Remplace tout le contenu d'une page. Lire la page avec fetch au préalable et renvoyer l'ensemble des blocs voulus, sinon le reste est effacé.",
    inputSchema: {
      type: "object",
      properties: { id: texte, blocs: schemaBlocs },
      required: ["id", "blocs"],
    },
  },
  {
    name: "renommer_page",
    description: "Change le titre ou l'icône d'une page existante.",
    inputSchema: { type: "object", properties: { id: texte, titre: texte, icone: texte }, required: ["id"] },
  },
];

type BlocEntrant = { type?: string; texte?: string; coche?: boolean };

const versBlocs = (blocs: BlocEntrant[] | undefined): Block[] =>
  (blocs ?? []).map((bloc) => ({ type: bloc.type, content: bloc.texte, checked: bloc.coche }) as unknown as Block);

const enTexte = (blocs: Block[]): string =>
  blocs
    .map((bloc) => bloc.content)
    .filter(Boolean)
    .join("\n");

async function appeler(nom: string, args: Record<string, unknown>, base: string): Promise<unknown> {
  if (nom === "search") {
    const hits = await search(String(args.query ?? ""));
    return { results: hits.map((h) => ({ id: h.id, title: h.title, url: `${base}/p/${h.id}`, text: h.snippet })) };
  }

  if (nom === "fetch") {
    const id = String(args.id ?? "");
    const page = await getPage(id);
    if (!page) throw new Error(`Aucune page d'identifiant ${id}.`);
    const blocs = await getBlocks(id);
    return { id, title: page.title, text: enTexte(blocs), url: `${base}/p/${id}`, metadata: { icone: page.icon } };
  }

  if (nom === "lister_pages") {
    const pages = await listPages();
    return {
      pages: pages.map((p) => ({ id: p.id, titre: p.title, icone: p.icon, parentId: p.parentId, type: p.kind })),
    };
  }

  if (nom === "creer_page") {
    const page = await createPage({
      title: String(args.titre ?? ""),
      icon: args.icone ? String(args.icone) : "",
      parentId: args.parentId ? String(args.parentId) : null,
      blocks: versBlocs(args.blocs as BlocEntrant[]),
      by: "MCP",
    });
    return { id: page.id, titre: page.title, url: `${base}/p/${page.id}` };
  }

  if (nom === "remplacer_contenu") {
    const id = String(args.id ?? "");
    const { rev } = await writeBlocks(id, versBlocs(args.blocs as BlocEntrant[]), { by: "MCP" });
    return { id, revision: rev, url: `${base}/p/${id}` };
  }

  if (nom === "renommer_page") {
    const id = String(args.id ?? "");
    const page = await updatePage(
      id,
      {
        title: args.titre === undefined ? undefined : String(args.titre),
        icon: args.icone === undefined ? undefined : String(args.icone),
      },
      "MCP",
    );
    if (!page) throw new Error(`Aucune page d'identifiant ${id}.`);
    return { id, titre: page.title, url: `${base}/p/${id}` };
  }

  throw new Error(`Outil inconnu : ${nom}`);
}

/* -------------------------------------------------------------- transport */

const reponse = (id: Rpc["id"], result: unknown) => NextResponse.json({ jsonrpc: "2.0", id, result });

const erreur = (id: Rpc["id"], code: number, message: string, status = 200) =>
  NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });

export async function POST(request: Request) {
  if (!autorise(request)) return erreur(null, -32001, "Clé d'API absente ou invalide.", 401);

  const message = (await request.json().catch(() => null)) as Rpc | null;
  if (!message?.method) return erreur(null, -32600, "Requête JSON-RPC illisible.", 400);

  // Une notification n'attend pas de réponse : elle n'a pas d'identifiant.
  const estNotification = message.id === undefined || message.id === null;
  const id = message.id ?? null;

  try {
    if (message.method === "initialize") {
      const demandee = (message.params?.protocolVersion as string) ?? PROTOCOL;
      return reponse(id, {
        protocolVersion: demandee,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "terrier", title: "Terrier", version: "1.0.0" },
        instructions:
          "Espace de notes personnel. Chercher avant de créer, et lire une page avant d'en remplacer le contenu.",
      });
    }

    if (message.method === "ping") return reponse(id, {});
    if (message.method.startsWith("notifications/")) return new NextResponse(null, { status: 202 });
    if (message.method === "tools/list") return reponse(id, { tools: OUTILS });

    if (message.method === "tools/call") {
      const nom = String(message.params?.name ?? "");
      const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
      const sortie = await appeler(nom, args, origine(request));
      return reponse(id, {
        content: [{ type: "text", text: JSON.stringify(sortie, null, 2) }],
        structuredContent: sortie,
        isError: false,
      });
    }

    if (estNotification) return new NextResponse(null, { status: 202 });
    return erreur(id, -32601, `Méthode inconnue : ${message.method}`);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    // Une erreur d'outil se raconte dans le résultat : le modèle peut alors se
    // corriger, là où une erreur de protocole interromprait la conversation.
    if (message.method === "tools/call") {
      return reponse(id, { content: [{ type: "text", text: detail }], isError: true });
    }
    return erreur(id, -32603, detail);
  }
}

/** Un navigateur qui tombe ici mérite mieux qu'une erreur muette. */
export async function GET(request: Request) {
  return NextResponse.json({
    service: "Terrier MCP",
    transport: "Streamable HTTP — envoyez du JSON-RPC 2.0 en POST sur cette adresse.",
    authentifie: autorise(request),
    outils: OUTILS.map((outil) => outil.name),
  });
}
