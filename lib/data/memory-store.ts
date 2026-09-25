/**
 * In-memory `Store` implementation (CLAUDE.md rule 2 / SPEC.md §13).
 *
 * Seeded from repo data (`lib/seed/`), no database, no auth, no secrets.
 * Backs the demo routes and the unit tests. The store owns deep copies of
 * everything it takes in and hands out — callers can never alias internal
 * state.
 */

import type {
  ListCyclesOptions,
  ListResponsesOptions,
  Store,
  StoreMode,
} from "@/lib/data/store";
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

/** Seed data the MemoryStore is constructed from (deep-copied on construction). */
export interface MemoryStoreSeed {
  organizations: Organization[];
  departments: Department[];
  personas: DemoPersona[];
  questions: Question[];
  /** Configured AI tools per org (SPEC.md §6 org_settings_tools). */
  toolSettings: OrgToolSetting[];
  /** Global recommendation rules R1–R7 (SPEC.md §11) — rules are data, not code. */
  rules: RecommendationRule[];
}

/** ISO-week format used by responses and participation stats, e.g. "2026-W29". */
const ISO_WEEK_PATTERN = /^\d{4}-W\d{2}$/;

export class MemoryStore implements Store {
  readonly mode: StoreMode = "memory";

  private readonly organizations: Organization[];
  private readonly departments: Department[];
  private readonly personas: DemoPersona[];
  private readonly questions: Question[];
  private readonly toolSettings: OrgToolSetting[];
  private readonly rules: RecommendationRule[];

  private readonly memberships: Membership[] = [];
  private readonly cycles: SurveyCycle[] = [];
  private readonly participations: Participation[] = [];

  /** Keyed by `org_id` + `respondent_key` (never joinable with responses). */
  private readonly profiles = new Map<string, RespondentProfile>();
  private readonly responses: SurveyResponse[] = [];
  /** Monotonically increasing response id counter ("r1", "r2", ...). */
  private responseIdCounter = 0;

  /** Aggregate participation numbers per cycle (demo generator). */
  private readonly participationStats: ParticipationStat[] = [];
  /** Keyed by (org_id, rule_key, context) — one decision per derived card. */
  private readonly recommendationStates = new Map<string, RecommendationState>();

  constructor(seed: MemoryStoreSeed) {
    // Deep-copy the seed so later mutations by the caller cannot leak in.
    const copy = structuredClone(seed);
    this.organizations = copy.organizations;
    this.departments = copy.departments;
    this.personas = copy.personas;
    this.questions = copy.questions;
    this.toolSettings = copy.toolSettings;
    this.rules = copy.rules;
  }

  // --- Organization & catalog ---------------------------------------------

  async getOrganization(orgId: OrgId): Promise<Organization | null> {
    const org = this.findOrganization(orgId);
    return org ? structuredClone(org) : null;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    const org = this.organizations.find((o) => o.slug === slug);
    return org ? structuredClone(org) : null;
  }

  async listOrganizations(): Promise<Organization[]> {
    // `filter`/spread returns a fresh array, so sorting it is safe.
    const all = [...this.organizations];
    all.sort((a, b) => a.name.localeCompare(b.name, "de"));
    return structuredClone(all);
  }

  async listDepartments(orgId: OrgId): Promise<Department[]> {
    return structuredClone(this.departments.filter((d) => d.org_id === orgId));
  }

  async listToolSettings(orgId: OrgId): Promise<OrgToolSetting[]> {
    // Active AND inactive — callers filter (e.g. ROI only counts active ones).
    return structuredClone(this.toolSettings.filter((t) => t.org_id === orgId));
  }

  async listQuestions(templateKey: TemplateKey): Promise<Question[]> {
    const matching = this.questions.filter(
      (q) => q.template_key === templateKey && q.active,
    );
    // `filter` already returned a fresh array, so sorting it is safe.
    matching.sort((a, b) => a.sort_order - b.sort_order);
    return structuredClone(matching);
  }

  async listPersonas(orgId: OrgId): Promise<DemoPersona[]> {
    return structuredClone(this.personas.filter((p) => p.org_id === orgId));
  }

  async setFormOfAddress(orgId: OrgId, form: FormOfAddress): Promise<void> {
    const org = this.findOrganization(orgId);
    if (!org) {
      throw new Error(`setFormOfAddress: unknown org_id "${orgId}"`);
    }
    org.form_of_address = form;
  }

  // --- Org setup (flow F1) ---------------------------------------------------

