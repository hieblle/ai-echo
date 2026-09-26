import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Notice, inputClass } from "@/components/ui/field";
import { toolCatalogFromPool } from "@/lib/domain/conditional";
import { createOrgAction, inviteOrgAdminAction } from "@/lib/server/admin-actions";
import { requirePlatformAdmin } from "@/lib/server/auth";

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

export default async function PlatformAdminPage({ searchParams }: AdminPageProps) {
  const viewer = await requirePlatformAdmin();
  const params = await searchParams;
  const orgs = (await viewer.store.listOrganizations()).filter((o) => !o.is_demo);
  const toolCatalog = toolCatalogFromPool(
    await viewer.store.listQuestions("onboarding"),
  ).filter((c) => !c.exclusive && !c.allows_text);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          KI-Barometer · Plattform-Admin (dbrains)
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Organisationen</h1>
        <p className="text-sm text-muted-foreground">
          Organisationen legt ausschließlich dbrains an (SPEC §4.1). Danach
          verwaltet der eingeladene Org-Admin Mitglieder und Einstellungen
          selbst.
        </p>
      </header>

      {params.ok && OK[params.ok] && <Notice tone="ok">{OK[params.ok]}</Notice>}
      {params.err && ERR[params.err] && <Notice tone="err">{ERR[params.err]}</Notice>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Bestehende Organisationen</h2>
        {orgs.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Noch keine Organisation. Lege unten die erste an — für das
            Dogfooding z. B. „dbrains academy“ als Org 0.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {orgs.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{o.name}</p>
                  <p className="text-xs text-muted-foreground">
                    /{o.slug} · {o.form_of_address === "sie" ? "Sie" : "Du"} ·{" "}
                    {o.hourly_rate_default} €/h · k = {o.k_anonymity_min}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/app/${o.slug}/admin`} className="text-sm underline-offset-4 hover:underline">
                    Verwaltung
                  </Link>
                  <Link href={`/app/${o.slug}/dashboard`} className="text-sm underline-offset-4 hover:underline">
                    Dashboard
                  </Link>
                  <form action={inviteOrgAdminAction} className="flex items-center gap-2">
                    <input type="hidden" name="slug" value={o.slug} />
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="org-admin@firma.at"
                      className={`${inputClass} w-56`}
                      aria-label={`Org-Admin für ${o.name} einladen`}
                    />
                    <Button type="submit" size="sm" variant="outline">
                      Org-Admin einladen
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">Neue Organisation anlegen (Flow F1)</h2>
        <form action={createOrgAction} className="space-y-4">
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
            <Field label="Standard-Stundensatz (€)" htmlFor="hourly_rate_default" hint="Für die ROI-Rechnung; F5 überschreibt pro Team.">
              <input id="hourly_rate_default" name="hourly_rate_default" type="number" min={0} step="1" defaultValue={60} className={inputClass} />
            </Field>
            <Field label="Anonymitätsschwelle k" htmlFor="k_anonymity_min" hint="Mindestens 5, später nur erhöhbar.">
              <input id="k_anonymity_min" name="k_anonymity_min" type="number" min={5} max={50} defaultValue={5} className={inputClass} />
            </Field>
          </div>

          <Field label="Abteilungen (eine pro Zeile)" htmlFor="departments" hint="Grob schneiden, damit k ≥ 5 pro Abteilung hält.">
            <textarea id="departments" name="departments" rows={5} className={`${inputClass} h-auto py-2`} placeholder={"Vertrieb & Export\nTechnik & Entwicklung\nVerwaltung & Finanzen"} />
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">KI-Tools, monatliche Lizenzkosten (€) und Anzahl Lizenzen</legend>
            <p className="text-xs text-muted-foreground">
              Kosten = Rechnungsbetrag pro Monat für alle Lizenzen. Die Anzahl
              rechnet die Ersparnis pro Kopf auf alle Lizenznutzer hoch; ohne
              Angabe gelten die eingeladenen Mitglieder.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {toolCatalog.map((tool) => (
                <label key={tool.value} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                  <input type="checkbox" name={`tool:${tool.value}`} />
                  <input type="hidden" name={`label:${tool.value}`} value={tool.label} />
                  <span className="flex-1">{tool.label}</span>
                  <input
                    name={`cost:${tool.value}`}
                    type="number"
                    min={0}
                    step="1"
                    placeholder="€/Monat"
                    className={`${inputClass} h-8 w-24`}
                    aria-label={`Lizenzkosten ${tool.label}`}
                  />
                  <input
                    name={`seats:${tool.value}`}
                    type="number"
                    min={0}
                    step="1"
                    placeholder="Lizenzen"
                    className={`${inputClass} h-8 w-24`}
                    aria-label={`Anzahl Lizenzen ${tool.label}`}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <Button type="submit">Organisation anlegen</Button>
        </form>
      </section>

      <footer className="text-sm text-muted-foreground">
        <Link href="/app" className="hover:underline">
          Zu meinen Befragungen
        </Link>
      </footer>
    </main>
  );
}
