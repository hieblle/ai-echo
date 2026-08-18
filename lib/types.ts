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

/** The four weekly pulse dimensions the rotation must cover (SPEC.md §9). */
export const WEEKLY_DIMENSIONS = [
  "adoption",
  "efficiency",
  "trust",
  "sentiment",
] as const satisfies readonly Dimension[];
export type WeeklyDimension = (typeof WEEKLY_DIMENSIONS)[number];

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

// --- Question options (the questionnaire is data, not code) ---------------

/** One selectable option of a choice question. */
export interface Choice {
  /** Stable value stored in answers, e.g. "daily" or "chatgpt". */
  value: string;
  /** Du-form label (default). */
  label: string;
  /** Sie-form label; falls back to `label` when omitted. */
  label_sie?: string;
  /** Selecting this clears all others (e.g. O2 "Aktuell keine", M3.2 "Kein Bedarf"). */
  exclusive?: boolean;
  /** This option carries an inline free-text field ("Andere: ____", "Ja → Welches?"). */
  allows_text?: boolean;
}

export type QuestionOptions =
  | {
      kind: "choices";
      choices: Choice[];
      /**
       * Optional scale follow-up shown when `on_value` is selected
       * (M3.3 "Wie hilfreich war er?" 1–10).
       */
      followup_scale?: {
        on_value: string;
        text: string;
        text_sie?: string;
      };
    }
  | {
      kind: "scale";
      min: number;
      max: number;
      /** Anchor label at the minimum, e.g. "Anfänger". */
      min_label: string;
      max_label: string;
      min_label_sie?: string;
      max_label_sie?: string;
    }
  | { kind: "number"; unit: string | null; min?: number }
  | { kind: "text"; placeholder?: string; placeholder_sie?: string }
  /** Tool rows come from the respondent's profile (O2), never from the seed. */
  | { kind: "tool_matrix" };

/** Conditional display logic (SPEC.md §9). */
export interface QuestionCondition {
  /**
   * Question only makes sense for respondents with at least one tool from O2;
   * choice/matrix rows are narrowed to `profile.tools_used`.
   */
  requires_tool?: boolean;
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
  options: QuestionOptions | null;
  condition: QuestionCondition | null;
  /** Code of the mirrored leadership/employee question for gap analysis. */
  is_gap_pair_with: string | null;
  sort_order: number;
  active: boolean;
}

// --- Answers ---------------------------------------------------------------

/**
 * The typed answer payload stored in `responses.answer`.
 * Discriminated so the runner, validation (Zod) and later KPI code agree.
 */
export type AnswerValue =
  | {
      kind: "choice";
      value: string;
      /** Inline text for `allows_text` options ("Ja → Welches?"). */
      text?: string;
      /** Value of a `followup_scale` (M3.3). */
      scale?: number;
    }
  | { kind: "choices"; values: string[]; other_text?: string }
  | { kind: "scale"; value: number }
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | {
      kind: "tool_matrix";
      tools: { tool: string; usefulness: number; uses_per_week: number }[];
    };

// --- Core entities ---------------------------------------------------------

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
  answer: AnswerValue;
  /** ISO week, e.g. "2026-W29" — no timestamp. */
  created_week: string;
}

/** A response before the store assigns its id. */
export type NewSurveyResponse = Omit<SurveyResponse, "id">;

/**
 * Per-respondent survey state (SPEC.md §6 `respondent_profiles`).
 *
 * Phase 1–3: keyed by demo persona. Phase 4 replaces the key with the
 * pseudonym token; the shape stays. NEVER joined with `responses`.
 */
export interface RespondentProfile {
  /** Demo persona id (Phase 1–3); pseudonym token from Phase 4. */
  respondent_key: string;
  org_id: OrgId;
  department_id: DepartmentId | null;
  role_scope: RoleScope;
  /** Tool values chosen in O2 (empty when none / not yet onboarded). */
  tools_used: string[];
  /** O2 "Aktuell keine" → short pulse variant W1.1 + W4.1 + W4.2 (SPEC.md §9). */
  uses_no_tools: boolean;
  /** O3 value (usage duration), for later segmentation. */
  ai_experience: string | null;
  /** Weekly questions served last, for the rotation's no-repeat rule. */
  question_history: { week: string; codes: string[] } | null;
  onboarding_completed: boolean;
  /**
   * Cycle ids this respondent already completed (e.g. "weekly-2026-W29") —
   * duplicate-submission guard; Phase 4 replaces this with `participations`.
   */
  completed_cycles: string[];
}

/** A configured AI tool of an org with its license cost (SPEC.md §6). */
export interface OrgToolSetting {
  id: string;
  org_id: OrgId;
  /** Tool value from the O2 catalog (e.g. "copilot365"). */
  tool_value: string;
  tool_label: string;
  monthly_license_cost_eur: number;
  active: boolean;
}

