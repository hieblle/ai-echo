/**
 * Navigation model for the demo routes, built from the seeded MemoryStore —
 * no database, auth or secrets involved (CLAUDE.md: the demo stays
 * infrastructure-free).
 */

import type { ShellData, ShellSurveyItem } from "@/components/shell/types";
import { DEMO_ORG_ID } from "@/lib/seed/demo-org";
import type { DemoPersona, TemplateKey } from "@/lib/types";
import { monthOfIsoWeek } from "./dashboard-service";
import { buildDemoShell, insightFor, type DemoShellOrg } from "./shell";
import { getDemoStore } from "./store-instance";

const FLOWS: { template: TemplateKey; title: string; hint: string; leadOnly?: boolean }[] = [
  { template: "onboarding", title: "Onboarding", hint: "Einmalig · ca. 3 Minuten" },
  { template: "weekly", title: "Wöchentlicher Pulse", hint: "5 Fragen · unter 1 Minute" },
  { template: "monthly", title: "Monatliche Vertiefung", hint: "8–12 Fragen · 5–8 Minuten" },
  { template: "leadership", title: "Führungskräfte-Befragung", hint: "7 Fragen · Führungsblock", leadOnly: true },
];

function demoSurveys(personas: DemoPersona[]): ShellSurveyItem[] {
  const employee = personas.find((p) => p.role_scope === "employee") ?? personas[0];
  const lead = personas.find((p) => p.role_scope === "lead") ?? personas[0];
  const items: ShellSurveyItem[] = [];
  for (const flow of FLOWS) {
    const persona = flow.leadOnly ? lead : employee;
    if (!persona) continue;
    items.push({
      key: flow.template,
      title: flow.title,
      hint: `${flow.hint} · als ${persona.label}`,
      href: `/survey/${flow.template}?persona=${encodeURIComponent(persona.id)}`,
      state: "due",
    });
  }
  return items;
}

export async function getDemoShell(): Promise<ShellData> {
  const store = await getDemoStore();
  const all = await store.listOrganizations();
  // Sales-demo orgs first (with data), the interactive Musterwerk org last.
  const sorted = [
    ...all.filter((o) => o.id !== DEMO_ORG_ID),
    ...all.filter((o) => o.id === DEMO_ORG_ID),
  ];
  const orgs: DemoShellOrg[] = [];
  for (const org of sorted) {
    const stats = await store.listParticipationStats(org.id);
    const weeks = stats
      .filter((s) => s.template_key === "weekly")
      .map((s) => s.week)
      .sort();
    const latest = weeks[weeks.length - 1];
    orgs.push({
      org,
      reportMonth: latest ? monthOfIsoWeek(latest) : null,
      insight: await insightFor(store, org),
    });
  }
  const personas = await store.listPersonas(DEMO_ORG_ID);
  return buildDemoShell(orgs, demoSurveys(personas), DEMO_ORG_ID);
}