  async createOrganization(org: Omit<Organization, "id">): Promise<Organization> {
    if (this.organizations.some((o) => o.slug === org.slug)) {
      throw new Error(`createOrganization: slug "${org.slug}" already exists`);
    }
    const created: Organization = { ...structuredClone(org), id: newId() };
    this.organizations.push(created);
    return structuredClone(created);
  }

  async updateOrganization(orgId: OrgId, patch: OrganizationPatch): Promise<void> {
    const org = this.findOrganization(orgId);
    if (!org) throw new Error(`updateOrganization: unknown org_id "${orgId}"`);
    if (
      patch.k_anonymity_min !== undefined &&
      patch.k_anonymity_min < org.k_anonymity_min
    ) {
      // SPEC §7.2: the threshold is only ever raiseable.
      throw new Error("updateOrganization: k_anonymity_min can only be raised");
    }
    Object.assign(org, structuredClone(patch));
  }

  async createDepartment(orgId: OrgId, name: string): Promise<Department> {
    if (!this.findOrganization(orgId)) {
      throw new Error(`createDepartment: unknown org_id "${orgId}"`);
    }
    const existing = this.departments.find(
      (d) => d.org_id === orgId && d.name === name,
    );
    if (existing) return structuredClone(existing);
    const created: Department = { id: newId(), org_id: orgId, name };
    this.departments.push(created);
    return structuredClone(created);
  }

  async deleteDepartment(orgId: OrgId, departmentId: string): Promise<void> {
    const index = this.departments.findIndex(
      (d) => d.org_id === orgId && d.id === departmentId,
    );
    if (index >= 0) this.departments.splice(index, 1);
    for (const m of this.memberships) {
      if (m.org_id === orgId && m.department_id === departmentId) {
        m.department_id = null;
      }
    }
  }

  async upsertToolSetting(
    setting: Omit<OrgToolSetting, "id">,
  ): Promise<OrgToolSetting> {
    if (!this.findOrganization(setting.org_id)) {
      throw new Error(`upsertToolSetting: unknown org_id "${setting.org_id}"`);
    }
    const existing = this.toolSettings.find(
      (t) => t.org_id === setting.org_id && t.tool_value === setting.tool_value,
    );
    if (existing) {
      Object.assign(existing, structuredClone(setting));
      return structuredClone(existing);
    }
    const created: OrgToolSetting = { ...structuredClone(setting), id: newId() };
    this.toolSettings.push(created);
    return structuredClone(created);
  }

  async deleteToolSetting(orgId: OrgId, toolValue: string): Promise<void> {
    const index = this.toolSettings.findIndex(
      (t) => t.org_id === orgId && t.tool_value === toolValue,
    );
    if (index >= 0) this.toolSettings.splice(index, 1);
  }

  // --- Memberships -------------------------------------------------------------

  async listMemberships(orgId: OrgId): Promise<Membership[]> {
    return structuredClone(this.memberships.filter((m) => m.org_id === orgId));
  }

  async listMembershipsByUser(userId: string): Promise<Membership[]> {
    return structuredClone(
      this.memberships.filter((m) => m.user_id === userId),
    );
  }

  async getMembership(membershipId: string): Promise<Membership | null> {
    const m = this.memberships.find((x) => x.id === membershipId);
    return m ? structuredClone(m) : null;
  }

  async createMembership(membership: NewMembership): Promise<Membership> {
    if (!this.findOrganization(membership.org_id)) {
      throw new Error(`createMembership: unknown org_id "${membership.org_id}"`);
    }
    if (
      this.memberships.some(
        (m) =>
          m.org_id === membership.org_id && m.user_id === membership.user_id,
      )
    ) {
      throw new Error("createMembership: user is already a member of this org");
    }
    const created: Membership = { ...structuredClone(membership), id: newId() };
    this.memberships.push(created);
    return structuredClone(created);
  }

  async updateMembership(
    membershipId: string,
    patch: MembershipPatch,
  ): Promise<void> {
    const m = this.memberships.find((x) => x.id === membershipId);
    if (!m) throw new Error(`updateMembership: unknown id "${membershipId}"`);
    Object.assign(m, structuredClone(patch));
  }

  // --- Survey cycles & participations ------------------------------------------