/**
 * Aggregate participation numbers per cycle (Phase 2/3 demo scope).
 * Phase 4 replaces this with per-person `participations` rows — the dashboard
 * only ever needs the ratio, which keeps the demo free of fake person records.
 */
export interface ParticipationStat {
  org_id: OrgId;
  cycle_id: string;
  template_key: TemplateKey;
  /** ISO week the cycle belongs to, e.g. "2026-W29". */
  week: string;
  invited: number;
  completed: number;
}

export type RecommendationStatus = "open" | "done" | "dismissed";

/** A recommendation rule (SPEC.md §11 R1–R7) — rules are data, not code. */
export interface RecommendationRule {
  key: string;
  title: string;
  description: string;
  action_type: "course" | "strategy_call" | "license_review" | "communication";
  course_url: string | null;
  active: boolean;
}

/**
 * Persisted status override for a DERIVED recommendation. Recommendations
 * themselves are recomputed from the data on every evaluation (regelbasiert);
 * only the org_admin's done/dismissed decision is stored, keyed by rule and
 * context — no duplicate-row bookkeeping needed.
 */
export interface RecommendationState {
  org_id: OrgId;
  rule_key: string;
  /** Discriminator when one rule fires per tool/pair/topic; "" when none. */
  context: string;
  status: RecommendationStatus;
}

// --- Domain result types (contract between kpi.ts, triggers.ts and the UI) --

/** Weekly KPI snapshot (SPEC.md §10). Null = no data for that metric/week. */
export interface WeeklyKpis {
  week: string;
  /** Respondent proxy: max answers a single question got this week. */
  n_pulse: number;
  /**
   * Number of W1.1 answers this week. Weeks where the rotation did not draw
   * W1.1 only carry the short-variant answers of non-users — a thin, biased
   * sample. Consumers must not treat weeks with n_adoption below
   * WEEKLY_ADOPTION_MIN_SAMPLE as adoption evidence.
   */
  n_adoption: number;
  /** Share of W1.1 answers with usage >= "1–2 mal" (0..1). */
  adoption_rate: number | null;
  /** Share of "Täglich" + "Mehrmals täglich" (0..1). */
  power_user_share: number | null;
  /** Sum of W2.1 class midpoints (hours) this week. */
  saved_hours_sum: number;
  efficiency_index: number | null;
  trust_index: number | null;
  sentiment_index: number | null;
  /** completed ÷ invited of this week's weekly cycle. */
  participation_rate: number | null;
}

/** ROI tile numbers (SPEC.md §10). */
export interface RoiSnapshot {
  /** Conservative: sum of reported saved hours in the window. */
  saved_hours: number;
  /** Secondary value: extrapolated to non-participants via participation. */
  saved_hours_extrapolated: number | null;
  gross_savings_eur: number;
  license_costs_eur: number;
  net_savings_eur: number;
  /** null when license costs are 0. */
  roi_multiple: number | null;
}

export type GapPairKey = "strategy" | "competence" | "benefit";

/** One mirrored perception-gap pair (SPEC.md §10). */
export interface GapPairResult {
  pair: GapPairKey;
  employee_value: number | null;
  leadership_value: number | null;
  /** leadership − employee; positive = Führung optimistischer. */
  gap: number | null;
  n_employee: number;
  n_leadership: number;
}

/** One heatmap cell (departments × weekly dimensions), k-anonymity aware. */
export interface HeatmapCell {
  /** null = org total. */
  department_id: DepartmentId | null;
  dimension: WeeklyDimension;
  /** 0..10 (adoption share scaled ×10); null when suppressed or no data. */
  value: number | null;
  /** Respondent proxy behind the cell (for display: "n < k" when suppressed). */
  n: number;
  suppressed: boolean;
}

/** Share of pulse respondents naming a tool as most-used (W1.2). */
export interface ToolUsageStat {
  tool_value: string;
  mentions: number;
  total: number;
  /** mentions ÷ total; null when total = 0. */
  share: number | null;
}

/** Share of M3.2 answers wishing training on a topic. */
export interface TrainingWishStat {
  topic: string;
  count: number;
  total: number;
  share: number;
}

/** A rule that fired during evaluation (before status overrides). */
export interface TriggeredRecommendation {
  rule_key: string;
  /** Discriminator (tool value, gap pair key, topic); "" when none. */
  context: string;
  /** German sentence describing the concrete finding, for the card. */
  detail: string;
}

/**
 * A selectable demo identity for the prototype's role switcher
 * (SPEC.md §13 Phase 1 — "Demo-Modus statt Login").
 */
export interface DemoPersona {
  id: string;
  org_id: OrgId;
  /** Dropdown label, e.g. "Mitarbeiterin Marketing". */
  label: string;
  role: Role;
  role_scope: RoleScope;
  department_id: DepartmentId;
  /** Pre-seeded O2 tool values so weekly/monthly are playable immediately. */
  default_tools: string[];
}
