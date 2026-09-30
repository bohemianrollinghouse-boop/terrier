import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { search } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireViewer(request);
  if ("error" in guard) return guard.error;

  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ hits: await search(q) });
}
