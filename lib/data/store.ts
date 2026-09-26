/**
 * Data-access interface (CLAUDE.md architecture rule 2 / SPEC.md §5, §13).
 *
 * The UI and the pure domain layer only ever talk to this `Store` interface —
 * never to a concrete backend:
 *
 *   - `MemoryStore` (lib/data/memory-store.ts) — in-memory, seeded from
 *     `lib/seed/`. Backs the demo routes (Phase 1–3 prototype, kept as the
 *     sales demo) and the unit tests.
 *   - `SupabaseStore` (lib/data/supabase-store.ts) — Postgres via Supabase,
 *     backs the real product routes from Phase 4. UI and domain are unchanged.
 *
 * Anonymity invariant (SPEC.md §7): `submitResponses` accepts rows WITHOUT any
 * respondent key — the store must never be able to join responses back to a
 * person. Profile updates travel separately via `saveProfile`; who took part
 * lives in `participations`, which shares no key with responses.
 */

import type {
  CyclePatch,
  DemoPersona,
  Department,
  FormOfAddress,
  Membership,
  MembershipPatch,
  NewMembership,
  NewParticipation,
  NewSurveyCycle,
  NewSurveyResponse,
  OrgId,
  Organization,
  OrganizationPatch,
  OrgToolSetting,
  Participation,
  ParticipationStat,
  Question,
  RecommendationRule,
  RecommendationState,
  RespondentProfile,
  SurveyCycle,
  SurveyResponse,
  TemplateKey,
} from "@/lib/types";

export type StoreMode = "memory" | "supabase";

export interface ListResponsesOptions {
  /** Restrict to these ISO weeks (D3.3: keeps the read bounded). */
  weeks?: readonly string[];
}

export interface ListCyclesOptions {
  status?: SurveyCycle["status"];
  template_key?: TemplateKey;
}

export interface Store {
  /** Which backend implements this store. */
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
  /** Demo identities for the prototype's role switcher (empty outside demo). */
  listPersonas(orgId: OrgId): Promise<DemoPersona[]>;
  /** Du/Sie org setting (SPEC.md §14). */
  setFormOfAddress(orgId: OrgId, form: FormOfAddress): Promise<void>;

  // --- Org setup (flow F1, platform_admin) --------------------------------

  createOrganization(org: Omit<Organization, "id">): Promise<Organization>;
  updateOrganization(orgId: OrgId, patch: OrganizationPatch): Promise<void>;
  createDepartment(orgId: OrgId, name: string): Promise<Department>;
  deleteDepartment(orgId: OrgId, departmentId: string): Promise<void>;
  /** Insert or update by (org_id, tool_value). */
  upsertToolSetting(
    setting: Omit<OrgToolSetting, "id">,
  ): Promise<OrgToolSetting>;
  deleteToolSetting(orgId: OrgId, toolValue: string): Promise<void>;

  // --- Memberships (the only user link; flow F2) --------------------------

  listMemberships(orgId: OrgId): Promise<Membership[]>;
  listMembershipsByUser(userId: string): Promise<Membership[]>;
  getMembership(membershipId: string): Promise<Membership | null>;
  /** Fails on an existing (org_id, user_id) pair. */
  createMembership(membership: NewMembership): Promise<Membership>;
  updateMembership(membershipId: string, patch: MembershipPatch): Promise<void>;

  // --- Survey cycles & participations (flow F3/F4) ------------------------

  listCycles(orgId: OrgId, options?: ListCyclesOptions): Promise<SurveyCycle[]>;
  getCycle(cycleId: string): Promise<SurveyCycle | null>;
  /**
   * Create the cycle, or return the existing one for the same
   * (org_id, template_key, week) — cron runs must be idempotent.
   */
  ensureCycle(cycle: NewSurveyCycle): Promise<SurveyCycle>;
  updateCycle(cycleId: string, patch: CyclePatch): Promise<void>;
  listParticipations(cycleId: string): Promise<Participation[]>;
  listParticipationsByMembership(membershipId: string): Promise<Participation[]>;
  /** Insert rows; existing (cycle_id, membership_id) pairs are left untouched. */
  addParticipations(rows: NewParticipation[]): Promise<void>;
  /**
   * Mark a participation completed. Returns false when it was already
   * completed (duplicate-submission guard: "einmal pro Zyklus").
   */
  completeParticipation(
    cycleId: string,
    membershipId: string,
    completedAt: string,
  ): Promise<boolean>;

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
  /** Stored responses of an org, optionally limited to some ISO weeks. */
  listResponses(
    orgId: OrgId,
    options?: ListResponsesOptions,
  ): Promise<SurveyResponse[]>;

  // --- Participation aggregates & recommendations (dashboard) --------------

  /** invited/completed per cycle — derived from participations or demo data. */
  listParticipationStats(orgId: OrgId): Promise<ParticipationStat[]>;
  /** Append cycle participation aggregates (demo generator only). */
  addParticipationStats(stats: ParticipationStat[]): Promise<void>;
  /** Active recommendation rules R1–R7 (global seed, SPEC.md §11). */
  listRules(): Promise<RecommendationRule[]>;
  /** Persisted done/dismissed decisions for derived recommendations. */
  listRecommendationStates(orgId: OrgId): Promise<RecommendationState[]>;
  /** Upsert one decision, keyed by (org_id, rule_key, context). */
  setRecommendationState(state: RecommendationState): Promise<void>;
}
