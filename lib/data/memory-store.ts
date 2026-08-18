/**
 * In-memory `Store` implementation for Phase 1–3 (CLAUDE.md rule 2 / SPEC.md §13).
 *
 * Seeded from repo data (`lib/seed/`), no database, no auth, no secrets.
 * The store owns deep copies of everything it takes in and hands out — callers
 * can never alias internal state.
 */

import type { Store, StoreMode } from "@/lib/data/store";
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

  /** Keyed by `org_id` + `respondent_key` (never joinable with responses). */
  private readonly profiles = new Map<string, RespondentProfile>();
  private readonly responses: SurveyResponse[] = [];
  /** Monotonically increasing response id counter ("r1", "r2", ...). */
  private responseIdCounter = 0;

  /** Aggregate participation numbers per cycle (Phase 2/3 demo scope). */
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

  async listResponses(orgId: OrgId): Promise<SurveyResponse[]> {
    return structuredClone(this.responses.filter((r) => r.org_id === orgId));
  }

  // --- Participation & recommendations (Phase 2 dashboard) -------------------

  async listParticipationStats(orgId: OrgId): Promise<ParticipationStat[]> {
    return structuredClone(
      this.participationStats.filter((s) => s.org_id === orgId),
    );
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
