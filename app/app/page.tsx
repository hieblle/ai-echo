import Link from "next/link";
import { Button } from "@/components/ui/button";
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

export const dynamic = "force-dynamic";

const TEMPLATE_TITLES: Record<TemplateKey, string> = {
  onboarding: "Onboarding-Befragung",
  weekly: "Wöchentlicher Pulse",
  monthly: "Monatliche Vertiefung",
  leadership: "Führungskräfte-Befragung",
};

const TEMPLATE_HINTS: Record<TemplateKey, string> = {
  onboarding: "Einmalig, ca. 3 Minuten — personalisiert deine Pulse-Fragen.",
  weekly: "3–5 Fragen, unter 60 Sekunden.",
  monthly: "8–12 Fragen, 5–8 Minuten.",
  leadership: "Monatlicher Leadership-Block inkl. Gap-Fragen.",
};

interface OrgCardProps {
  org: Organization;
  membership: Membership;
  onboardingDone: boolean;
  due: DueSurvey[];
  completed: DueSurvey[];
  /** Org-wide transparency numbers for employees (SPEC §7.4). */
  publicKpis: PublicOrgKpis | null;
}

const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function SurveyRow({
  org,
  template,
  week,
  done,
}: {
  org: Organization;
  template: TemplateKey;
  week?: string;
  done: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">
          {TEMPLATE_TITLES[template]}
          {week && (
            <span className="ml-2 text-xs text-muted-foreground">{week}</span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {done ? "Erledigt — danke!" : TEMPLATE_HINTS[template]}
        </p>
      </div>
      {!done && (
        <Button asChild>
          <Link href={`/app/${org.slug}/survey/${template}`}>Jetzt starten</Link>
        </Button>
      )}
    </li>
  );
}

function OrgCard({
  org,
  membership,
  onboardingDone,
  due,
  completed,
  publicKpis,
}: OrgCardProps) {
  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{org.name}</h2>
        <div className="flex gap-3 text-sm">
          {canViewDashboard(membership.role) && (
            <Link href={`/app/${org.slug}/dashboard`} className="underline-offset-4 hover:underline">
              Dashboard
            </Link>
          )}
          {canAdminOrg(membership.role) && (
            <Link href={`/app/${org.slug}/admin`} className="underline-offset-4 hover:underline">
              Verwaltung
            </Link>
          )}
        </div>
      </div>

      <ul className="space-y-2">
        {!onboardingDone && (
          <SurveyRow org={org} template="onboarding" done={false} />
        )}
        {onboardingDone && due.length === 0 && completed.length === 0 && (
          <li className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Aktuell ist keine Befragung offen. Du bekommst eine E-Mail, sobald
            der nächste Pulse startet.
          </li>
        )}
        {onboardingDone &&
          due.map((d) => (
            <SurveyRow key={d.cycle.id} org={org} template={d.template} week={d.cycle.week} done={false} />
          ))}
        {onboardingDone &&
          completed.map((d) => (
            <SurveyRow key={d.cycle.id} org={org} template={d.template} week={d.cycle.week} done />
          ))}
        {!onboardingDone && due.length > 0 && (
          <li className="text-xs text-muted-foreground">
            Die offenen Pulse-Befragungen erscheinen nach dem Onboarding.
          </li>
        )}
      </ul>

      {publicKpis && publicKpis.weeks > 0 && (
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Teilnahmequote (gesamt)</dt>
            <dd className="text-lg font-semibold">
              {publicKpis.participationRate === null
                ? "–"
                : `${nf.format(publicKpis.participationRate * 100)} %`}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Stimmung zu KI (gesamt)</dt>
            <dd className="text-lg font-semibold">
              {publicKpis.sentimentIndex === null
                ? "–"
                : `${nf1.format(publicKpis.sentimentIndex)} / 10`}
            </dd>
          </div>
          <p className="col-span-2 text-xs text-muted-foreground">
            Anonyme Gesamtwerte der Organisation, Stand {publicKpis.latestWeek}.
          </p>
        </dl>
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

  const cards = [];
  for (const membership of viewer.memberships) {
    const org = await viewer.store.getOrganization(membership.org_id);
    if (!org) continue;
    const overview = await getMemberOverview(viewer.store, org, membership);
    const publicKpis = canViewDashboard(membership.role)
      ? null
      : await getPublicOrgKpis(viewer.store, org);
    cards.push(
      <OrgCard
        key={membership.id}
        org={org}
        membership={membership}
        onboardingDone={overview.onboardingDone}
        due={overview.due}
        completed={overview.completed}
        publicKpis={publicKpis}
      />,
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          Angemeldet als {viewer.user.email}
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Deine Befragungen</h1>
      </header>

      {notice && (
        <p role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {notice}
        </p>
      )}

      {cards.length === 0 ? (
        <section className="space-y-3 rounded-lg border bg-muted/30 p-6">
          <h2 className="font-semibold">Noch keine Organisation</h2>
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
    </main>
  );
}
