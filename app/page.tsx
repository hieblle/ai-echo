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
          Phase 2 — Dashboard auf synthetischen Daten
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Läuft ohne Datenbank, Auth oder Secrets: Alle vier Befragungs-Flows
          im Demo-Modus plus Dashboard mit ROI, Perception Gap, Heatmap und
          Empfehlungen — auf 6 Wochen generierter Demo-Daten für drei
          Beispiel-Organisationen.
        </p>
        <ul className="mt-4 space-y-1 text-sm">
          <li>Next.js 15 · TypeScript strict · Tailwind + shadcn/ui · Recharts</li>
          <li>KPI-, Trigger- & Rotations-Engine als pure functions, unit-getestet</li>
          <li>
            k-Anonymität serverseitig, Default k&nbsp;=&nbsp;{K_ANONYMITY_DEFAULT}
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/demo">Befragungs-Demo</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
