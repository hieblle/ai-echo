import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/field";
import { requestMagicLink, safeNextPath } from "@/lib/server/auth-actions";
import { isSupabaseConfigured } from "@/lib/server/env";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{ sent?: string; error?: string; next?: string }>;
}

const ERRORS: Record<string, string> = {
  email: "Bitte eine gültige E-Mail-Adresse eingeben.",
  send: "Der Link konnte gerade nicht verschickt werden. Bitte in ein paar Minuten noch einmal versuchen.",
  link: "Dieser Login-Link ist ungültig oder abgelaufen. Bitte einen neuen anfordern.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (!isSupabaseConfigured()) redirect("/app/setup");
  const params = await searchParams;
  const next = await safeNextPath(params.next);
  const error = params.error ? ERRORS[params.error] : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-12">
      <header className="space-y-2 px-1">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="6" cy="9" r="4.2" fill="var(--accent-yellow)" />
            <circle cx="10.5" cy="6" r="2.6" fill="currentColor" />
          </svg>
          dbrains academy · KI-Barometer
        </p>
        <h1 className="text-3xl font-normal tracking-tight">Anmelden</h1>
        <p className="text-sm text-muted-foreground">
          Kein Passwort nötig: Du bekommst einen Login-Link per E-Mail.
        </p>
      </header>

      {params.sent ? (
        <section className="card-solid space-y-3 p-6">
          <div className="flex items-center gap-2">
            <span className="status-dot" style={{ background: "var(--accent-yellow)" }} aria-hidden />
            <h2 className="text-base font-medium">Link ist unterwegs</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Wenn diese Adresse eingeladen wurde, findest du in wenigen Minuten
            eine E-Mail mit deinem Login-Link. Bitte auch den Spam-Ordner
            prüfen. Der Link ist eine Stunde gültig und funktioniert nur einmal.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="inline-block text-sm underline-offset-4 hover:underline"
          >
            Andere Adresse verwenden
          </Link>
        </section>
      ) : (
        <form action={requestMagicLink} className="card-solid space-y-4 p-6">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Deine Firmen-E-Mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="vorname.nachname@firma.at"
            />
          </div>
          {error && <Notice tone="err">{error}</Notice>}
          <Button type="submit" size="lg" className="w-full">
            Login-Link senden
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Zugang gibt es nur per Einladung durch dein Unternehmen. Deine
            Antworten in Befragungen bleiben anonym: Die Anmeldung dient nur
            dazu, dich nicht doppelt zu befragen.
          </p>
        </form>
      )}

      <footer className="px-1 text-xs text-muted-foreground">
        <Link href="/" className="hover:underline">
          Zur Startseite
        </Link>
      </footer>
    </main>
  );
}
