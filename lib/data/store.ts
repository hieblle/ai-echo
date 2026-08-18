/**
 * Data-access interface (CLAUDE.md architecture rule 2 / SPEC.md §5, §13).
 *
 * The UI and the pure domain layer only ever talk to this `Store` interface —
 * never to a concrete backend. This keeps the migration to persistence a
 * drop-in change:
 *
 *   - Phase 1–3: `MemoryStore` (lib/data/memory-store.ts) — in-memory, seeded
 *     from `lib/seed/` (repo data, no database, no auth, no secrets).
 *   - Phase 4:   `SupabaseStore` — implements the same interface; UI and domain
 *     stay unchanged.
 *
 * Anonymity invariant (SPEC.md §7): `submitResponses` accepts rows WITHOUT any
 * respondent key — the store must never be able to join responses back to a
 * person. Profile updates travel separately via `saveProfile`.
 */

import type {
  DemoPersona,
  Department,
  FormOfAddress,
  NewSurveyResponse,
  OrgId,
  Organization,
  OrgToolSetting,
  ParticipationStat,
  Question,
  RecommendationRule,
  RecommendationState,
  RespondentProfile,
  SurveyResponse,
  TemplateKey,
} from "@/lib/types";

export type StoreMode = "memory" | "supabase";

export interface Store {
  /** Which backend implements this store; `memory` until Phase 4. */
  readonly mode: StoreMode;

  // --- Organization & catalog ------------------------------------------

  getOrganization(orgId: OrgId): Promise<Organization | null>;
  getOrganizationBySlug(slug: string): Promise<Organization | null>;
  listOrganizations(): Promise<Organization[]>;
  listDepartments(orgId: OrgId): Promise<Department[]>;
  /** Configured AI tools with license costs (SPEC.md §6 org_settings_tools). */
  listToolSettings(orgId: OrgId): Promise<OrgToolSetting[]>;
  /** Active questions of a template, ordered by sort_order. */
  listQuestions(templateKey: TemplateKey): Promise<Question[]>;
  /** Demo identities for the prototype's role switcher (Phase 1–3 only). */
  listPersonas(orgId: OrgId): Promise<DemoPersona[]>;
  /** Demo-only toggle for the Du/Sie org setting (SPEC.md §14). */
  setFormOfAddress(orgId: OrgId, form: FormOfAddress): Promise<void>;

  // --- Respondent profile (NEVER joinable with responses) ----------------

  getProfile(
    orgId: OrgId,
    respondentKey: string,
  ): Promise<RespondentProfile | null>;
  saveProfile(profile: RespondentProfile): Promise<void>;

  // --- Responses ----------------------------------------------------------

  /**
   * Persist a completed survey atomically — all rows or none
   * (SPEC.md §9: "Abbruch speichert nichts Halbes").
   */
  submitResponses(responses: NewSurveyResponse[]): Promise<void>;
  /** All stored responses of an org (dev/demo introspection; Phase 2 KPIs). */
  listResponses(orgId: OrgId): Promise<SurveyResponse[]>;

  // --- Participation & recommendations (Phase 2 dashboard) ---------------

  listParticipationStats(orgId: OrgId): Promise<ParticipationStat[]>;
  /** Append cycle participation aggregates (demo generator, Phase 2/3). */
  addParticipationStats(stats: ParticipationStat[]): Promise<void>;
  /** Active recommendation rules R1–R7 (global seed, SPEC.md §11). */
  listRules(): Promise<RecommendationRule[]>;
  /** Persisted done/dismissed decisions for derived recommendations. */
  listRecommendationStates(orgId: OrgId): Promise<RecommendationState[]>;
  /** Upsert one decision, keyed by (org_id, rule_key, context). */
  setRecommendationState(state: RecommendationState): Promise<void>;
}
