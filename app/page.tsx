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
          Phase 0 — Setup
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Prototyp-Gerüst läuft ohne Datenbank, Auth oder Secrets. Der klickbare
          Survey-Runner folgt in Phase 1, das Dashboard in Phase 2.
        </p>
        <ul className="mt-4 space-y-1 text-sm">
          <li>Next.js 15 · TypeScript strict · Tailwind + shadcn/ui</li>
          <li>Vitest (Unit) · Playwright (E2E vorbereitet)</li>
          <li>
            k-Anonymität serverseitig, Default k&nbsp;=&nbsp;{K_ANONYMITY_DEFAULT}
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button disabled>Befragung starten (Phase 1)</Button>
        <Button variant="outline" disabled>
          Dashboard (Phase 2)
        </Button>
      </div>
    </main>
  );
}
