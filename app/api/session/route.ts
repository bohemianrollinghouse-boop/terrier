import { NextResponse } from "next/server";
import { createSessionCookie, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Échange le jeton Google contre un cookie de session signé par Firebase. */
export async function POST(request: Request) {
  const { idToken } = (await request.json().catch(() => ({}))) as { idToken?: string };
  if (!idToken) return NextResponse.json({ error: "Jeton manquant" }, { status: 400 });

  try {
    const session = await createSessionCookie(idToken);
    if (!session) {
      return NextResponse.json({ error: "Ce compte n'a pas accès à cet espace." }, { status: 403 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, session.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: session.maxAge,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Jeton invalide" }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
