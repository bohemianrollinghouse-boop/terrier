import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Schéma des actions exposées à un agent externe (une Action de GPT
 * personnalisé, par exemple). Volontairement restreint : lire, chercher,
 * écrire une page, ajouter et mettre à jour une tâche. Rien qui supprime
 * définitivement.
 */
export async function GET(request: Request) {
  // Derrière le proxy App Hosting, request.url porte l'adresse interne du
  // conteneur (0.0.0.0:8080) : le schéma annoncerait une API injoignable. Le
  // domaine public n'arrive que par les en-têtes de transfert.
  const headers = request.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? new URL(request.url).host;
  const enLocal = host.startsWith("localhost") || host.startsWith("127.");
  const proto = headers.get("x-forwarded-proto") ?? (enLocal ? "http" : "https");
  const origin = `${proto}://${host}`;

  const schema = {
    openapi: "3.1.0",
    info: {
      title: "Terrier",
      description:
        "Espace de notes personnel : pages imbriquées, blocs de contenu et bases de données (dont le suivi de dev My Rolling Day).",
      version: "1.0.0",
    },
    servers: [{ url: origin }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: "Clé d'API Terrier" },
      },
      schemas: {
        Page: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            icon: { type: "string" },
            kind: { type: "string", enum: ["doc", "database"] },
            parentId: { type: ["string", "null"] },
            dbId: { type: ["string", "null"] },
            props: { type: "object", additionalProperties: true },
            updatedAt: { type: "string" },
          },
        },
        Block: {
          type: "object",
          required: ["type", "content"],
          properties: {
            id: { type: "string" },
            type: {
              type: "string",
              enum: [
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
                "image",
              ],
            },
            content: { type: "string", description: "HTML inline restreint : b, i, u, s, code, a, br." },
            checked: { type: "boolean" },
            indent: { type: "integer", minimum: 0, maximum: 8 },
            meta: { type: "object", additionalProperties: { type: "string" } },
          },
        },
      },
    },
    paths: {
      "/api/pages": {
        get: {
          operationId: "listerPages",
          summary: "Liste toutes les pages de l'espace.",
          responses: { "200": { description: "OK" } },
        },
        post: {
          operationId: "creerPage",
          summary: "Crée une page, éventuellement sous une page parente.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    icon: { type: "string", description: "Un emoji." },
                    parentId: { type: ["string", "null"] },
                    blocks: { type: "array", items: { $ref: "#/components/schemas/Block" } },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Page créée" } },
        },
      },
      "/api/pages/{id}": {
        get: {
          operationId: "lirePage",
          summary: "Lit une page, ses blocs, et ses lignes si c'est une base.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" }, "404": { description: "Introuvable" } },
        },
        patch: {
          operationId: "modifierPage",
          summary: "Change le titre, l'icône, ou les propriétés d'une ligne de base.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    icon: { type: "string" },
                    props: {
                      type: "object",
                      additionalProperties: true,
                      description:
                        "Pour le suivi de dev : Statut (À faire, En cours, Bloqué, Fait), Priorité, Type, Module, Plateforme, Act. man., Source.",
                    },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Page modifiée" } },
        },
      },
      "/api/pages/{id}/blocks": {
        put: {
          operationId: "remplacerContenu",
          summary: "Remplace le contenu complet d'une page. Lire la page d'abord pour ne rien perdre.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["blocks"],
                  properties: { blocks: { type: "array", items: { $ref: "#/components/schemas/Block" } } },
                },
              },
            },
          },
          responses: { "200": { description: "Contenu enregistré" } },
        },
      },
      "/api/databases/{id}/rows": {
        get: {
          operationId: "listerLignes",
          summary: "Liste les lignes d'une base, avec leurs propriétés.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
        post: {
          operationId: "ajouterLigne",
          summary: "Ajoute une ligne à une base — par exemple une tâche au suivi de dev.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    props: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Ligne créée" } },
        },
      },
      "/api/search": {
        get: {
          operationId: "rechercher",
          summary: "Cherche un mot dans les titres, les contenus et les propriétés.",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } },
        },
      },
    },
  };

  return NextResponse.json(schema);
}
