import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { emptyTrash, listTrash } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireViewer(request);
  if ("error" in guard) return guard.error;
  return NextResponse.json({ pages: await listTrash() });
}

export async function DELETE(request: Request) {
  const guard = await requireViewer(request);
  if ("error" in guard) return guard.error;
  await emptyTrash();
  return NextResponse.json({ ok: true });
}
