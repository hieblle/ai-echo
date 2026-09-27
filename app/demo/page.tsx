import { ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { setDemoFormOfAddress } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { DEMO_ORG_ID } from "@/lib/seed/demo-org";
import { getDemoStore } from "@/lib/server/store-instance";
import { cn } from "@/lib/utils";
import type { TemplateKey } from "@/lib/types";

// Stateful demo data — always render fresh.
export const dynamic = "force-dynamic";

interface FlowTile {
  template: TemplateKey;
  title: string;
  description: string;
  leadOnly?: boolean;
}

const FLOWS: FlowTile[] = [
  {
    template: "onboarding",
    title: "Onboarding-Befragung",
    description: "Einmalige Baseline, ~3 Minuten. Personalisiert die Pulse-Fragen.",
  },
  {
    template: "weekly",
    title: "Wöchentlicher Pulse",
    description: "3–5 rotierende Fragen, unter 60 Sekunden — mobil optimiert.",
  },
  {
    template: "monthly",
    title: "Monatliche Vertiefung",
    description: "8–12 Fragen für tiefere Insights, 5–8 Minuten.",
  },
  {
    template: "leadership",
    title: "Führungskräfte-Befragung",
    description: "Monatlicher Leadership-Block inkl. Gap-Fragen (F6/F7).",
    leadOnly: true,
  },
];

interface DemoPageProps {
  searchParams: Promise<{ persona?: string }>;
}

export default async function DemoPage({ searchParams }: DemoPageProps) {
  const { persona: personaParam } = await searchParams;
  const store = await getDemoStore();

  const org = await store.getOrganization(DEMO_ORG_ID);
  const personas = await store.listPersonas(DEMO_ORG_ID);
  if (!org || personas.length === 0) redirect("/");

  const persona =
    personas.find((p) => p.id === personaParam) ?? personas[0];
  if (!persona) redirect("/");

  const profile = await store.getProfile(DEMO_ORG_ID, persona.id);
  const responses = await store.listResponses(DEMO_ORG_ID);

  async function switchForm(formData: FormData) {
    "use server";
    const next = formData.get("form") === "sie" ? "sie" : "du";
    await setDemoFormOfAddress(next);
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <header className="space-y-1 px-1">
        <p className="text-xs text-muted-foreground">
          KI-Barometer · Demo-Modus · {org.name}
        </p>
        <h1 className="text-2xl font-normal tracking-tight sm:text-3xl">
          Befragungen ausprobieren
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Kein Login nötig: Wähle eine Rolle und spiele die Flows durch. Alle
          Antworten landen im Arbeitsspeicher des Servers (Neustart = leer).
        </p>
      </header>

      <section aria-labelledby="persona-heading" className="card-soft space-y-3 p-5">
        <h2 id="persona-heading" className="text-xs text-muted-foreground">
          Ansicht als
        </h2>
        <div className="flex flex-wrap gap-2">
          {personas.map((p) => (
            <Link
              key={p.id}
              href={`/demo?persona=${encodeURIComponent(p.id)}`}
              aria-current={p.id === persona.id ? "true" : undefined}
              className={cn(
                "rounded-full bg-white px-4 py-2 text-sm shadow-pill transition-colors hover:bg-accent",
                p.id === persona.id &&
                  "bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
        {profile && (
          <p className="text-xs text-muted-foreground">
            Profil: {profile.onboarding_completed ? "Onboarding abgeschlossen" : "noch kein Onboarding"}
            {" · "}
            {profile.uses_no_tools
              ? "nutzt aktuell keine KI-Tools (Kurz-Pulse)"
              : `Tools: ${profile.tools_used.join(", ")}`}
          </p>
        )}
      </section>

      <section aria-labelledby="flows-heading" className="space-y-3">
        <h2 id="flows-heading" className="px-1 text-base font-medium">
          Befragungs-Flows
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FLOWS.map((flow) => {
            const locked = flow.leadOnly && persona.role_scope !== "lead";
            return (
              <div
                key={flow.template}
                className={cn(
                  "flex flex-col justify-between gap-4 p-5",
                  locked ? "rounded-[20px] bg-white/50 text-muted-foreground" : "card-solid",
                )}
              >
                <div className="space-y-1">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    {locked ? (
                      <Lock className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                    ) : (
                      <span className="status-dot" style={{ background: "var(--accent-yellow)" }} aria-hidden />
                    )}
                    {flow.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">{flow.description}</p>
                </div>
                {locked ? (
                  <p className="text-[11px] text-muted-foreground">
                    Nur für Teamleitung/Geschäftsführung — oben die Rolle wechseln.
                  </p>
                ) : (
                  <Button asChild className="self-start">
                    <Link
                      href={`/survey/${flow.template}?persona=${encodeURIComponent(persona.id)}`}
                    >
                      Starten
                      <ChevronRight className="ml-1 h-4 w-4" strokeWidth={1.5} aria-hidden />
                    </Link>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card-soft flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="text-sm">
          <p className="font-medium">Org-Einstellung: Anrede</p>
          <p className="text-xs text-muted-foreground">
            Aktuell: {org.form_of_address === "sie" ? "Sie-Form" : "Du-Form"} — wirkt sofort auf alle Fragetexte.
          </p>
        </div>
        <form action={switchForm}>
          <input
            type="hidden"
            name="form"
            value={org.form_of_address === "sie" ? "du" : "sie"}
          />
          <Button type="submit" variant="outline" size="sm">
            Auf {org.form_of_address === "sie" ? "Du" : "Sie"} umstellen
          </Button>
        </form>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
        <span>Gespeicherte Antworten (anonym, org-weit): {responses.length}</span>
        <Link href={`/dashboard/${org.slug}`} className="hover:underline">
          Dashboard dieser Demo-Org →
        </Link>
      </footer>
    </main>
  );
}
