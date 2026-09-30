import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/auth";
import { listPages } from "@/lib/db";
import Shell from "@/components/shell";
import { isTheme, THEME_COOKIE } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <Shell initialPages={await listPages()} theme={isTheme(saved) ? saved : "system"} viewer={viewer.email}>
      {children}
    </Shell>
  );
}
