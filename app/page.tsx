import Link from "next/link";
import { Button } from "@/components/ui/button";
import { K_ANONYMITY_DEFAULT } from "@/lib/domain/anonymity";

export default function Home() {
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
          Phase 1 — Klickbarer Survey-Prototyp
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Läuft ohne Datenbank, Auth oder Secrets: Alle vier Befragungs-Flows
          (Onboarding, Weekly, Monthly, Leadership) sind im Demo-Modus mit
          Rollen-Umschalter durchspielbar. Das Dashboard folgt in Phase 2.
        </p>
        <ul className="mt-4 space-y-1 text-sm">
          <li>Next.js 15 · TypeScript strict · Tailwind + shadcn/ui</li>
          <li>Rotation & Conditional Logic unit-getestet · Mobile-first</li>
          <li>
            k-Anonymität serverseitig, Default k&nbsp;=&nbsp;{K_ANONYMITY_DEFAULT}
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/demo">Demo starten</Link>
        </Button>
        <Button variant="outline" disabled>
          Dashboard (Phase 2)
        </Button>
      </div>
    </main>
  );
}
