import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Notice, SectionCard, inputClass } from "@/components/ui/field";
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
import {
  disconnectM365Action,
  importCopilotCsvAction,
  syncCopilotNowAction,
} from "@/lib/server/copilot-actions";
import { formatReportDate } from "@/lib/domain/copilot";
import { getM365Env } from "@/lib/server/env";
import { REQUIRED_PERMISSION } from "@/lib/server/m365-graph";
import type { Membership, OrgRole } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  copilot_file: "Bitte eine CSV-Datei auswählen.",
  copilot_size: "Die Datei ist zu groß (maximal 8 MB).",
  copilot_date: "Das Berichtsdatum ist nicht lesbar (Format JJJJ-MM-TT).",
  copilot_parse: "Die Datei konnte nicht als Copilot-Bericht gelesen werden.",
  migration_copilot:
    "Datenbank-Update fehlt: Copilot-Daten können erst gespeichert werden, wenn die Migration 20260928120000_copilot_usage.sql eingespielt ist (docs/SETUP-PHASE4.md, Abschnitt 4).",
  m365config:
    "Die Microsoft-Anbindung ist auf dem Server nicht konfiguriert (M365_CLIENT_ID / M365_CLIENT_SECRET). Der CSV-Import funktioniert trotzdem.",
  m365notconnected: "Microsoft 365 ist noch nicht verbunden.",
  m365: "Microsoft hat die Verbindung nicht bestätigt.",
  sync: "Die Synchronisierung mit Microsoft ist fehlgeschlagen.",
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
    case "copilot":
      return `Copilot-Bericht übernommen: Woche ${params.w ?? "?"}, ${params.e ?? 0} Lizenzen, ${params.a ?? 0} aktiv (${params.p ?? 28} Tage). Die Datei wurde verworfen.${n > 0 ? ` Hinweise: ${params.d ?? ""}` : ""}`;
    case "synced":
      return `Microsoft 365 synchronisiert (Wochen ${params.w ?? "?"}).`;
    case "m365":
      return "Microsoft 365 verbunden. Jetzt synchronisieren — danach jede Woche automatisch.";
    case "disconnected":
      return "Verbindung zu Microsoft 365 getrennt. Gespeicherte Wochenwerte bleiben erhalten.";
    default:
      return null;
  }
}

/** The six sections in setup order — the page's table of contents. */
const STEPS = [
  { id: "einstellungen", label: "Einstellungen" },
  { id: "abteilungen", label: "Abteilungen" },
  { id: "tools", label: "KI-Tools" },
  { id: "einladen", label: "Einladen" },
  { id: "mitglieder", label: "Mitglieder" },
  { id: "zyklen", label: "Zyklen" },
  { id: "integrationen", label: "Integrationen" },
] as const;

