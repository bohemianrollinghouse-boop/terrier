import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { ConflictError, getPage, writeBlocks } from "@/lib/db";
import { BLOCK_TYPES, emptyBlock, type Block, type BlockType } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const isType = (value: unknown): value is BlockType => BLOCK_TYPES.includes(value as BlockType);

export function normalizeIncoming(raw: Partial<Block>[]): Block[] {
  return raw.map((block) => ({
    ...emptyBlock(isType(block?.type) ? block.type : "paragraph"),
    id: typeof block?.id === "string" && block.id ? block.id : emptyBlock().id,
    content: typeof block?.content === "string" ? block.content : "",
    checked: !!block?.checked,
    collapsed: !!block?.collapsed,
    indent: Number(block?.indent) || 0,
    meta:
      block?.meta && typeof block.meta === "object"
        ? Object.fromEntries(Object.entries(block.meta).map(([key, value]) => [key, String(value)]))
        : {},
  }));
}

/**
 * Le client envoie le document complet, accompagné de la révision qu'il a lue.
 * Si quelqu'un d'autre a écrit entre-temps, on répond 409 avec la version à
 * jour plutôt que d'écraser son travail.
 */
export async function PUT(request: Request, { params }: Ctx) {
  const guard = await requireViewer(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  if (!(await getPage(id))) return NextResponse.json({ error: "Page introuvable" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { blocks?: unknown; rev?: unknown };
  if (!Array.isArray(body.blocks)) {
    return NextResponse.json({ error: "blocks doit être un tableau" }, { status: 400 });
  }

  const blocks = normalizeIncoming(body.blocks as Partial<Block>[]);
  const expectedRev = typeof body.rev === "number" ? body.rev : undefined;

  try {
    const result = await writeBlocks(id, blocks.length ? blocks : [emptyBlock()], {
      expectedRev,
      by: guard.viewer.email,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          conflict: true,
          page: error.current.page,
          blocks: error.current.blocks,
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
