/**
 * Builds the navigation model of the app shell (components/shell) for the
 * calling viewer: one entry per organisation with the pages their role may
 * open, plus their surveys for the drawer (server-only).
 */

import type { Store } from "@/lib/data/store";
import type {
  ShellData,
  ShellNavItem,
  ShellOrg,
  ShellSurveyItem,
} from "@/components/shell/types";
import type { Membership, Organization, Role, TemplateKey } from "@/lib/types";
import { canAdminOrg, canViewDashboard, type Viewer } from "./auth";
import { getPublicOrgKpis } from "./dashboard-service";
import { getMemberOverview } from "./member-service";

const TEMPLATE_TITLES: Record<TemplateKey, string> = {
  onboarding: "Onboarding",
  weekly: "Wöchentlicher Pulse",
  monthly: "Monatliche Vertiefung",
  leadership: "Führungskräfte-Befragung",
};

const TEMPLATE_HINTS: Record<TemplateKey, string> = {
  onboarding: "Einmalig · ca. 3 Minuten",
  weekly: "5 Fragen · unter 1 Minute",
  monthly: "8–12 Fragen · 5–8 Minuten",
  leadership: "7 Fragen · Führungsblock",
};

const ROLE_LABELS: Record<Role, string> = {
  employee: "Mitarbeiter:in",
  team_lead: "Teamleitung",
  org_admin: "Org-Admin",
  platform_admin: "Plattform-Admin",
};

const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function initialsOf(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters =
    parts.length >= 2
      ? `${parts[0]![0]}${parts[1]![0]}`
      : local.slice(0, 2);
  return letters.toUpperCase() || "KI";
}

function orgNav(slug: string, role: Role): ShellNavItem[] {
  const base = `/app/${slug}`;
  const items: ShellNavItem[] = [];
  if (canViewDashboard(role)) {
    items.push({ key: "dashboard", label: "Dashboard", icon: "dashboard", href: `${base}/dashboard` });
  }
  if (canAdminOrg(role)) {
    items.push({ key: "report", label: "Monatsreport", icon: "report", href: `${base}/report` });
    items.push({ key: "members", label: "Mitglieder", icon: "members", href: `${base}/admin#mitglieder` });
    items.push({ key: "admin", label: "Verwaltung", icon: "settings", href: `${base}/admin`, exact: true });
  }
  return items;
}

async function surveysFor(
  store: Store,
  org: Organization,
  membership: Membership | null,
): Promise<ShellSurveyItem[]> {
  if (!membership) return [];
  const overview = await getMemberOverview(store, org, membership);
  const base = `/app/${org.slug}/survey`;
  const items: ShellSurveyItem[] = [];
  if (!overview.onboardingDone) {
    items.push({
      key: "onboarding",
      title: TEMPLATE_TITLES.onboarding,
      hint: TEMPLATE_HINTS.onboarding,
      href: `${base}/onboarding`,
      state: "due",
    });
  }
  for (const d of overview.due) {
    items.push({
      key: d.cycle.id,
      title: TEMPLATE_TITLES[d.template],
      hint: overview.onboardingDone
        ? `${d.cycle.week} · ${TEMPLATE_HINTS[d.template]}`
        : "Nach dem Onboarding",
      href: overview.onboardingDone ? `${base}/${d.template}` : undefined,
      state: overview.onboardingDone ? "due" : "locked",
    });
  }
  for (const d of overview.completed) {
    items.push({
      key: d.cycle.id,
      title: TEMPLATE_TITLES[d.template],
      hint: `${d.cycle.week} · erledigt`,
      state: "done",
    });
  }
  if (overview.onboardingDone && overview.due.length === 0 && overview.completed.length === 0) {
    items.push({
      key: "next",
      title: "Nächster Pulse",
      hint: "Startet montags · du bekommst eine Mail",
      state: "soon",
    });
  }
  return items;
}

