import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Notice, SectionCard, inputClass } from "@/components/ui/field";
import { toolCatalogFromPool } from "@/lib/domain/conditional";
import { createOrgAction, inviteOrgAdminAction } from "@/lib/server/admin-actions";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  created: "Organisation angelegt. Jetzt einen Org-Admin einladen.",
  invited: "Einladung verschickt.",
  existing: "Diese Adresse ist bereits Mitglied der Organisation.",
};
const ERR: Record<string, string> = {
  invalid: "Bitte alle Pflichtfelder korrekt ausfüllen.",
  slug: "Diesen Kurznamen (Slug) gibt es schon — bitte einen anderen wählen.",
  migration:
    "Die Organisation wurde angelegt, aber die Anzahl Lizenzen konnte nicht gespeichert werden: Migration 20260926120000_tool_seats.sql fehlt (docs/SETUP-PHASE4.md, Abschnitt 4). Danach die Tools in der Verwaltung der Organisation nachtragen.",
  org: "Organisation nicht gefunden.",
  email: "Bitte genau eine gültige E-Mail-Adresse angeben.",
  send: "Die Einladung konnte nicht verschickt werden (Mailversand). Bitte später erneut versuchen.",
};

interface AdminPageProps {
  searchParams: Promise<{ ok?: string; err?: string; org?: string }>;
}

function SubStep({ n, title }: { n: string; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-medium">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-semibold shadow-pill">
        {n}
      </span>
      {title}
    </h3>
  );
}

