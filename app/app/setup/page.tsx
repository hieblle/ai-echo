import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/** Shown instead of the product routes while Supabase is not configured. */
export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/app");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-bold">Datenbank nicht konfiguriert</h1>
      <p className="text-muted-foreground">
        Die Produktansicht (Login, Befragungen, Dashboard mit echten Daten)
        braucht ein Supabase-Projekt. Die Demo läuft weiterhin ohne
        Konfiguration.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Umgebungsvariablen setzen: <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> (siehe{" "}
          <code>.env.example</code>).
        </li>
        <li>
          Migrationen einspielen: <code>pnpm db:migrate</code>.
        </li>
        <li>Server neu starten.</li>
      </ol>
      <p className="text-sm">
        Anleitung: <code>docs/SETUP-PHASE4.md</code>
      </p>
      <div className="flex gap-4 text-sm">
        <Link href="/demo" className="underline-offset-4 hover:underline">
          Zur Demo
        </Link>
        <Link href="/" className="underline-offset-4 hover:underline">
          Startseite
        </Link>
      </div>
    </main>
  );
}
