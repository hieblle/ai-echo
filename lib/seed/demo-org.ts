/**
 * Phase 1 demo tenant for the prototype's role switcher (SPEC.md §13).
 *
 * A single demo org ("Musterwerk GmbH") with its departments and the four
 * demo personas. The three SPEC.md §16.3 demo organizations follow in Phase 2.
 */

import type { DemoPersona, Department, Organization } from "@/lib/types";

export const DEMO_ORG_ID = "org-demo";

export const DEMO_ORG: Organization = {
  id: DEMO_ORG_ID,
  name: "Musterwerk GmbH",
  slug: "musterwerk",
  logo_url: null,
  primary_color: null,
  hourly_rate_default: 60,
  locale: "de",
  form_of_address: "du",
  k_anonymity_min: 5,
  is_demo: true,
};

/**
 * Department ids intentionally equal the O1 choice values (SPEC.md §12), so
 * the onboarding answer maps 1:1 to a department without a lookup table.
 */
export const DEMO_DEPARTMENTS: Department[] = [
  { id: "management", org_id: DEMO_ORG_ID, name: "Geschäftsleitung / Management" },
  { id: "sales", org_id: DEMO_ORG_ID, name: "Vertrieb / Sales" },
  { id: "marketing", org_id: DEMO_ORG_ID, name: "Marketing" },
  { id: "hr", org_id: DEMO_ORG_ID, name: "Personal / HR" },
  { id: "finance", org_id: DEMO_ORG_ID, name: "Finanzen / Controlling" },
  { id: "it", org_id: DEMO_ORG_ID, name: "IT / Technik" },
  { id: "operations", org_id: DEMO_ORG_ID, name: "Produktion / Operations" },
  { id: "support", org_id: DEMO_ORG_ID, name: "Kundenservice / Support" },
  { id: "rnd", org_id: DEMO_ORG_ID, name: "Forschung / Entwicklung" },
  { id: "other", org_id: DEMO_ORG_ID, name: "Andere" },
];

/**
 * The role switcher personas (SPEC.md §13 Phase 1): employee, team lead and
 * org admin, plus one non-AI-user to demo the short pulse variant (SPEC.md §9).
 */
export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: "p-emp-marketing",
    org_id: DEMO_ORG_ID,
    label: "Mitarbeiterin Marketing",
    role: "employee",
    role_scope: "employee",
    department_id: "marketing",
    default_tools: ["chatgpt", "deepl_write"],
  },
  {
    id: "p-lead-sales",
    org_id: DEMO_ORG_ID,
    label: "Teamleiter Vertrieb",
    role: "team_lead",
    role_scope: "lead",
    department_id: "sales",
    default_tools: ["copilot365", "chatgpt"],
  },
  {
    id: "p-org-admin",
    org_id: DEMO_ORG_ID,
    label: "Geschäftsführung",
    role: "org_admin",
    role_scope: "lead",
    department_id: "management",
    default_tools: ["chatgpt"],
  },
  {
    id: "p-emp-it",
    org_id: DEMO_ORG_ID,
    label: "Mitarbeiter IT (ohne KI-Nutzung)",
    role: "employee",
    role_scope: "employee",
    department_id: "it",
    default_tools: [],
  },
];
