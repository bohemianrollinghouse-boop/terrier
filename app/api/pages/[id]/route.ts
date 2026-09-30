import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { deletePageForever, getBlocks, getPage, listRows, trashPage, updatePage } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const guard = await requireViewer(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: "Page introuvable" }, { status: 404 });

  const blocks = await getBlocks(id);
  if (page.kind === "database") {
    return NextResponse.json({ page, blocks, rows: await listRows(id) });
  }
  return NextResponse.json({ page, blocks });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requireViewer(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const page = await updatePage(id, body, guard.viewer.email);
  if (!page) return NextResponse.json({ error: "Page introuvable" }, { status: 404 });
  return NextResponse.json({ page });
}

export async function DELETE(request: Request, { params }: Ctx) {
  const guard = await requireViewer(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const forever = new URL(request.url).searchParams.get("forever") === "1";
  if (forever) await deletePageForever(id);
  else await trashPage(id);
  return NextResponse.json({ ok: true });
}
