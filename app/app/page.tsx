import { Check, ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/field";
import {
  activateMemberships,
  canAdminOrg,
  canViewDashboard,
  requireViewer,
} from "@/lib/server/auth";
import {
  getPublicOrgKpis,
  type PublicOrgKpis,
} from "@/lib/server/dashboard-service";
import { getMemberOverview, type DueSurvey } from "@/lib/server/member-service";
import { SURVEY_ACCESS_MESSAGES } from "@/lib/server/member-survey-service";
import type { Membership, Organization, TemplateKey } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TEMPLATE_TITLES: Record<TemplateKey, string> = {
  onboarding: "Onboarding-Befragung",
  weekly: "Wöchentlicher Pulse",
  monthly: "Monatliche Vertiefung",
  leadership: "Führungskräfte-Befragung",
};

const TEMPLATE_HINTS: Record<TemplateKey, string> = {
  onboarding: "Einmalig, ca. 3 Minuten — personalisiert deine Pulse-Fragen.",
  weekly: "5 Fragen, unter 60 Sekunden.",
  monthly: "8–12 Fragen, 5–8 Minuten.",
  leadership: "Monatlicher Leadership-Block inkl. Gap-Fragen.",
};

const ROLE_LABELS: Record<Membership["role"], string> = {
  employee: "Mitarbeiter:in",
  team_lead: "Teamleitung",
  org_admin: "Org-Admin",
};

const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** What an org admin still has to set up before the first pulse can run. */
interface SetupItem {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  href: string;
}

function SurveyRow({
  org,
  template,
  week,
  state,
}: {
  org: Organization;
  template: TemplateKey;
  week?: string;
  state: "due" | "done" | "locked";
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4",
        state === "due" ? "card-solid" : "rounded-[20px] bg-white/60",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {state === "due" && (
          <span className="status-dot" style={{ background: "var(--accent-yellow)" }} aria-hidden />
        )}
        {state === "done" && (
          <Check className="h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: "var(--viz-delta-good)" }} aria-hidden />
        )}
        {state === "locked" && (
          <Lock className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", state !== "due" && "text-muted-foreground")}>
            {TEMPLATE_TITLES[template]}
            {week && <span className="ml-2 text-[11px] font-normal text-muted-foreground">{week}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {state === "done"
              ? "Erledigt — danke!"
              : state === "locked"
                ? "Wird nach dem Onboarding freigeschaltet."
                : TEMPLATE_HINTS[template]}
          </p>
        </div>
      </div>
      {state === "due" && (
        <Button asChild className="w-full sm:w-auto">
          <Link href={`/app/${org.slug}/survey/${template}`}>
            Jetzt starten
            <ChevronRight className="ml-1 h-4 w-4" strokeWidth={1.5} aria-hidden />
          </Link>
        </Button>
      )}
    </li>
  );
}

interface OrgCardProps {
  org: Organization;
  membership: Membership;
  onboardingDone: boolean;
  due: DueSurvey[];
  completed: DueSurvey[];
  /** Org-wide transparency numbers for employees (SPEC §7.4). */
  publicKpis: PublicOrgKpis | null;
  setup: SetupItem[] | null;
}

function OrgCard({
  org,
  membership,
  onboardingDone,
  due,
  completed,
  publicKpis,
  setup,
}: OrgCardProps) {
  const dueCount = (onboardingDone ? due.length : 1) + 0;
  const setupOpen = setup?.filter((s) => !s.done) ?? [];
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium">{org.name}</h2>
          <span className="pill bg-white/70 text-muted-foreground">{ROLE_LABELS[membership.role]}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canViewDashboard(membership.role) && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/${org.slug}/dashboard`}>Dashboard</Link>
            </Button>
          )}
          {canAdminOrg(membership.role) && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/${org.slug}/report`}>Monatsreport</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/${org.slug}/admin`}>Verwaltung</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="card-soft p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Jetzt dran</h3>
          <span className="text-[11px] text-muted-foreground">
            {dueCount === 0 ? "nichts offen" : `${dueCount} offen`}
          </span>
        </div>
        <ul className="space-y-2">
          {!onboardingDone && <SurveyRow org={org} template="onboarding" state="due" />}
          {onboardingDone && due.length === 0 && completed.length === 0 && (
            <li className="rounded-[20px] bg-white/60 px-5 py-4 text-sm text-muted-foreground">
              Aktuell ist keine Befragung offen. Der nächste Pulse startet
              montags — du bekommst dann eine E-Mail mit dem Link.
            </li>
          )}
          {due.map((d) => (
            <SurveyRow
              key={d.cycle.id}
              org={org}
              template={d.template}
              week={d.cycle.week}
              state={onboardingDone ? "due" : "locked"}
            />
          ))}
          {completed.map((d) => (
            <SurveyRow key={d.cycle.id} org={org} template={d.template} week={d.cycle.week} state="done" />
          ))}
        </ul>
      </div>

      {publicKpis && publicKpis.weeks > 0 && (
        <div className="card-soft grid grid-cols-2 gap-4 p-5">
          <div>
            <p className="text-xs text-muted-foreground">Teilnahmequote</p>
            <p className="text-2xl font-light tracking-tight">
              {publicKpis.participationRate === null
                ? "–"
                : `${nf.format(publicKpis.participationRate * 100)} %`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Stimmung zu KI</p>
            <p className="text-2xl font-light tracking-tight">
              {publicKpis.sentimentIndex === null
                ? "–"
                : `${nf1.format(publicKpis.sentimentIndex)} / 10`}
            </p>
          </div>
          <p className="col-span-2 text-[11px] text-muted-foreground">
            Anonyme Gesamtwerte der Organisation, Stand {publicKpis.latestWeek}.
            Einzelne Antworten sieht niemand.
          </p>
        </div>
      )}

      {setup && (
        <div className="card-soft p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-medium">Einrichtung</h3>
            <span className="text-[11px] text-muted-foreground">
              {setupOpen.length === 0
                ? "vollständig"
                : `${setup.length - setupOpen.length} von ${setup.length} Schritten`}
            </span>
          </div>
          <ol className="space-y-1">
            {setup.map((item, i) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm transition-colors hover:bg-white/70"
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                      item.done ? "bg-white text-muted-foreground shadow-pill" : "bg-primary text-primary-foreground",
                    )}
                    aria-hidden
                  >
                    {item.done ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : i + 1}
                  </span>
                  <span className={cn("flex-1", item.done && "text-muted-foreground")}>{item.label}</span>
                  <span className="text-[11px] text-muted-foreground">{item.detail}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

interface AppHomeProps {
  searchParams: Promise<{ denied?: string; survey?: string }>;
}

const NOTICES: Record<string, string> = {
  "denied:admin": "Für diesen Bereich fehlt dir die Berechtigung.",
  "denied:dashboard": "Das Dashboard sehen nur Teamleitung und Geschäftsführung.",
  "denied:team":
    "Dir ist noch kein Team zugeordnet — bitte die Verwaltung deiner Organisation, das nachzutragen.",
  "denied:member":
    "Als Plattform-Admin ohne Mitgliedschaft kannst du keine Befragung beantworten.",
  ...Object.fromEntries(
    Object.entries(SURVEY_ACCESS_MESSAGES).map(([k, v]) => [`survey:${k}`, v]),
  ),
};

export default async function AppHome({ searchParams }: AppHomeProps) {
  const viewer = await requireViewer("/app");
  await activateMemberships(viewer);
  const { denied, survey } = await searchParams;
  const notice =
    (denied && NOTICES[`denied:${denied}`]) ||
    (survey && NOTICES[`survey:${survey}`]) ||
    null;
  const store = viewer.store;

  const cards = [];
  let openTotal = 0;
  for (const membership of viewer.memberships) {
    const org = await store.getOrganization(membership.org_id);
    if (!org) continue;
    const overview = await getMemberOverview(store, org, membership);
    openTotal += overview.onboardingDone ? overview.due.length : 1;
    const publicKpis = canViewDashboard(membership.role)
      ? null
      : await getPublicOrgKpis(store, org);

    let setup: SetupItem[] | null = null;
    if (canAdminOrg(membership.role)) {
      const [departments, members, tools, cycles] = await Promise.all([
        store.listDepartments(org.id),
        store.listMemberships(org.id),
        store.listToolSettings(org.id),
        store.listCycles(org.id, { status: "open" }),
      ]);
      const active = members.filter((m) => m.status !== "removed");
      const activeTools = tools.filter((t) => t.active);
      const base = `/app/${org.slug}/admin`;
      setup = [
        {
          key: "departments",
          label: "Abteilungen anlegen",
          detail: `${departments.length} angelegt`,
          done: departments.length > 0,
          href: `${base}#abteilungen`,
        },
        {
          key: "tools",
          label: "KI-Tools und Lizenzen eintragen",
          detail: `${activeTools.length} aktiv`,
          done: activeTools.length > 0,
          href: `${base}#tools`,
        },
        {
          key: "members",
          label: "Mitglieder einladen",
          detail: `${active.length} Mitglieder`,
          done: active.length >= org.k_anonymity_min,
          href: `${base}#einladen`,
        },
        {
          key: "cycle",
          label: "Ersten Pulse öffnen",
          detail: cycles.length === 0 ? "kein Zyklus offen" : `${cycles.length} offen`,
          done: cycles.length > 0,
          href: `${base}#zyklen`,
        },
      ];
    }

    cards.push(
      <OrgCard
        key={membership.id}
        org={org}
        membership={membership}
        onboardingDone={overview.onboardingDone}
        due={overview.due}
        completed={overview.completed}
        publicKpis={publicKpis}
        setup={setup}
      />,
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-6 sm:px-8 lg:py-8">
      <header className="space-y-1 px-1">
        <p className="text-xs text-muted-foreground">KI-Barometer · Übersicht</p>
        <h1 className="text-2xl font-normal tracking-tight sm:text-3xl">Deine Befragungen</h1>
        <p className="text-sm text-muted-foreground">
          {cards.length === 0
            ? "Angemeldet als " + viewer.user.email
            : openTotal === 0
              ? "Nichts offen — alles erledigt."
              : openTotal === 1
                ? "Eine Befragung wartet auf dich."
                : `${openTotal} Befragungen warten auf dich.`}
        </p>
      </header>

      {notice && <Notice tone="err">{notice}</Notice>}

      {cards.length === 0 ? (
        <section className="card-soft space-y-3 p-6">
          <h2 className="text-base font-medium">Noch keine Organisation</h2>
          <p className="text-sm text-muted-foreground">
            Deine Adresse ist in keiner Organisation eingetragen. Bitte die
            Person, die das KI-Barometer in deinem Unternehmen betreut, dich
            einzuladen.
          </p>
          {viewer.isPlatformAdmin && (
            <Button asChild variant="outline">
              <Link href="/admin">Organisation anlegen (Plattform-Admin)</Link>
            </Button>
          )}
        </section>
      ) : (
        cards
      )}

      {viewer.isPlatformAdmin && cards.length > 0 && (
        <section className="card-soft flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-sm font-medium">Plattform-Admin</h2>
            <p className="text-xs text-muted-foreground">
              Alle Organisationen anlegen und verwalten — auch die ohne eigene Mitgliedschaft.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin">Organisationen</Link>
          </Button>
        </section>
      )}
    </main>
  );
}