function StatusTile({
  href,
  label,
  value,
  hint,
  attention,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  /** Marks a step that still needs the admin's attention. */
  attention: boolean;
}) {
  return (
    <Link href={href} className="card-soft flex flex-col gap-1 p-4 transition-colors hover:bg-white/90">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className="status-dot"
          style={{ background: attention ? "var(--status-warn)" : "var(--status-good)" }}
          aria-hidden
        />
        {label}
      </p>
      <p className="text-2xl font-light tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </Link>
  );
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
  const [departments, members, tools, cycles, onboardingPool, integration, copilotSnapshots] =
    await Promise.all([
      store.listDepartments(org.id),
      store.listMemberships(org.id),
      store.listToolSettings(org.id),
      store.listCycles(org.id, { status: "open" }),
      store.listQuestions("onboarding"),
      store.getIntegration(org.id, "m365"),
      store.listCopilotSnapshots(org.id),
    ]);
  const copilotLatest = copilotSnapshots[copilotSnapshots.length - 1] ?? null;
  const m365Configured = getM365Env() !== null;
  const activeMembers = members.filter((m) => m.status !== "removed");
  const invitedCount = activeMembers.filter((m) => m.status === "invited").length;
  const activeTools = tools.filter((t) => t.active);
  const departmentName = new Map(departments.map((d) => [d.id, d.name]));
  const catalog = toolCatalogFromPool(onboardingPool).filter(
    (c) => !c.exclusive && !c.allows_text,
  );
  const configured = new Set(tools.map((t) => t.tool_value));
  const base = `/app/${slug}/admin`;

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
  const importCsv = importCopilotCsvAction.bind(null, slug);
  const syncNow = syncCopilotNowAction.bind(null, slug);
  const disconnect = disconnectM365Action.bind(null, slug);

  const ok = okMessage(query);
  const err = query.err ? ERR[query.err] : null;
  const errDetail = query.err && query.d ? query.d : null;
  const openWeekly = cycles.find((c) => c.template_key === "weekly");

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <header className="space-y-1 px-1">
        <p className="text-xs text-muted-foreground">KI-Barometer · Verwaltung</p>
        <h1 className="text-2xl font-normal tracking-tight sm:text-3xl">{org.name}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Alles, was dein Unternehmen für den wöchentlichen Pulse braucht — in
          der Reihenfolge der Einrichtung. Die Kacheln zeigen, wo noch etwas
          fehlt.
        </p>
      </header>

      {ok && <Notice tone="ok">{ok}</Notice>}
      {err && (
        <Notice tone="err">
          {err}
          {errDetail && <span className="mt-1 block text-xs">{errDetail}</span>}
        </Notice>
      )}

      <section aria-label="Status" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatusTile
          href={`${base}#abteilungen`}
          label="Abteilungen"
          value={String(departments.length)}
          hint={departments.length === 0 ? "Noch keine angelegt" : "für Heatmap und Teams"}
          attention={departments.length === 0}
        />
        <StatusTile
          href={`${base}#tools`}
          label="KI-Tools"
          value={String(activeTools.length)}
          hint={activeTools.length === 0 ? "Noch kein Tool aktiv" : "aktiv · fließen in den ROI"}
          attention={activeTools.length === 0}
        />
        <StatusTile
          href={`${base}#mitglieder`}
          label="Mitglieder"
          value={String(activeMembers.length)}
          hint={
            activeMembers.length < org.k_anonymity_min
              ? `mindestens ${org.k_anonymity_min} für eine Auswertung`
              : `${invitedCount} noch nicht angemeldet`
          }
          attention={activeMembers.length < org.k_anonymity_min}
        />
        <StatusTile
          href={`${base}#zyklen`}
          label="Pulse"
          value={openWeekly ? openWeekly.week : "–"}
          hint={
            cycles.length === 0
              ? "Kein Zyklus offen"
              : `${cycles.length} Zyklus/Zyklen offen${openWeekly?.reminder_sent_at ? " · erinnert" : ""}`
          }
          attention={cycles.length === 0}
        />
        <StatusTile
          href={`${base}#integrationen`}
          label="Copilot-Daten"
          value={copilotLatest ? copilotLatest.week : "–"}
          hint={
            copilotLatest
              ? `${copilotLatest.active_users} von ${copilotLatest.enabled_users} Lizenzen aktiv`
              : integration?.status === "connected"
                ? "verbunden, noch nicht synchronisiert"
                : "Noch keine Microsoft-Daten (optional)"
          }
          attention={!copilotLatest && integration?.status === "connected"}
        />
      </section>

      <nav aria-label="Abschnitte" className="flex flex-wrap gap-2 px-1">
        {STEPS.map((s, i) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="pill bg-white/70 text-muted-foreground transition-colors hover:bg-white hover:text-foreground"
          >
            <span className="font-semibold">{i + 1}</span>
            {s.label}
          </a>
        ))}
      </nav>

      {/* 1 + 2: Einstellungen, Abteilungen */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          id="einstellungen"
          step="1"
          title="Grundeinstellungen"
          lead="Anrede der Befragungen, Stundensatz für den ROI und die Anonymitätsschwelle."
        >
          <form action={updateSettings} className="space-y-4">
            <Field label="Anrede" htmlFor="form_of_address">
              <select id="form_of_address" name="form_of_address" defaultValue={org.form_of_address} className={inputClass}>
                <option value="sie">Sie-Form</option>
                <option value="du">Du-Form</option>
              </select>
            </Field>
            <Field label="Standard-Stundensatz (€)" htmlFor="hourly_rate_default" hint="Für die ROI-Rechnung; Angaben aus dem Führungsblock überschreiben ihn.">
              <input id="hourly_rate_default" name="hourly_rate_default" type="number" min={0} step="1" defaultValue={org.hourly_rate_default} className={inputClass} />
            </Field>
            <Field label="Anonymitätsschwelle k" htmlFor="k_anonymity_min" hint="Nur erhöhbar (z. B. auf Wunsch des Betriebsrats).">
              <input id="k_anonymity_min" name="k_anonymity_min" type="number" min={org.k_anonymity_min} max={50} defaultValue={org.k_anonymity_min} className={inputClass} />
            </Field>
            <Button type="submit" size="sm">Speichern</Button>
          </form>
        </SectionCard>

        <SectionCard
          id="abteilungen"
          step="2"
          title="Abteilungen"
          lead={`Grob schneiden, damit jede Abteilung mindestens ${org.k_anonymity_min} Personen hat — kleinere erscheinen in der Heatmap nicht einzeln.`}
        >
          {departments.length === 0 ? (
            <p className="mb-3 rounded-2xl bg-white/60 px-4 py-3 text-sm text-muted-foreground">
              Noch keine Abteilung angelegt.
            </p>
          ) : (
            <ul className="mb-3 divide-y divide-border rounded-2xl bg-white/60 px-4 text-sm">
              {departments.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{d.name}</span>
                  <form action={deleteDepartment}>
                    <input type="hidden" name="department_id" value={d.id} />
                    <Button type="submit" size="sm" variant="ghost">Löschen</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={addDepartment} className="flex gap-2">
            <input name="name" required maxLength={120} placeholder="Neue Abteilung" className={inputClass} aria-label="Neue Abteilung" />
            <Button type="submit" size="sm" variant="outline" className="shrink-0">Hinzufügen</Button>
          </form>
        </SectionCard>
      </div>

      {/* 3: Tools */}
      <SectionCard
        id="tools"
        step="3"
        title="KI-Tools und Lizenzkosten"
        lead="Kosten = Rechnungsbetrag pro Monat für alle Lizenzen des Tools. Die Anzahl der Lizenzen rechnet die gemessene Ersparnis pro Kopf auf alle Lizenznutzer hoch; ohne Angabe gelten die eingeladenen Mitglieder. Ungenutzte bezahlte Tools lösen Empfehlung R5 aus."
      >
        {tools.length > 0 && (
          <ul className="mb-4 space-y-2 text-sm">
            {tools.map((t) => (
              <li key={t.id} className={cn("flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3", t.active ? "bg-white/70" : "bg-white/40 text-muted-foreground")}>
                <form action={upsertTool} className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                  <input type="hidden" name="tool_value" value={t.tool_value} />
                  <input type="hidden" name="tool_label" value={t.tool_label} />
                  <span className="flex min-w-40 flex-1 items-center gap-2 font-medium">
                    <span className="status-dot" style={{ background: t.active ? "var(--status-good)" : "hsl(var(--tertiary-foreground))" }} aria-hidden />
                    {t.tool_label}
                  </span>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input name="cost" type="number" min={0} step="1" defaultValue={t.monthly_license_cost_eur} className={cn(inputClass, "h-9 w-24")} aria-label={`Lizenzkosten ${t.tool_label}`} />
                    €/Monat
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input name="seats" type="number" min={0} step="1" defaultValue={t.seats ?? ""} placeholder="–" className={cn(inputClass, "h-9 w-20")} aria-label={`Anzahl Lizenzen ${t.tool_label}`} />
                    Lizenzen
                  </label>
                  <input type="hidden" name="active" value="off" />
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" name="active" value="on" defaultChecked={t.active} className="accent-[#1b1b1d]" />
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
        )}
        <form action={upsertTool} className="space-y-3 rounded-2xl bg-panel-2 p-4">
          <input type="hidden" name="active" value="on" />
          <div className="flex flex-wrap items-end gap-3">
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
              <input id="cost" name="cost" type="number" min={0} step="1" defaultValue={0} className={cn(inputClass, "w-32")} />
            </Field>
            <Field label="Anzahl Lizenzen" htmlFor="seats">
              <input id="seats" name="seats" type="number" min={0} step="1" className={cn(inputClass, "w-32")} />
            </Field>
            <Button type="submit" size="sm" className="h-10">Hinzufügen</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Anzahl Lizenzen leer lassen, wenn unbekannt oder Pauschale.
          </p>
        </form>
      </SectionCard>

      {/* 4: Einladen */}
      <SectionCard
        id="einladen"
        step="4"
        title="Mitglieder einladen"
        lead="Jede Person bekommt eine E-Mail mit ihrem persönlichen Login-Link und startet mit der Onboarding-Befragung. Eine Adresse pro Zeile oder durch Komma getrennt — auch eine kopierte CSV-Spalte; Duplikate werden übersprungen."
      >
        <form action={invite} className="space-y-4">
          <Field label="E-Mail-Adressen" htmlFor="emails">
            <textarea id="emails" name="emails" rows={5} required className={cn(inputClass, "h-auto py-2")} placeholder={"anna@firma.at\nbert@firma.at"} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rolle" htmlFor="role" hint="Teamleitungen sehen das Dashboard ihres Teams, Org-Admins verwalten alles.">
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
      </SectionCard>

      {/* 5: Mitglieder */}
      <SectionCard
        id="mitglieder"
        step="5"
        title="Mitglieder"
        lead="Rolle und Abteilung ändern, Login-Link erneut senden oder entfernen. Entfernte Personen bekommen keine Befragungen mehr; ihre anonymen Antworten bleiben in den Aggregaten."
        aside={
          <span className="pill bg-white/70 text-muted-foreground">
            {activeMembers.length} Mitglieder · {invitedCount} eingeladen
          </span>
        }
      >
        {activeMembers.length === 0 ? (
          <p className="rounded-2xl bg-white/60 px-4 py-3 text-sm text-muted-foreground">
            Noch keine Mitglieder — lade in Schritt 4 die ersten Personen ein.
          </p>
        ) : (
          <ul className="space-y-2">
            {activeMembers.map((m) => (
              <li key={m.id} className="rounded-2xl bg-white/70 px-4 py-3">
                <form action={updateMember} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="membership_id" value={m.id} />
                  <span className="min-w-56 flex-1">
                    <span className="status-dot mr-2" style={{ background: m.status === "active" ? "var(--status-good)" : "var(--status-mid)" }} aria-hidden />
                    <span className="font-medium">{m.email}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {STATUS_LABELS[m.status]}
                      {m.department_id ? ` · ${departmentName.get(m.department_id) ?? "?"}` : ""}
                    </span>
                  </span>
                  <select name="role" defaultValue={m.role} className={cn(inputClass, "h-9 w-36")} aria-label="Rolle">
                    {(Object.keys(ROLE_LABELS) as OrgRole[]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <select name="department_id" defaultValue={m.department_id ?? ""} className={cn(inputClass, "h-9 w-44")} aria-label="Abteilung">
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
      </SectionCard>

      {/* 6: Zyklen */}
      <SectionCard
        id="zyklen"
        step="6"
        title="Befragungszyklen"
        lead="Der Zeitplan öffnet den Pulse montags und erinnert donnerstags automatisch. Hier kannst du Zyklen manuell öffnen, erinnern und schließen — z. B. für den ersten Testlauf."
      >
        {cycles.length === 0 ? (
          <p className="mb-4 rounded-2xl bg-white/60 px-4 py-3 text-sm text-muted-foreground">
            Aktuell ist kein Zyklus offen.
          </p>
        ) : (
          <ul className="mb-4 space-y-2 text-sm">
            {cycles.map((c) => (
              <li key={c.id} className="card-solid flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="flex items-center gap-3">
                  <span className="status-dot" style={{ background: "var(--accent-yellow)" }} aria-hidden />
                  <span>
                    <span className="font-medium">{TEMPLATE_LABELS[c.template_key]}</span>{" "}
                    <span className="text-muted-foreground">
                      {c.week} · {c.period_start} bis {c.period_end}
                      {c.reminder_sent_at ? " · erinnert" : ""}
                    </span>
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
      </SectionCard>

      {/* 7: Integrationen */}
      <SectionCard
        id="integrationen"
        step="7"
        title="Integrationen: Microsoft 365 Copilot"
        lead="Optional. Microsofts Nutzungsbericht ergänzt die Befragung um gemessene Zahlen: lizenzierte und aktive Nutzer, Nutzung je App, Prompts. Gespeichert werden nur Wochen-Summen der Organisation — nie einzelne Personen; die Datei bzw. Antwort wird nach dem Import verworfen."
        aside={
          <Button asChild size="sm" variant="outline">
            <Link href={`/app/${slug}/copilot`}>Zur Seite Copilot-Nutzung</Link>
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl bg-white/70 p-4">
            <h3 className="text-sm font-medium">CSV-Export hochladen</h3>
            <p className="text-xs text-muted-foreground">
              Microsoft 365 Admin Center → Berichte → Nutzung → Microsoft 365
              Copilot → Zeitraum 28 Tage → Exportieren. Die Namen im Bericht
              dürfen verschleiert sein (Standard); sie werden nicht übernommen.
              Bei unbekannten Spalten den Bericht auf Englisch exportieren.
            </p>
            <form action={importCsv} className="space-y-3">
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                required
                aria-label="Copilot-Bericht (CSV)"
                className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-medium file:text-primary-foreground"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Zeitraum des Berichts" htmlFor="period_days">
                  <select id="period_days" name="period_days" defaultValue="28" className={inputClass}>
                    {[7, 28, 30, 90, 180].map((d) => (
                      <option key={d} value={d}>{d} Tage</option>
                    ))}
                  </select>
                </Field>
                <Field label="Berichtsdatum" htmlFor="refresh_date" hint="Nur nötig, wenn die Datei kein „Report Refresh Date“ enthält.">
                  <input id="refresh_date" name="refresh_date" type="date" className={inputClass} />
                </Field>
              </div>
              <Button type="submit" size="sm">Importieren</Button>
            </form>
          </div>

          <div className="space-y-3 rounded-2xl bg-white/70 p-4">
            <h3 className="text-sm font-medium">Automatisch per Microsoft Graph</h3>
            <p className="flex items-center gap-2 text-sm">
              <span
                className="status-dot"
                style={{
                  background:
                    integration?.status === "connected"
                      ? "var(--status-good)"
                      : integration?.status === "error"
                        ? "var(--status-alert)"
                        : "hsl(var(--tertiary-foreground))",
                }}
                aria-hidden
              />
              {integration?.status === "connected"
                ? `Verbunden${integration.consented_at ? ` seit ${formatReportDate(integration.consented_at.slice(0, 10))}` : ""}${integration.last_sync_at ? ` · zuletzt synchronisiert ${formatReportDate(integration.last_sync_at.slice(0, 10))}` : " · noch nicht synchronisiert"}`
                : integration?.status === "error"
                  ? "Verbunden, letzte Synchronisierung fehlgeschlagen"
                  : "Nicht verbunden"}
            </p>
            {integration?.status === "error" && integration.last_error && (
              <p className="text-xs text-muted-foreground">{integration.last_error}</p>
            )}
            {integration?.names_concealed !== null && integration?.names_concealed !== undefined && (
              <p className="text-xs text-muted-foreground">
                Namensverschleierung im Tenant:{" "}
                {integration.names_concealed ? "aktiv (empfohlen)" : "aus — Microsoft liefert Klarnamen, die wir nicht speichern"}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Ein Global Admin des Microsoft-Tenants erteilt der App
              „KI-Barometer Connector“ die Berechtigung {REQUIRED_PERMISSION}
              (nur lesen). Danach holt das KI-Barometer die Berichte jeden
              Mittwoch automatisch.
            </p>
            <div className="flex flex-wrap gap-2">
              {integration?.status === "connected" || integration?.status === "error" ? (
                <>
                  <form action={syncNow}>
                    <Button type="submit" size="sm" variant="secondary" disabled={!m365Configured}>
                      Jetzt synchronisieren
                    </Button>
                  </form>
                  <form action={disconnect}>
                    <Button type="submit" size="sm" variant="ghost">Verbindung trennen</Button>
                  </form>
                </>
              ) : m365Configured ? (
                <Button asChild size="sm">
                  <a href={`/api/integrations/m365/consent?org=${encodeURIComponent(slug)}`}>
                    Microsoft 365 verbinden
                  </a>
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Die Anbindung ist auf diesem Server noch nicht eingerichtet
                  (dbrains: M365_CLIENT_ID / M365_CLIENT_SECRET). Der CSV-Import
                  funktioniert unabhängig davon.
                </p>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      <footer className="flex flex-wrap gap-4 border-t border-border pt-4 text-xs text-muted-foreground">
        <Link href={`/app/${slug}/dashboard`} className="hover:underline">
          Dashboard
        </Link>
        <Link href="/app" className="hover:underline">
          Meine Befragungen
        </Link>
        <span>Auswertungen nur ab n ≥ {org.k_anonymity_min} pro Abteilung.</span>
      </footer>
    </main>
  );
}
