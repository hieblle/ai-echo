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
        <p className="text-sm font-medium text-muted-foreground">
          dbrains academy
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          KI-Barometer
        </h1>
        <p className="text-lg text-muted-foreground">
          Macht den Erfolg von KI-Einführungen in Unternehmen messbar, sichtbar
          und steuerbar.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-6 text-card-foreground">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Wöchentlicher Pulse · Dashboard · Empfehlungen
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Mitarbeitende beantworten in unter einer Minute 3–5 rotierende
          Fragen; das Dashboard zeigt Adoption, Effizienz, Vertrauen und
          Stimmung mit Trend, den ROI in Euro, den Perception Gap zwischen
          Führung und Team und konkrete Maßnahmen.
        </p>
        <ul className="mt-4 space-y-1 text-sm">
          <li>Anonym by design: Antworten tragen keinen Personenbezug</li>
          <li>
            Auswertung nur ab k&nbsp;=&nbsp;{K_ANONYMITY_DEFAULT} Personen pro Abteilung
          </li>
          <li>EU-Hosting (Frankfurt), Login per E-Mail-Link ohne Passwort</li>
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
