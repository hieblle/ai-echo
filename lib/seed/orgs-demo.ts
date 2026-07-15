/**
 * Phase 2 demo tenants — the three SPEC.md §16.3 seed orgs (Merlin Technology,
 * SPAR Österreich, REWE) with departments, headcounts and configured AI tools.
 *
 * All values are the §16.3 placeholder profiles (verify with the customer
 * before a real pilot). Every org is `is_demo: true` and uses the Sie-form.
 *
 * NOTE: Merlin's Marketing department has a headcount of 4 — that is the
 * INTENTIONAL k-anonymity anomaly of SPEC.md §13 Phase 2 (k default 5, the
 * department must appear suppressed everywhere). Never "fix" this number.
 */

import type {
  Department,
  DepartmentId,
  Organization,
  OrgId,
  OrgToolSetting,
} from "@/lib/types";
import { TOOL_CATALOG } from "./questions";

export const MERLIN_ORG_ID: OrgId = "org-merlin";
export const SPAR_ORG_ID: OrgId = "org-spar";
export const REWE_ORG_ID: OrgId = "org-rewe";

export const DEMO_ORGS: Organization[] = [
  {
    id: MERLIN_ORG_ID,
    name: "Merlin Technology GmbH",
    slug: "merlin",
    logo_url: null,
    primary_color: null,
    hourly_rate_default: 65,
    locale: "de",
    form_of_address: "sie",
    k_anonymity_min: 5,
    is_demo: true,
  },
  {
    id: SPAR_ORG_ID,
    name: "SPAR Österreich (Zentrale)",
    slug: "spar",
    logo_url: null,
    primary_color: null,
    hourly_rate_default: 50,
    locale: "de",
    form_of_address: "sie",
    k_anonymity_min: 5,
    is_demo: true,
  },
  {
    id: REWE_ORG_ID,
    name: "REWE (Zentralbereich)",
    slug: "rewe",
    logo_url: null,
    primary_color: null,
    hourly_rate_default: 50,
    locale: "de",
    form_of_address: "sie",
    k_anonymity_min: 5,
    is_demo: true,
  },
];

/**
 * Departments + headcounts in one place so the two exports cannot drift.
 * Department ids are org-scoped (unique per org is enough, SPEC.md §6).
 */
const ORG_DEPARTMENTS: {
  org_id: OrgId;
  id: DepartmentId;
  name: string;
  headcount: number;
}[] = [
  // Org A — Merlin Technology GmbH (47 office/knowledge workers, §16.1 scope)
  { org_id: MERLIN_ORG_ID, id: "vertrieb-export", name: "Vertrieb & Export", headcount: 12 },
  { org_id: MERLIN_ORG_ID, id: "technik-entwicklung", name: "Technik & Entwicklung", headcount: 14 },
  { org_id: MERLIN_ORG_ID, id: "verwaltung-finanzen", name: "Verwaltung & Finanzen", headcount: 8 },
  // Headcount 4 < k (5): the intentional k-anonymity showcase — never change.
  { org_id: MERLIN_ORG_ID, id: "marketing", name: "Marketing", headcount: 4 },
  { org_id: MERLIN_ORG_ID, id: "service-innendienst", name: "Service-Innendienst", headcount: 9 },

  // Org B — SPAR Österreich, scope "Zentrale" (81)
  { org_id: SPAR_ORG_ID, id: "einkauf-cm", name: "Einkauf / Category Management", headcount: 18 },
  { org_id: SPAR_ORG_ID, id: "marketing", name: "Marketing", headcount: 14 },
  { org_id: SPAR_ORG_ID, id: "it-digital", name: "IT / Digital", headcount: 16 },
  { org_id: SPAR_ORG_ID, id: "hr", name: "Personal / HR", headcount: 10 },
  { org_id: SPAR_ORG_ID, id: "finanzen-controlling", name: "Finanzen / Controlling", headcount: 12 },
  { org_id: SPAR_ORG_ID, id: "logistikplanung", name: "Logistikplanung", headcount: 11 },

  // Org C — REWE, scope Zentralbereich (72)
  { org_id: REWE_ORG_ID, id: "einkauf", name: "Einkauf", headcount: 15 },
  { org_id: REWE_ORG_ID, id: "marketing", name: "Marketing", headcount: 12 },
  { org_id: REWE_ORG_ID, id: "it", name: "IT", headcount: 14 },
  { org_id: REWE_ORG_ID, id: "hr", name: "Personal / HR", headcount: 9 },
  { org_id: REWE_ORG_ID, id: "controlling", name: "Controlling", headcount: 10 },
  { org_id: REWE_ORG_ID, id: "supply-chain", name: "Supply-Chain-Planung", headcount: 12 },
];

export const DEMO_ORG_DEPARTMENTS: Department[] = ORG_DEPARTMENTS.map(
  ({ id, org_id, name }) => ({ id, org_id, name }),
);

/** Demo headcount per org and department (drives the generated volumes). */
export const DEMO_ORG_HEADCOUNTS: Record<OrgId, Record<DepartmentId, number>> =
  ORG_DEPARTMENTS.reduce<Record<OrgId, Record<DepartmentId, number>>>(
    (acc, dept) => {
      (acc[dept.org_id] ??= {})[dept.id] = dept.headcount;
      return acc;
    },
    {},
  );

/** Tool setting with its label taken from the O2 catalog (single source). */
function toolSetting(
  orgId: OrgId,
  orgSlug: string,
  toolValue: string,
  monthlyLicenseCostEur: number,
): OrgToolSetting {
  const catalogEntry = TOOL_CATALOG.find((c) => c.value === toolValue);
  if (!catalogEntry) {
    throw new Error(`tool value "${toolValue}" is not in the O2 catalog`);
  }
  return {
    id: `ts-${orgSlug}-${toolValue}`,
    org_id: orgId,
    tool_value: toolValue,
    tool_label: catalogEntry.label,
    monthly_license_cost_eur: monthlyLicenseCostEur,
    active: true,
  };
}

/**
 * Configured tools per org (§16.3). Merlin's Copilot licences cost 1.440 €/month
 * while W1.2 usage stays < 15 % — the intentional R5 anomaly (SPEC.md §11).
 */
export const DEMO_ORG_TOOL_SETTINGS: OrgToolSetting[] = [
  toolSetting(MERLIN_ORG_ID, "merlin", "copilot365", 1440),
  toolSetting(MERLIN_ORG_ID, "merlin", "chatgpt", 800),
  toolSetting(MERLIN_ORG_ID, "merlin", "deepl_write", 350),

  toolSetting(SPAR_ORG_ID, "spar", "copilot365", 2400),
  toolSetting(SPAR_ORG_ID, "spar", "chatgpt", 1500),
  toolSetting(SPAR_ORG_ID, "spar", "deepl_write", 500),

  toolSetting(REWE_ORG_ID, "rewe", "copilot365", 2000),
  toolSetting(REWE_ORG_ID, "rewe", "chatgpt", 1200),
  toolSetting(REWE_ORG_ID, "rewe", "internal_ai", 900),
];
