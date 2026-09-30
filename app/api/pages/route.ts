import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { createPage, listPages } from "@/lib/db";
import type { Block, PageKind, PropertyDef, PropertyValue, ViewDef } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireViewer(request);
  if ("error" in guard) return guard.error;

  const includeRows = new URL(request.url).searchParams.get("rows") === "1";
  return NextResponse.json({ pages: await listPages(includeRows) });
}

export async function POST(request: Request) {
  const guard = await requireViewer(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as {
    parentId?: string | null;
    dbId?: string | null;
    kind?: PageKind;
    title?: string;
    icon?: string;
    blocks?: Block[];
    props?: Record<string, PropertyValue>;
    schema?: PropertyDef[];
    views?: ViewDef[];
  };

  const page = await createPage({
    parentId: body.parentId ?? null,
    dbId: body.dbId ?? null,
    kind: body.kind === "database" ? "database" : "doc",
    title: body.title ?? "",
    icon: body.icon ?? "",
    blocks: body.blocks,
    props: body.props,
    schema: body.schema,
    views: body.views,
    by: guard.viewer.email,
  });

  return NextResponse.json({ page }, { status: 201 });
}
