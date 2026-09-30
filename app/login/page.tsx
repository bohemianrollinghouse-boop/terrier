"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authConfigured, signInWithGoogle } from "@/lib/firebase-client";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid h-dvh place-items-center px-6">
      <div className="w-full max-w-sm text-center">
        <p className="text-5xl">{"\u{1F430}"}</p>
        <h1 className="pt-4 text-2xl font-bold tracking-[-0.01em] text-ink">Terrier</h1>
        <p className="pt-1 text-sm text-muted">Votre espace de notes. Accès réservé.</p>

        <button
          type="button"
          disabled={busy || !authConfigured}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await signInWithGoogle();
            if (result.ok) router.replace("/");
            else {
              setError(result.message);
              setBusy(false);
            }
          }}
          className="mt-7 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Connexion…" : "Se connecter avec Google"}
        </button>

        {!authConfigured && (
          <p className="pt-3 text-xs text-muted">
            Les identifiants Firebase ne sont pas encore configurés (variables NEXT_PUBLIC_FIREBASE_*).
          </p>
        )}
        {error && <p className="pt-3 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
