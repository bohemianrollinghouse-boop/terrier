import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { getPage, restorePage } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const guard = await requireViewer(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  await restorePage(id);
  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: "Page introuvable" }, { status: 404 });
  return NextResponse.json({ page });
}
