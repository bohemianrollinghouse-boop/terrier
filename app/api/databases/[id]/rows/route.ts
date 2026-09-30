import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { createPage, getPage, listRows } from "@/lib/db";
import { emptyBlock, type PropertyValue } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const guard = await requireViewer(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const database = await getPage(id);
  if (!database || database.kind !== "database") {
    return NextResponse.json({ error: "Base introuvable" }, { status: 404 });
  }
  return NextResponse.json({ database, rows: await listRows(id) });
}

/** Ajoute une ligne. Les propriétés inconnues du schéma sont ignorées. */
export async function POST(request: Request, { params }: Ctx) {
  const guard = await requireViewer(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const database = await getPage(id);
  if (!database || database.kind !== "database") {
    return NextResponse.json({ error: "Base introuvable" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    icon?: string;
    props?: Record<string, PropertyValue>;
  };

  const known = new Set(database.schema.map((property) => property.name));
  const props = Object.fromEntries(
    Object.entries(body.props ?? {}).filter(([name]) => known.has(name)),
  ) as Record<string, PropertyValue>;

  const row = await createPage({
    parentId: id,
    dbId: id,
    title: body.title ?? "",
    icon: body.icon ?? "",
    props,
    blocks: [emptyBlock()],
    by: guard.viewer.email,
  });

  return NextResponse.json({ row }, { status: 201 });
}
