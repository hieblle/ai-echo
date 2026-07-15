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
  Question,
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
}

/** ISO-week format stored on responses, e.g. "2026-W29" (SPEC.md §6/§7). */
const CREATED_WEEK_PATTERN = /^\d{4}-W\d{2}$/;

export class MemoryStore implements Store {
  readonly mode: StoreMode = "memory";

  private readonly organizations: Organization[];
  private readonly departments: Department[];
  private readonly personas: DemoPersona[];
  private readonly questions: Question[];

  /** Keyed by `org_id` + `respondent_key` (never joinable with responses). */
  private readonly profiles = new Map<string, RespondentProfile>();
  private readonly responses: SurveyResponse[] = [];
  /** Monotonically increasing response id counter ("r1", "r2", ...). */
  private responseIdCounter = 0;

  constructor(seed: MemoryStoreSeed) {
    // Deep-copy the seed so later mutations by the caller cannot leak in.
    const copy = structuredClone(seed);
    this.organizations = copy.organizations;
    this.departments = copy.departments;
    this.personas = copy.personas;
    this.questions = copy.questions;
  }

  // --- Organization & catalog ---------------------------------------------

  async getOrganization(orgId: OrgId): Promise<Organization | null> {
    const org = this.findOrganization(orgId);
    return org ? structuredClone(org) : null;
  }

  async listDepartments(orgId: OrgId): Promise<Department[]> {
    return structuredClone(this.departments.filter((d) => d.org_id === orgId));
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
      if (!CREATED_WEEK_PATTERN.test(row.created_week)) {
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

  // --- Internals -------------------------------------------------------------

  private findOrganization(orgId: OrgId): Organization | undefined {
    return this.organizations.find((o) => o.id === orgId);
  }
}

function profileKey(orgId: OrgId, respondentKey: string): string {
  // NUL cannot occur in ids, so the composite key is collision-free.
  return `${orgId}\u0000${respondentKey}`;
}