/** Shell for the product routes (/app, /admin). */
export async function buildProductShell(viewer: Viewer): Promise<ShellData> {
  const store = viewer.store;
  const orgRows: Organization[] = viewer.isPlatformAdmin
    ? await store.listOrganizations()
    : [];
  if (!viewer.isPlatformAdmin) {
    for (const m of viewer.memberships) {
      const org = await store.getOrganization(m.org_id);
      if (org) orgRows.push(org);
    }
  }
  // Own memberships first, then (platform admin) everything else by name.
  const memberOrgIds = new Set(viewer.memberships.map((m) => m.org_id));
  orgRows.sort((a, b) => {
    const am = memberOrgIds.has(a.id) ? 0 : 1;
    const bm = memberOrgIds.has(b.id) ? 0 : 1;
    return am - bm || a.name.localeCompare(b.name, "de");
  });

  const orgs: ShellOrg[] = [];
  for (const org of orgRows) {
    const membership = viewer.memberships.find((m) => m.org_id === org.id) ?? null;
    const role: Role = viewer.isPlatformAdmin ? "platform_admin" : (membership?.role ?? "employee");
    const surveys = await surveysFor(store, org, membership);
    orgs.push({
      slug: org.slug,
      name: org.name,
      base: `/app/${org.slug}`,
      homeHref: canViewDashboard(role) ? `/app/${org.slug}/dashboard` : "/app",
      roleLabel: ROLE_LABELS[role],
      nav: orgNav(org.slug, role),
      surveys,
      insight: membership ? await insightFor(store, org) : null,
    });
  }

  const globalNav: ShellNavItem[] = [
    { key: "home", label: "Übersicht", icon: "home", href: "/app", exact: true },
  ];
  if (viewer.isPlatformAdmin) {
    globalNav.push({ key: "platform", label: "Plattform", icon: "platform", href: "/admin" });
  }

  return {
    mode: "product",
    brandHref: "/app",
    globalNav,
    orgs,
    user: { label: viewer.user.email, initials: initialsOf(viewer.user.email) },
  };
}

/** Org-wide transparency numbers (SPEC §7.4) as one line for the drawer. */
export async function insightFor(store: Store, org: Organization): Promise<string | null> {
  const kpis = await getPublicOrgKpis(store, org);
  if (kpis.weeks === 0) return null;
  const parts: string[] = [];
  if (kpis.participationRate !== null) {
    parts.push(`Teilnahme ${nf.format(kpis.participationRate * 100)} %`);
  }
  if (kpis.sentimentIndex !== null) {
    parts.push(`Stimmung zu KI ${nf1.format(kpis.sentimentIndex)} von 10`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(" · ")} (Stand ${kpis.latestWeek}). Diese Werte sehen alle Mitglieder.`;
}

export interface DemoShellOrg {
  org: Organization;
  /** Month of the latest weekly data, for the report link. */
  reportMonth: string | null;
  insight: string | null;
}

/**
 * Shell for the infrastructure-free demo routes (/demo, /dashboard, /report,
 * /survey). The interactive survey org (Musterwerk) is anchored at /demo;
 * the demo survey flows appear in every org's drawer so the panel shows the
 * concept on the sales dashboards too (they always write to Musterwerk).
 */
export function buildDemoShell(
  orgs: DemoShellOrg[],
  surveys: ShellSurveyItem[],
  interactiveOrgId: string,
): ShellData {
  return {
    mode: "demo",
    brandHref: "/",
    globalNav: [
      { key: "home", label: "Startseite", icon: "home", href: "/", exact: true },
      { key: "demo", label: "Befragungs-Demo", icon: "demo", href: "/demo", exact: true },
    ],
    orgs: orgs.map(({ org, reportMonth, insight }) => {
      const interactive = org.id === interactiveOrgId;
      const nav: ShellNavItem[] = [
        { key: "dashboard", label: "Dashboard", icon: "dashboard", href: `/dashboard/${org.slug}` },
      ];
      if (reportMonth) {
        nav.push({ key: "report", label: "Monatsreport", icon: "report", href: `/report/${org.slug}/${reportMonth}` });
      }
      return {
        slug: org.slug,
        name: org.name,
        base: interactive ? "/demo" : `/dashboard/${org.slug}`,
        // The demo survey flows always answer for the interactive org.
        ...(interactive ? { paths: ["/survey"] } : {}),
        homeHref: interactive ? "/demo" : `/dashboard/${org.slug}`,
        roleLabel: interactive ? "Demo · Befragungen ausprobieren" : "Demo · Geschäftsführung",
        nav,
        surveys,
        insight,
      };
    }),
    user: null,
  };
}
