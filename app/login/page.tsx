import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          dbrains academy · KI-Barometer
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Anmelden</h1>
        <p className="text-muted-foreground">
          Kein Passwort nötig: Du bekommst einen Login-Link per E-Mail.
        </p>
      </header>

      {params.sent ? (
        <section className="space-y-3 rounded-lg border bg-card p-5">
          <h2 className="font-semibold">Link ist unterwegs</h2>
          <p className="text-sm text-muted-foreground">
            Wenn diese Adresse eingeladen wurde, findest du in wenigen Minuten
            eine E-Mail mit deinem Login-Link. Bitte auch den Spam-Ordner
            prüfen. Der Link ist eine Stunde gültig.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="text-sm underline-offset-4 hover:underline"
          >
            Andere Adresse verwenden
          </Link>
        </section>
      ) : (
        <form action={requestMagicLink} className="space-y-4">
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
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="vorname.nachname@firma.at"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full">
            Login-Link senden
          </Button>
          <p className="text-xs text-muted-foreground">
            Zugang gibt es nur per Einladung durch dein Unternehmen. Deine
            Antworten in Befragungen bleiben anonym — die Anmeldung dient nur
            dazu, dich nicht doppelt zu befragen.
          </p>
        </form>
      )}

      <footer className="text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">
          Zur Startseite
        </Link>
      </footer>
    </main>
  );
}
