import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-5xl">{"\u{1F5D2}"}</p>
        <h1 className="pt-4 text-xl font-semibold text-ink">Cette page n&apos;existe pas</h1>
        <p className="pt-1 text-sm text-muted">Elle a peut-être été supprimée ou mise à la corbeille.</p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Retour à mon espace
        </Link>
      </div>
    </div>
  );
}
