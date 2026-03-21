import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-1 flex items-center justify-center py-24">
      <div className="text-center space-y-4">
        <h1 className="font-heading text-6xl font-bold text-primary">404</h1>
        <p className="text-xl text-muted-foreground">
          Page introuvable
        </p>
        <Link
          href="/fr"
          className="inline-block mt-4 text-sm text-primary hover:underline"
        >
          ← Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