  async listCycles(
    orgId: OrgId,
    options: ListCyclesOptions = {},
  ): Promise<SurveyCycle[]> {
    const rows = this.cycles.filter(
      (c) =>
        c.org_id === orgId &&
        (options.status === undefined || c.status === options.status) &&
        (options.template_key === undefined ||
          c.template_key === options.template_key),
    );
    rows.sort((a, b) => a.week.localeCompare(b.week));
    return structuredClone(rows);
  }

  async getCycle(cycleId: string): Promise<SurveyCycle | null> {
    const c = this.cycles.find((x) => x.id === cycleId);
    return c ? structuredClone(c) : null;
  }

  async ensureCycle(cycle: NewSurveyCycle): Promise<SurveyCycle> {
    if (!this.findOrganization(cycle.org_id)) {
      throw new Error(`ensureCycle: unknown org_id "${cycle.org_id}"`);
    }
    if (!ISO_WEEK_PATTERN.test(cycle.week)) {
      throw new Error(`ensureCycle: invalid week "${cycle.week}"`);
    }
    const existing = this.cycles.find(
      (c) =>
        c.org_id === cycle.org_id &&
        c.template_key === cycle.template_key &&
        c.week === cycle.week,
    );
    if (existing) return structuredClone(existing);
    const created: SurveyCycle = { ...structuredClone(cycle), id: newId() };
    this.cycles.push(created);
    return structuredClone(created);
  }

  async updateCycle(cycleId: string, patch: CyclePatch): Promise<void> {
    const c = this.cycles.find((x) => x.id === cycleId);
    if (!c) throw new Error(`updateCycle: unknown id "${cycleId}"`);
    Object.assign(c, structuredClone(patch));
  }

  async listParticipations(cycleId: string): Promise<Participation[]> {
    return structuredClone(
      this.participations.filter((p) => p.cycle_id === cycleId),
    );
  }

  async listParticipationsByMembership(
    membershipId: string,
  ): Promise<Participation[]> {
    return structuredClone(
      this.participations.filter((p) => p.membership_id === membershipId),
    );
  }

  async addParticipations(rows: NewParticipation[]): Promise<void> {
    for (const row of rows) {
      const exists = this.participations.some(
        (p) =>
          p.cycle_id === row.cycle_id && p.membership_id === row.membership_id,
      );
      if (exists) continue;
      this.participations.push({ ...structuredClone(row), id: newId() });
    }
  }

  async completeParticipation(
    cycleId: string,
    membershipId: string,
    completedAt: string,
  ): Promise<boolean> {
    const p = this.participations.find(
      (x) => x.cycle_id === cycleId && x.membership_id === membershipId,
    );
    if (!p) {
      this.participations.push({
        id: newId(),
        cycle_id: cycleId,
        membership_id: membershipId,
        status: "completed",
        completed_at: completedAt,
      });
      return true;
    }
    if (p.status === "completed") return false;
    p.status = "completed";
    p.completed_at = completedAt;
    return true;
  }

  // --- Respondent profile (NEVER joinable with responses) ------------------

  async getProfile(
    orgId: OrgId,
    respondentKey: string,
  ): Promise<RespondentProfile | null> {
    const profile = this.profiles.get(profileKey(orgId, respondentKey));
    return profile ? structuredClone(profile) : null;
  }

  async saveProfile(profile: RespondentProfile): Promise<void> {
    this.profiles.set(
      profileKey(profile.org_id, profile.respondent_key),
      structuredClone(profile),
    );
  }

  // --- Responses ------------------------------------------------------------

  /**
   * Persist a completed survey atomically — all rows or none
   * (SPEC.md §9: aborting a survey stores nothing partial).
   */
  async submitResponses(responses: NewSurveyResponse[]): Promise<void> {
    // Phase 1: validate EVERY row first — nothing is stored on any error.
    if (responses.length === 0) {
      throw new Error("submitResponses: empty submission");
    }
    for (const row of responses) {
      if (!this.findOrganization(row.org_id)) {
        throw new Error(`submitResponses: unknown org_id "${row.org_id}"`);
      }
      if (row.question_code === "") {
        throw new Error("submitResponses: empty question_code");
      }
      if (!ISO_WEEK_PATTERN.test(row.created_week)) {
        throw new Error(
          `submitResponses: invalid created_week "${row.created_week}" (expected e.g. "2026-W29")`,
        );
      }
    }

    // Phase 2: append all rows with deterministic sequential ids.
    for (const row of responses) {
      this.responseIdCounter += 1;
      this.responses.push(
        structuredClone({ ...row, id: `r${this.responseIdCounter}` }),
      );
    }
  }