export default async function PlatformAdminPage({ searchParams }: AdminPageProps) {
  const viewer = await requirePlatformAdmin();
  const params = await searchParams;
  const orgs = (await viewer.store.listOrganizations()).filter((o) => !o.is_demo);
  const toolCatalog = toolCatalogFromPool(
    await viewer.store.listQuestions("onboarding"),
  ).filter((c) => !c.exclusive && !c.allows_text);
  const highlighted = params.org ?? null;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <header className="space-y-1 px-1">
        <p className="text-xs text-muted-foreground">KI-Barometer · Plattform (dbrains)</p>
        <h1 className="text-2xl font-normal tracking-tight sm:text-3xl">Organisationen</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Organisationen legt ausschließlich dbrains an. Danach lädst du den
          Org-Admin ein — er verwaltet Mitglieder, Tools und Zyklen selbst.
        </p>
      </header>

      {params.ok && OK[params.ok] && <Notice tone="ok">{OK[params.ok]}</Notice>}
      {params.err && ERR[params.err] && <Notice tone="err">{ERR[params.err]}</Notice>}

      <section aria-labelledby="orgs-heading" className="space-y-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 id="orgs-heading" className="text-base font-medium">Bestehende Organisationen</h2>
          <span className="text-[11px] text-muted-foreground">{orgs.length} angelegt</span>
        </div>
        {orgs.length === 0 ? (
          <p className="card-soft p-5 text-sm text-muted-foreground">
            Noch keine Organisation. Lege unten die erste an — für das
            Dogfooding z. B. „dbrains academy“ als Org 0.
          </p>
        ) : (
          <ul className="space-y-2">
            {orgs.map((o) => (
              <li
                key={o.id}
                className={o.slug === highlighted ? "card-solid p-5" : "card-soft p-5"}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{o.name}</p>
                    <p className="text-xs text-muted-foreground">
                      /{o.slug} · {o.form_of_address === "sie" ? "Sie" : "Du"} ·{" "}
                      {o.hourly_rate_default} €/h · k = {o.k_anonymity_min}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/app/${o.slug}/admin`}>Verwaltung</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/app/${o.slug}/dashboard`}>Dashboard</Link>
                    </Button>
                  </div>
                </div>
                <form action={inviteOrgAdminAction} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="slug" value={o.slug} />
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="org-admin@firma.at"
                    className={cn(inputClass, "h-9 w-64")}
                    aria-label={`Org-Admin für ${o.name} einladen`}
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Org-Admin einladen
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SectionCard
        id="neu"
        title="Neue Organisation anlegen"
        lead="Stammdaten, Abteilungen und Tools in einem Schritt — alles lässt sich später in der Verwaltung der Organisation ändern."
      >
        <form action={createOrgAction} className="space-y-6">
          <div className="space-y-3">
            <SubStep n="1" title="Stammdaten" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="name">
                <input id="name" name="name" required minLength={2} className={inputClass} placeholder="Merlin Technology GmbH" />
              </Field>
              <Field label="Kurzname (URL)" htmlFor="slug" hint="Optional — wird sonst aus dem Namen gebildet.">
                <input id="slug" name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" className={inputClass} placeholder="merlin" />
              </Field>
              <Field label="Anrede" htmlFor="form_of_address">
                <select id="form_of_address" name="form_of_address" className={inputClass} defaultValue="sie">
                  <option value="sie">Sie-Form</option>
                  <option value="du">Du-Form</option>
                </select>
              </Field>
              <Field label="Standard-Stundensatz (€)" htmlFor="hourly_rate_default" hint="Für die ROI-Rechnung; der Führungsblock überschreibt ihn pro Team.">
                <input id="hourly_rate_default" name="hourly_rate_default" type="number" min={0} step="1" defaultValue={60} className={inputClass} />
              </Field>
              <Field label="Anonymitätsschwelle k" htmlFor="k_anonymity_min" hint="Mindestens 5, später nur erhöhbar.">
                <input id="k_anonymity_min" name="k_anonymity_min" type="number" min={5} max={50} defaultValue={5} className={inputClass} />
              </Field>
            </div>
          </div>

          <div className="space-y-3">
            <SubStep n="2" title="Abteilungen" />
            <Field label="Eine pro Zeile" htmlFor="departments" hint="Grob schneiden, damit k ≥ 5 pro Abteilung hält.">
              <textarea id="departments" name="departments" rows={5} className={cn(inputClass, "h-auto py-2")} placeholder={"Vertrieb & Export\nTechnik & Entwicklung\nVerwaltung & Finanzen"} />
            </Field>
          </div>

          <fieldset className="space-y-3">
            <legend className="sr-only">KI-Tools, monatliche Lizenzkosten und Anzahl Lizenzen</legend>
            <SubStep n="3" title="KI-Tools, Lizenzkosten und Anzahl Lizenzen" />
            <p className="text-xs text-muted-foreground">
              Kosten = Rechnungsbetrag pro Monat für alle Lizenzen. Die Anzahl
              rechnet die Ersparnis pro Kopf auf alle Lizenznutzer hoch; ohne
              Angabe gelten die eingeladenen Mitglieder.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {toolCatalog.map((tool) => (
                <label key={tool.value} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/70 px-3 py-2 text-sm">
                  <input type="checkbox" name={`tool:${tool.value}`} className="accent-[#1b1b1d]" />
                  <input type="hidden" name={`label:${tool.value}`} value={tool.label} />
                  <span className="flex-1">{tool.label}</span>
                  <input
                    name={`cost:${tool.value}`}
                    type="number"
                    min={0}
                    step="1"
                    placeholder="€/Monat"
                    className={cn(inputClass, "h-9 w-24")}
                    aria-label={`Lizenzkosten ${tool.label}`}
                  />
                  <input
                    name={`seats:${tool.value}`}
                    type="number"
                    min={0}
                    step="1"
                    placeholder="Lizenzen"
                    className={cn(inputClass, "h-9 w-24")}
                    aria-label={`Anzahl Lizenzen ${tool.label}`}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <Button type="submit">Organisation anlegen</Button>
        </form>
      </SectionCard>

      <footer className="flex flex-wrap gap-4 border-t border-border pt-4 text-xs text-muted-foreground">
        <Link href="/app" className="hover:underline">
          Zu meinen Befragungen
        </Link>
      </footer>
    </main>
  );
}
