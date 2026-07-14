/**
 * Core domain types for the KI-Barometer.
 *
 * Derived from the data model in SPEC.md §6. Every tenant-scoped entity carries
 * `org_id` from day one (CLAUDE.md architecture rule 6 / SPEC.md §5) — even
 * though tenant isolation is only enforced via RLS from Phase 4 onwards.
 *
 * These types are shared across the pure domain layer (`lib/domain/`), the data
 * layer (`lib/data/`) and the UI. They are intentionally IO-free.
 */

// --- Identifiers ---------------------------------------------------------

export type OrgId = string;
export type DepartmentId = string;

// --- Enums (SPEC.md §6) --------------------------------------------------

export type Role = "platform_admin" | "org_admin" | "team_lead" | "employee";

/** Which survey a template/cycle belongs to (SPEC.md §6, §9). */
export type TemplateKey = "onboarding" | "weekly" | "monthly" | "leadership";

/** Question dimensions used for KPI aggregation and weekly rotation. */
export type Dimension =
  | "adoption"
  | "efficiency"
  | "trust"
  | "sentiment"
  | "roi"
  | "tools"
  | "learning"
  | "culture"
  | "strategy"
  | "nps"
  | "meta";

export type QuestionType =
  | "single_choice"
  | "multi_choice"
  | "scale_1_10"
  | "scale_minus5_plus5"
  | "scale_0_10"
  | "number"
  | "currency"
  | "text_optional"
  | "tool_matrix";

/** Form of address per org — Du (default) or Sie (SPEC.md §14, CLAUDE.md). */
export type FormOfAddress = "du" | "sie";

/** Scope a response/profile belongs to, kept separate from the concrete role. */
export type RoleScope = "employee" | "lead";

// --- Core entities (subset established in Phase 0, extended per phase) ----

export interface Organization {
  id: OrgId;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  hourly_rate_default: number;
  locale: "de";
  form_of_address: FormOfAddress;
  /** k-anonymity threshold, default 5, only raiseable per org (SPEC.md §7). */
  k_anonymity_min: number;
  is_demo: boolean;
}

export interface Department {
  id: DepartmentId;
  org_id: OrgId;
  name: string;
}

/** A questionnaire item. The questionnaire is data, not code (CLAUDE.md rule 3). */
export interface Question {
  id: string;
  template_key: TemplateKey;
  /** Stable question code, e.g. "W1.1", "O2", "F6" (SPEC.md §12). */
  code: string;
  dimension: Dimension;
  type: QuestionType;
  /** Du-form text (default). */
  text: string;
  /** Sie-form variant; falls back to `text` when null (CLAUDE.md rule 3). */
  text_sie: string | null;
  options: unknown | null;
  /** Conditional logic, e.g. { requires_tool: true } (SPEC.md §9). */
  condition: unknown | null;
  /** Code of the mirrored leadership/employee question for gap analysis. */
  is_gap_pair_with: string | null;
  sort_order: number;
  active: boolean;
}

/**
 * A single answer. Deliberately carries NO user/membership/pseudonym link and
 * only the ISO week — never an exact timestamp (SPEC.md §6, §7 anonymity).
 */
export interface SurveyResponse {
  id: string;
  org_id: OrgId;
  cycle_id: string;
  department_id: DepartmentId | null;
  role_scope: RoleScope;
  question_code: string;
  answer: unknown;
  /** ISO week, e.g. "2026-W29" — no timestamp. */
  created_week: string;
}
