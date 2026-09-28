import Link from "next/link";
import { Button } from "@/components/ui/button";
import { K_ANONYMITY_DEFAULT } from "@/lib/domain/anonymity";
import { isSupabaseConfigured } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export default function Home() {
  const productReady = isSupabaseConfigured();
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="6" cy="9" r="4.2" fill="var(--accent-yellow)" />
            <circle cx="10.5" cy="6" r="2.6" fill="currentColor" />
          </svg>
          dbrains academy
        </p>
        <h1 className="text-4xl font-light tracking-tight sm:text-5xl">
          KI-Barometer
        </h1>
        <p className="text-lg text-muted-foreground">
          Macht den Erfolg von KI-Einführungen in Unternehmen messbar, sichtbar
          und steuerbar.
        </p>
      </header>

      <section className="card-solid p-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Wöchentlicher Pulse · Dashboard · Empfehlungen
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Mitarbeitende beantworten in unter einer Minute fünf rotierende
          Fragen; das Dashboard zeigt Adoption, Effizienz, Vertrauen und
          Stimmung mit Trend, den ROI in Euro, den Perception Gap zwischen
          Führung und Team und konkrete Maßnahmen.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {[
            "Anonym by design: Antworten tragen keinen Personenbezug",
            `Auswertung nur ab k = ${K_ANONYMITY_DEFAULT} Personen pro Abteilung`,
            "EU-Hosting, Login per E-Mail-Link ohne Passwort",
          ].map((line) => (
            <li key={line} className="flex items-center gap-2">
              <span className="status-dot" style={{ background: "var(--accent-yellow)" }} aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        {productReady && (
          <Button asChild size="lg">
            <Link href="/login">Anmelden</Link>
          </Button>
        )}
        <Button asChild size="lg" variant={productReady ? "outline" : "default"}>
          <Link href="/demo">Befragungs-Demo</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/dashboard">Demo-Dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
