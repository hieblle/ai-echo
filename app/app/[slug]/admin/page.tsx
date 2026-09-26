import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Notice, inputClass } from "@/components/ui/field";
import { toolCatalogFromPool } from "@/lib/domain/conditional";
import {
  addDepartmentAction,
  closeCycleAction,
  deleteDepartmentAction,
  deleteToolAction,
  inviteMembersAction,
  openCycleAction,
  sendRemindersAction,
  updateMemberAction,
  updateOrgSettingsAction,
  upsertToolAction,
} from "@/lib/server/admin-actions";
import { canAdminOrg, getOrgAccess, requireViewer } from "@/lib/server/auth";
import type { Membership, OrgRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<OrgRole, string> = {
  employee: "Mitarbeiter:in",
  team_lead: "Teamleitung",
  org_admin: "Org-Admin",
};

const STATUS_LABELS: Record<Membership["status"], string> = {
  invited: "eingeladen",
  active: "aktiv",
  removed: "entfernt",
};

const TEMPLATE_LABELS = {
  weekly: "Wöchentlicher Pulse",
  monthly: "Monatliche Vertiefung",
  leadership: "Führungskräfte-Befragung",
  onboarding: "Onboarding",
} as const;

const ERR: Record<string, string> = {
  invalid: "Bitte die Eingaben prüfen.",
  migration:
    "Datenbank-Update fehlt: Die Anzahl Lizenzen kann erst gespeichert werden, wenn die Migration 20260926120000_tool_seats.sql eingespielt ist (docs/SETUP-PHASE4.md, Abschnitt 4).",
  email: "Keine gültige E-Mail-Adresse gefunden.",
  member: "Mitglied nicht gefunden.",
  self: "Die eigene Rolle kann nicht herabgestuft und die eigene Mitgliedschaft nicht entfernt werden.",
  k: "Die Anonymitätsschwelle kann nur erhöht werden.",
};

function okMessage(params: Record<string, string | undefined>): string | null {
  const n = Number(params.n ?? 0);
  switch (params.ok) {
    case "invited":
      return `${n} Einladung(en) verschickt · ${params.e ?? 0} bereits Mitglied · ${params.f ?? 0} fehlgeschlagen/ungültig.`;
    case "updated":
      return "Mitglied aktualisiert.";
    case "removed":
      return "Mitglied entfernt — es erhält keine Befragungen mehr.";
    case "resent":
      return "Login-Link erneut verschickt.";
    case "settings":
      return "Einstellungen gespeichert.";
    case "tool":
      return "Tool-Einstellungen gespeichert.";
    case "department":
      return "Abteilungen aktualisiert.";
    case "opened":
      return `Zyklus geöffnet: ${n} Person(en) eingeladen, ${params.m ?? 0} Mail(s) verschickt.`;
    case "reminded":
      return `${n} Erinnerung(en) verschickt.`;
    case "closed":
      return "Zyklus geschlossen.";
    default:
      return null;
  }
}

interface OrgAdminPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function OrgAdminPage({ params, searchParams }: OrgAdminPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const viewer = await requireViewer(`/app/${slug}/admin`);
  const access = await getOrgAccess(viewer, slug);
  if (!access) notFound();
  if (!canAdminOrg(access.role)) redirect("/app?denied=admin");

  const { org, store } = access;
  const [departments, members, tools, cycles, onboardingPool] = await Promise.all([
    store.listDepartments(org.id),
    store.listMemberships(org.id),
    store.listToolSettings(org.id),
    store.listCycles(org.id, { status: "open" }),
    store.listQuestions("onboarding"),
  ]);
  const activeMembers = members.filter((m) => m.status !== "removed");
  const departmentName = new Map(departments.map((d) => [d.id, d.name]));
  const catalog = toolCatalogFromPool(onboardingPool).filter(
    (c) => !c.exclusive && !c.allows_text,
  );
  const configured = new Set(tools.map((t) => t.tool_value));

  const invite = inviteMembersAction.bind(null, slug);
  const updateMember = updateMemberAction.bind(null, slug);
  const updateSettings = updateOrgSettingsAction.bind(null, slug);
  const upsertTool = upsertToolAction.bind(null, slug);
  const deleteTool = deleteToolAction.bind(null, slug);
  const addDepartment = addDepartmentAction.bind(null, slug);
  const deleteDepartment = deleteDepartmentAction.bind(null, slug);
  const open = openCycleAction.bind(null, slug);
  const remind = sendRemindersAction.bind(null, slug);
  const close = closeCycleAction.bind(null, slug);

  const ok = okMessage(query);
  const err = query.err ? ERR[query.err] : null;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-8">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          KI-Barometer · Verwaltung
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
        <nav className="flex gap-4 text-sm">
          <Link href={`/app/${slug}/dashboard`} className="underline-offset-4 hover:underline">
            Dashboard
          </Link>
          <Link href="/app" className="underline-offset-4 hover:underline">
            Meine Befragungen
          </Link>
        </nav>
      </header>

      {ok && <Notice tone="ok">{ok}</Notice>}
      {err && <Notice tone="err">{err}</Notice>}

      {/* Zyklen */}
      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">Befragungszyklen</h2>
        <p className="text-sm text-muted-foreground">
          Der Zeitplan öffnet den Pulse montags und erinnert donnerstags
          automatisch. Hier kannst du Zyklen manuell öffnen — z. B. für den
          ersten Testlauf.
        </p>
        {cycles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aktuell ist kein Zyklus offen.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {cycles.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <span className="font-medium">{TEMPLATE_LABELS[c.template_key]}</span>{" "}
                  <span className="text-muted-foreground">
                    {c.week} · {c.period_start} bis {c.period_end}
                    {c.reminder_sent_at ? " · erinnert" : ""}
                  </span>
                </span>
                <form action={close}>
                  <input type="hidden" name="cycle_id" value={c.id} />
                  <Button type="submit" size="sm" variant="ghost">
                    Schließen
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {(["weekly", "monthly", "leadership"] as const).map((t) => (
            <form key={t} action={open}>
              <input type="hidden" name="template" value={t} />
              <Button type="submit" size="sm" variant="outline">
                {TEMPLATE_LABELS[t]} jetzt öffnen
              </Button>
            </form>
          ))}
          <form action={remind}>
            <Button type="submit" size="sm" variant="secondary" disabled={cycles.length === 0}>
              Erinnerung jetzt senden
            </Button>
          </form>
        </div>
      </section>

      {/* Einladen */}
      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">Mitglieder einladen (Flow F2)</h2>
        <form action={invite} className="space-y-3">
          <Field
            label="E-Mail-Adressen"
            htmlFor="emails"
            hint="Eine pro Zeile oder durch Komma/Semikolon getrennt — auch eine kopierte CSV-Spalte. Duplikate werden übersprungen."
          >
            <textarea id="emails" name="emails" rows={5} required className={`${inputClass} h-auto py-2`} placeholder={"anna@firma.at\nbert@firma.at"} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rolle" htmlFor="role">
              <select id="role" name="role" className={inputClass} defaultValue="employee">
                {(Object.keys(ROLE_LABELS) as OrgRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </Field>
            <Field label="Abteilung" htmlFor="department_id" hint="Für Teamleitungen Pflicht (Team-Dashboard).">
              <select id="department_id" name="department_id" className={inputClass} defaultValue="">
                <option value="">— keine —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <Button type="submit">Einladungen verschicken</Button>
        </form>
      </section>

      {/* Mitglieder */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Mitglieder{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {activeMembers.length} aktiv/eingeladen
          </span>
        </h2>
        {activeMembers.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Noch keine Mitglieder — lade oben die ersten Personen ein.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {activeMembers.map((m) => (
              <li key={m.id} className="p-3">
                <form action={updateMember} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="membership_id" value={m.id} />
                  <span className="min-w-56 flex-1">
                    <span className="font-medium">{m.email}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {STATUS_LABELS[m.status]}
                      {m.department_id ? ` · ${departmentName.get(m.department_id) ?? "?"}` : ""}
                    </span>
                  </span>
                  <select name="role" defaultValue={m.role} className={`${inputClass} h-8 w-36`} aria-label="Rolle">
                    {(Object.keys(ROLE_LABELS) as OrgRole[]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <select name="department_id" defaultValue={m.department_id ?? ""} className={`${inputClass} h-8 w-44`} aria-label="Abteilung">
                    <option value="">— keine —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" variant="outline" name="intent" value="update">
                    Speichern
                  </Button>
                  <Button type="submit" size="sm" variant="ghost" name="intent" value="resend">
                    Link erneut senden
                  </Button>
                  <Button type="submit" size="sm" variant="ghost" name="intent" value="remove">
                    Entfernen
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Einstellungen */}
      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-card p-5">
          <h2 className="text-lg font-semibold">Einstellungen</h2>
          <form action={updateSettings} className="space-y-3">
            <Field label="Anrede" htmlFor="form_of_address">
              <select id="form_of_address" name="form_of_address" defaultValue={org.form_of_address} className={inputClass}>
                <option value="sie">Sie-Form</option>
                <option value="du">Du-Form</option>
              </select>
            </Field>
            <Field label="Standard-Stundensatz (€)" htmlFor="hourly_rate_default">
              <input id="hourly_rate_default" name="hourly_rate_default" type="number" min={0} step="1" defaultValue={org.hourly_rate_default} className={inputClass} />
            </Field>
            <Field label="Anonymitätsschwelle k" htmlFor="k_anonymity_min" hint="Nur erhöhbar (z. B. auf Wunsch des Betriebsrats).">
              <input id="k_anonymity_min" name="k_anonymity_min" type="number" min={org.k_anonymity_min} max={50} defaultValue={org.k_anonymity_min} className={inputClass} />
            </Field>
            <Button type="submit" size="sm">Speichern</Button>
          </form>
        </div>

        <div className="space-y-3 rounded-lg border bg-card p-5">
          <h2 className="text-lg font-semibold">Abteilungen</h2>
          <ul className="space-y-1 text-sm">
            {departments.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <span>{d.name}</span>
                <form action={deleteDepartment}>
                  <input type="hidden" name="department_id" value={d.id} />
                  <Button type="submit" size="sm" variant="ghost">Löschen</Button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addDepartment} className="flex gap-2">
            <input name="name" required maxLength={120} placeholder="Neue Abteilung" className={inputClass} aria-label="Neue Abteilung" />
            <Button type="submit" size="sm" variant="outline">Hinzufügen</Button>
          </form>
        </div>
      </section>

      {/* Tools */}
      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">KI-Tools und Lizenzkosten</h2>
        <p className="text-sm text-muted-foreground">
          Kosten = Rechnungsbetrag pro Monat für alle Lizenzen des Tools. Die
          Anzahl der Lizenzen rechnet die gemessene Ersparnis pro Kopf auf alle
          Lizenznutzer hoch; ohne Angabe gelten die eingeladenen Mitglieder.
          Ungenutzte bezahlte Tools lösen Empfehlung R5 aus.
        </p>
        <ul className="divide-y rounded-md border text-sm">
          {tools.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 p-3">
              <form action={upsertTool} className="flex flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="tool_value" value={t.tool_value} />
                <input type="hidden" name="tool_label" value={t.tool_label} />
                <span className="min-w-40 flex-1 font-medium">{t.tool_label}</span>
                <input name="cost" type="number" min={0} step="1" defaultValue={t.monthly_license_cost_eur} className={`${inputClass} h-8 w-24`} aria-label={`Lizenzkosten ${t.tool_label}`} />
                <span className="text-muted-foreground">€/Monat</span>
                <input name="seats" type="number" min={0} step="1" defaultValue={t.seats ?? ""} placeholder="–" className={`${inputClass} h-8 w-20`} aria-label={`Anzahl Lizenzen ${t.tool_label}`} />
                <span className="text-muted-foreground">Lizenzen</span>
                <input type="hidden" name="active" value="off" />
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="active" value="on" defaultChecked={t.active} />
                  aktiv
                </label>
                <Button type="submit" size="sm" variant="outline">Speichern</Button>
              </form>
              <form action={deleteTool}>
                <input type="hidden" name="tool_value" value={t.tool_value} />
                <Button type="submit" size="sm" variant="ghost">Entfernen</Button>
              </form>
            </li>
          ))}
        </ul>
        <form action={upsertTool} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="active" value="on" />
          <Field label="Tool hinzufügen" htmlFor="tool_value" className="min-w-48 flex-1">
            <select id="tool_value" name="tool_value" className={inputClass} defaultValue="">
              <option value="" disabled>— Tool wählen —</option>
              {catalog
                .filter((c) => !configured.has(c.value))
                .map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
            </select>
          </Field>
          <Field label="Kosten €/Monat" htmlFor="cost">
            <input id="cost" name="cost" type="number" min={0} step="1" defaultValue={0} className={`${inputClass} w-32`} />
          </Field>
          <Field label="Anzahl Lizenzen" htmlFor="seats" hint="Leer lassen, wenn unbekannt oder Pauschale.">
            <input id="seats" name="seats" type="number" min={0} step="1" className={`${inputClass} w-32`} />
          </Field>
          <Button type="submit" size="sm">Hinzufügen</Button>
        </form>
      </section>
    </main>
  );
}
