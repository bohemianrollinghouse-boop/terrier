import { notFound, redirect } from "next/navigation";
import { currentViewer } from "@/lib/auth";
import { getBlocks, getPage, listRows } from "@/lib/db";
import Editor from "@/components/editor/editor";
import DatabaseView from "@/components/database/database-view";

export const dynamic = "force-dynamic";

export default async function PageView({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentViewer())) redirect("/login");

  const { id } = await params;
  const page = await getPage(id);
  if (!page || page.deletedAt) notFound();

  if (page.kind === "database") {
    return <DatabaseView key={page.id} database={page} initialRows={await listRows(page.id)} />;
  }

  const parent = page.dbId ? await getPage(page.dbId) : null;
  return (
    <Editor key={page.id} page={page} initialBlocks={await getBlocks(page.id)} database={parent ?? undefined} />
  );
}
