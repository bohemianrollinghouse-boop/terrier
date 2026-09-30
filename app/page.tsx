import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/auth";
import { createPage, listPages } from "@/lib/db";

export const dynamic = "force-dynamic";

/** L'accueil renvoie vers la première page de l'espace (ou en crée une). */
export default async function Home() {
  if (!(await currentViewer())) redirect("/login");

  const pages = await listPages();
  const first = pages.find((page) => !page.parentId) ?? pages[0];
  const target = first ?? (await createPage({ title: "Ma première page", icon: "\u{1F4C4}" }));
  redirect(`/p/${target.id}`);
}