  async listResponses(
    orgId: OrgId,
    options: ListResponsesOptions = {},
  ): Promise<SurveyResponse[]> {
    const weeks = options.weeks ? new Set(options.weeks) : null;
    return structuredClone(
      this.responses.filter(
        (r) => r.org_id === orgId && (!weeks || weeks.has(r.created_week)),
      ),
    );
  }

  // --- Participation aggregates & recommendations ------------------------------

  async listParticipationStats(orgId: OrgId): Promise<ParticipationStat[]> {
    const fromDemo = this.participationStats.filter((s) => s.org_id === orgId);
    // Real cycles (memberships + participations) aggregate to the same shape.
    const fromCycles = this.cycles
      .filter((c) => c.org_id === orgId)
      .map((c) => {
        const rows = this.participations.filter((p) => p.cycle_id === c.id);
        return {
          org_id: c.org_id,
          cycle_id: c.id,
          template_key: c.template_key,
          week: c.week,
          invited: rows.length,
          completed: rows.filter((p) => p.status === "completed").length,
        } satisfies ParticipationStat;
      })
      .filter((s) => s.invited > 0);
    return structuredClone([...fromDemo, ...fromCycles]);
  }

  /**
   * Append cycle participation aggregates atomically — like `submitResponses`,
   * every entry is validated first; nothing is stored on any error.
   */
  async addParticipationStats(stats: ParticipationStat[]): Promise<void> {
    if (stats.length === 0) {
      throw new Error("addParticipationStats: empty batch");
    }
    for (const stat of stats) {
      if (!this.findOrganization(stat.org_id)) {
        throw new Error(
          `addParticipationStats: unknown org_id "${stat.org_id}"`,
        );
      }
      if (stat.cycle_id === "") {
        throw new Error("addParticipationStats: empty cycle_id");
      }
      if (!ISO_WEEK_PATTERN.test(stat.week)) {
        throw new Error(
          `addParticipationStats: invalid week "${stat.week}" (expected e.g. "2026-W29")`,
        );
      }
      // `!(x >= 0)` (not `x < 0`) so NaN is rejected too.
      if (!(stat.invited >= 0)) {
        throw new Error(
          `addParticipationStats: invited must be >= 0, got ${stat.invited}`,
        );
      }
      if (!(stat.completed >= 0)) {
        throw new Error(
          `addParticipationStats: completed must be >= 0, got ${stat.completed}`,
        );
      }
      if (stat.completed > stat.invited) {
        throw new Error(
          `addParticipationStats: completed (${stat.completed}) exceeds invited (${stat.invited})`,
        );
      }
    }

    for (const stat of stats) {
      this.participationStats.push(structuredClone(stat));
    }
  }

  async listRules(): Promise<RecommendationRule[]> {
    const active = this.rules.filter((r) => r.active);
    // `filter` already returned a fresh array, so sorting it is safe.
    active.sort((a, b) => a.key.localeCompare(b.key, "de"));
    return structuredClone(active);
  }

  async listRecommendationStates(orgId: OrgId): Promise<RecommendationState[]> {
    return structuredClone(
      [...this.recommendationStates.values()].filter(
        (s) => s.org_id === orgId,
      ),
    );
  }

  /** Upsert one decision, keyed by (org_id, rule_key, context). */
  async setRecommendationState(state: RecommendationState): Promise<void> {
    if (!this.findOrganization(state.org_id)) {
      throw new Error(
        `setRecommendationState: unknown org_id "${state.org_id}"`,
      );
    }
    if (state.rule_key === "") {
      throw new Error("setRecommendationState: empty rule_key");
    }
    // `context` may legitimately be "" (rules without a discriminator).
    this.recommendationStates.set(
      recommendationStateKey(state.org_id, state.rule_key, state.context),
      structuredClone(state),
    );
  }

  // --- Internals -------------------------------------------------------------

  private findOrganization(orgId: OrgId): Organization | undefined {
    return this.organizations.find((o) => o.id === orgId);
  }
}

function newId(): string {
  return crypto.randomUUID();
}

function profileKey(orgId: OrgId, respondentKey: string): string {
  // NUL cannot occur in ids, so the composite key is collision-free.
  return `${orgId}\u0000${respondentKey}`;
}

function recommendationStateKey(
  orgId: OrgId,
  ruleKey: string,
  context: string,
): string {
  // NUL cannot occur in ids/keys, so the composite key is collision-free.
  return `${orgId}\u0000${ruleKey}\u0000${context}`;
}
