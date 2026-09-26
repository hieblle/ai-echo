/**
 * Supabase-backed `Store` (Phase 4, CLAUDE.md rule 2 / SPEC.md §13).
 *
 * Runs with the project's SECRET key (`sb_secret_…`, the successor of the
 * service_role JWT) and is therefore server-only: it bypasses Row Level
 * Security, and tenant scoping is the caller's job (every method takes the
 * org id it may touch; the server layer derives that id from a verified
 * membership — DECISIONS D4.3). Raw responses never leave the server: the
 * dashboard service aggregates them k-anonymously.
 *
 * Questions and recommendation rules stay versioned in the repo and are
 * handed in at construction (DECISIONS D4.1); everything else lives in
 * Postgres (supabase/migrations).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ListCyclesOptions,
  ListResponsesOptions,
  Store,
  StoreMode,
} from "@/lib/data/store";
import type {
  AnswerValue,
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

export interface SupabaseStoreOptions {
  url: string;
  /** `sb_secret_…` (or a legacy service_role JWT). Never ships to a browser. */
  secretKey: string;
  questions: Question[];
  rules: RecommendationRule[];
  /** Injected client (tests); created from url + key when omitted. */
  client?: SupabaseClient;
}

/** PostgREST caps a single select at 1000 rows — always page. */
const PAGE_SIZE = 1000;

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  hourly_rate_default: number | string;
  form_of_address: FormOfAddress;
  k_anonymity_min: number;
  is_demo: boolean;
}

interface ToolSettingRow {
  id: string;
  org_id: string;
  tool_value: string;
  tool_label: string;
  monthly_license_cost_eur: number | string;
  active: boolean;
}

interface CycleRow {
  id: string;
  org_id: string;
  template_key: TemplateKey;
  iso_week: string;
  period_start: string;
  period_end: string;
  status: SurveyCycle["status"];
  reminder_sent_at: string | null;
}

interface ProfileRow {
  org_id: string;
  respondent_key: string;
  department_id: string | null;
  role_scope: RespondentProfile["role_scope"];
  tools_used: string[];
  uses_no_tools: boolean;
  ai_experience: string | null;
  question_history: RespondentProfile["question_history"];
  onboarding_completed: boolean;
}

interface ResponseRow {
  id: string;
  org_id: string;
  cycle_id: string;
  department_id: string | null;
  role_scope: SurveyResponse["role_scope"];
  question_code: string;
  answer: AnswerValue;
  created_week: string;
}

interface ParticipationStatRow {
  org_id: string;
  cycle_id: string;
  template_key: TemplateKey;
  week: string;
  invited: number;
  completed: number;
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function unwrap<T>(result: QueryResult<T>, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${what}: no data returned`);
  return result.data;
}

function unwrapMaybe<T>(result: QueryResult<T>, what: string): T | null {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo_url: row.logo_url,
    primary_color: row.primary_color,
    hourly_rate_default: Number(row.hourly_rate_default),
    locale: "de",
    form_of_address: row.form_of_address,
    k_anonymity_min: row.k_anonymity_min,
    is_demo: row.is_demo,
  };
}

function mapToolSetting(row: ToolSettingRow): OrgToolSetting {
  return {
    id: row.id,
    org_id: row.org_id,
    tool_value: row.tool_value,
    tool_label: row.tool_label,
    monthly_license_cost_eur: Number(row.monthly_license_cost_eur),
    active: row.active,
  };
}

function mapCycle(row: CycleRow): SurveyCycle {
  return {
    id: row.id,
    org_id: row.org_id,
    template_key: row.template_key,
    week: row.iso_week,
    period_start: row.period_start,
    period_end: row.period_end,
    status: row.status,
    reminder_sent_at: row.reminder_sent_at,
  };
}

function toCycleRow(cycle: NewSurveyCycle): Omit<CycleRow, "id"> {
  return {
    org_id: cycle.org_id,
    template_key: cycle.template_key,
    iso_week: cycle.week,
    period_start: cycle.period_start,
    period_end: cycle.period_end,
    status: cycle.status,
    reminder_sent_at: cycle.reminder_sent_at,
  };
}

function mapProfile(row: ProfileRow): RespondentProfile {
  return {
    respondent_key: row.respondent_key,
    org_id: row.org_id,
    department_id: row.department_id,
    role_scope: row.role_scope,
    tools_used: row.tools_used ?? [],
    uses_no_tools: row.uses_no_tools,
    ai_experience: row.ai_experience,
    question_history: row.question_history ?? null,
    onboarding_completed: row.onboarding_completed,
    // Duplicate guards use `participations` from Phase 4 on; the profile
    // does not track cycles (no more state than needed, SPEC §7).
    completed_cycles: [],
  };
}

function mapResponse(row: ResponseRow): SurveyResponse {
  return {
    id: row.id,
    org_id: row.org_id,
    cycle_id: row.cycle_id,
    department_id: row.department_id,
    role_scope: row.role_scope,
    question_code: row.question_code,
    answer: row.answer,
    created_week: row.created_week,
  };
}

export class SupabaseStore implements Store {
  readonly mode: StoreMode = "supabase";

  private readonly db: SupabaseClient;
  private readonly questions: Question[];
  private readonly rules: RecommendationRule[];

  constructor(options: SupabaseStoreOptions) {
    this.db =
      options.client ??
      createClient(options.url, options.secretKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    this.questions = structuredClone(options.questions);
    this.rules = structuredClone(options.rules);
  }

  /** The underlying client, for auth admin calls in the server layer. */
  get client(): SupabaseClient {
    return this.db;
  }

  // --- Organization & catalog ---------------------------------------------

  async getOrganization(orgId: OrgId): Promise<Organization | null> {
    const row = unwrapMaybe<OrganizationRow>(
      await this.db
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .maybeSingle(),
      "getOrganization",
    );
    return row ? mapOrganization(row) : null;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    const row = unwrapMaybe<OrganizationRow>(
      await this.db
        .from("organizations")
        .select("*")
        .eq("slug", slug)
        .maybeSingle(),
      "getOrganizationBySlug",
    );
    return row ? mapOrganization(row) : null;
  }

  async listOrganizations(): Promise<Organization[]> {
    const rows = unwrap<OrganizationRow[]>(
      await this.db.from("organizations").select("*").order("name"),
      "listOrganizations",
    );
    return rows.map(mapOrganization);
  }

  async listDepartments(orgId: OrgId): Promise<Department[]> {
    return unwrap<Department[]>(
      await this.db
        .from("departments")
        .select("id, org_id, name")
        .eq("org_id", orgId)
        .order("name"),
      "listDepartments",
    );
  }

  async listToolSettings(orgId: OrgId): Promise<OrgToolSetting[]> {
    const rows = unwrap<ToolSettingRow[]>(
      await this.db
        .from("org_settings_tools")
        .select("*")
        .eq("org_id", orgId)
        .order("tool_label"),
      "listToolSettings",
    );
    return rows.map(mapToolSetting);
  }

  async listQuestions(templateKey: TemplateKey): Promise<Question[]> {
    const matching = this.questions.filter(
      (q) => q.template_key === templateKey && q.active,
    );
    matching.sort((a, b) => a.sort_order - b.sort_order);
    return structuredClone(matching);
  }

  async listPersonas(): Promise<DemoPersona[]> {
    // Personas are a demo-only concept (SPEC §13 Phase 1).
    return [];
  }

  async setFormOfAddress(orgId: OrgId, form: FormOfAddress): Promise<void> {
    await this.updateOrganization(orgId, { form_of_address: form });
  }

  // --- Org setup (flow F1) ---------------------------------------------------

  async createOrganization(org: Omit<Organization, "id">): Promise<Organization> {
    const row = unwrap<OrganizationRow>(
      await this.db
        .from("organizations")
        .insert({
          name: org.name,
          slug: org.slug,
          logo_url: org.logo_url,
          primary_color: org.primary_color,
          hourly_rate_default: org.hourly_rate_default,
          locale: org.locale,
          form_of_address: org.form_of_address,
          k_anonymity_min: org.k_anonymity_min,
          is_demo: org.is_demo,
        })
        .select("*")
        .single(),
      "createOrganization",
    );
    return mapOrganization(row);
  }

  async updateOrganization(orgId: OrgId, patch: OrganizationPatch): Promise<void> {
    const current = await this.getOrganization(orgId);
    if (!current) throw new Error(`updateOrganization: unknown org_id "${orgId}"`);
    if (
      patch.k_anonymity_min !== undefined &&
      patch.k_anonymity_min < current.k_anonymity_min
    ) {
      // SPEC §7.2: the threshold is only ever raiseable.
      throw new Error("updateOrganization: k_anonymity_min can only be raised");
    }
    const { error } = await this.db
      .from("organizations")
      .update(patch)
      .eq("id", orgId);
    if (error) throw new Error(`updateOrganization: ${error.message}`);
  }

  async createDepartment(orgId: OrgId, name: string): Promise<Department> {
    const { error } = await this.db
      .from("departments")
      .upsert(
        { org_id: orgId, name },
        { onConflict: "org_id,name", ignoreDuplicates: true },
      );
    if (error) throw new Error(`createDepartment: ${error.message}`);
    return unwrap<Department>(
      await this.db
        .from("departments")
        .select("id, org_id, name")
        .eq("org_id", orgId)
        .eq("name", name)
        .single(),
      "createDepartment",
    );
  }

  async deleteDepartment(orgId: OrgId, departmentId: string): Promise<void> {
    const { error } = await this.db
      .from("departments")
      .delete()
      .eq("org_id", orgId)
      .eq("id", departmentId);
    if (error) throw new Error(`deleteDepartment: ${error.message}`);
  }

  async upsertToolSetting(
    setting: Omit<OrgToolSetting, "id">,
  ): Promise<OrgToolSetting> {
    const row = unwrap<ToolSettingRow>(
      await this.db
        .from("org_settings_tools")
        .upsert(setting, { onConflict: "org_id,tool_value" })
        .select("*")
        .single(),
      "upsertToolSetting",
    );
    return mapToolSetting(row);
  }

  async deleteToolSetting(orgId: OrgId, toolValue: string): Promise<void> {
    const { error } = await this.db
      .from("org_settings_tools")
      .delete()
      .eq("org_id", orgId)
      .eq("tool_value", toolValue);
    if (error) throw new Error(`deleteToolSetting: ${error.message}`);
  }

  // --- Memberships -------------------------------------------------------------

  async listMemberships(orgId: OrgId): Promise<Membership[]> {
    return unwrap<Membership[]>(
      await this.db
        .from("memberships")
        .select("*")
        .eq("org_id", orgId)
        .order("email"),
      "listMemberships",
    );
  }

  async listMembershipsByUser(userId: string): Promise<Membership[]> {
    return unwrap<Membership[]>(
      await this.db.from("memberships").select("*").eq("user_id", userId),
      "listMembershipsByUser",
    );
  }

  async getMembership(membershipId: string): Promise<Membership | null> {
    return unwrapMaybe<Membership>(
      await this.db
        .from("memberships")
        .select("*")
        .eq("id", membershipId)
        .maybeSingle(),
      "getMembership",
    );
  }

  async createMembership(membership: NewMembership): Promise<Membership> {
    return unwrap<Membership>(
      await this.db.from("memberships").insert(membership).select("*").single(),
      "createMembership",
    );
  }

  async updateMembership(
    membershipId: string,
    patch: MembershipPatch,
  ): Promise<void> {
    const { error } = await this.db
      .from("memberships")
      .update(patch)
      .eq("id", membershipId);
    if (error) throw new Error(`updateMembership: ${error.message}`);
  }

  // --- Survey cycles & participations ------------------------------------------

  async listCycles(
    orgId: OrgId,
    options: ListCyclesOptions = {},
  ): Promise<SurveyCycle[]> {
    let query = this.db.from("survey_cycles").select("*").eq("org_id", orgId);
    if (options.status) query = query.eq("status", options.status);
    if (options.template_key) {
      query = query.eq("template_key", options.template_key);
    }
    const rows = unwrap<CycleRow[]>(await query.order("iso_week"), "listCycles");
    return rows.map(mapCycle);
  }

  async getCycle(cycleId: string): Promise<SurveyCycle | null> {
    const row = unwrapMaybe<CycleRow>(
      await this.db
        .from("survey_cycles")
        .select("*")
        .eq("id", cycleId)
        .maybeSingle(),
      "getCycle",
    );
    return row ? mapCycle(row) : null;
  }

  async ensureCycle(cycle: NewSurveyCycle): Promise<SurveyCycle> {
    const { error } = await this.db
      .from("survey_cycles")
      .upsert(toCycleRow(cycle), {
        onConflict: "org_id,template_key,iso_week",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`ensureCycle: ${error.message}`);
    const row = unwrap<CycleRow>(
      await this.db
        .from("survey_cycles")
        .select("*")
        .eq("org_id", cycle.org_id)
        .eq("template_key", cycle.template_key)
        .eq("iso_week", cycle.week)
        .single(),
      "ensureCycle",
    );
    return mapCycle(row);
  }

  async updateCycle(cycleId: string, patch: CyclePatch): Promise<void> {
    const { error } = await this.db
      .from("survey_cycles")
      .update(patch)
      .eq("id", cycleId);
    if (error) throw new Error(`updateCycle: ${error.message}`);
  }

  async listParticipations(cycleId: string): Promise<Participation[]> {
    return this.fetchAll<Participation>(
      (from, to) =>
        this.db
          .from("participations")
          .select("*")
          .eq("cycle_id", cycleId)
          .order("id")
          .range(from, to),
      "listParticipations",
    );
  }

  async listParticipationsByMembership(
    membershipId: string,
  ): Promise<Participation[]> {
    return unwrap<Participation[]>(
      await this.db
        .from("participations")
        .select("*")
        .eq("membership_id", membershipId),
      "listParticipationsByMembership",
    );
  }

  async addParticipations(rows: NewParticipation[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.db
      .from("participations")
      .upsert(rows, { onConflict: "cycle_id,membership_id", ignoreDuplicates: true });
    if (error) throw new Error(`addParticipations: ${error.message}`);
  }

  async completeParticipation(
    cycleId: string,
    membershipId: string,
    completedAt: string,
  ): Promise<boolean> {
    const updated = unwrap<{ id: string }[]>(
      await this.db
        .from("participations")
        .update({ status: "completed", completed_at: completedAt })
        .eq("cycle_id", cycleId)
        .eq("membership_id", membershipId)
        .neq("status", "completed")
        .select("id"),
      "completeParticipation",
    );
    if (updated.length > 0) return true;

    const existing = unwrapMaybe<{ id: string }>(
      await this.db
        .from("participations")
        .select("id")
        .eq("cycle_id", cycleId)
        .eq("membership_id", membershipId)
        .maybeSingle(),
      "completeParticipation",
    );
    if (existing) return false;

    // Not invited to this cycle yet (e.g. joined mid-week): record it now.
    const { error } = await this.db.from("participations").insert({
      cycle_id: cycleId,
      membership_id: membershipId,
      status: "completed",
      completed_at: completedAt,
    });
    if (error) {
      // Lost a race against a parallel completion → treat as duplicate.
      if (error.message.includes("duplicate")) return false;
      throw new Error(`completeParticipation: ${error.message}`);
    }
    return true;
  }

  // --- Respondent profile (NEVER joinable with responses) ------------------

  async getProfile(
    orgId: OrgId,
    respondentKey: string,
  ): Promise<RespondentProfile | null> {
    const row = unwrapMaybe<ProfileRow>(
      await this.db
        .from("respondent_profiles")
        .select("*")
        .eq("org_id", orgId)
        .eq("respondent_key", respondentKey)
        .maybeSingle(),
      "getProfile",
    );
    return row ? mapProfile(row) : null;
  }

  async saveProfile(profile: RespondentProfile): Promise<void> {
    const row: ProfileRow = {
      org_id: profile.org_id,
      respondent_key: profile.respondent_key,
      department_id: profile.department_id,
      role_scope: profile.role_scope,
      tools_used: profile.tools_used,
      uses_no_tools: profile.uses_no_tools,
      ai_experience: profile.ai_experience,
      question_history: profile.question_history,
      onboarding_completed: profile.onboarding_completed,
    };
    const { error } = await this.db
      .from("respondent_profiles")
      .upsert(row, { onConflict: "org_id,respondent_key" });
    if (error) throw new Error(`saveProfile: ${error.message}`);
  }

  // --- Responses ------------------------------------------------------------

  /** One bulk INSERT = one transaction: all rows or none (SPEC §9). */
  async submitResponses(responses: NewSurveyResponse[]): Promise<void> {
    if (responses.length === 0) {
      throw new Error("submitResponses: empty submission");
    }
    const { error } = await this.db.from("responses").insert(
      responses.map((r) => ({
        org_id: r.org_id,
        cycle_id: r.cycle_id,
        department_id: r.department_id,
        role_scope: r.role_scope,
        question_code: r.question_code,
        answer: r.answer,
        created_week: r.created_week,
      })),
    );
    if (error) throw new Error(`submitResponses: ${error.message}`);
  }

  async listResponses(
    orgId: OrgId,
    options: ListResponsesOptions = {},
  ): Promise<SurveyResponse[]> {
    const weeks = options.weeks;
    if (weeks && weeks.length === 0) return [];
    const rows = await this.fetchAll<ResponseRow>((from, to) => {
      let query = this.db.from("responses").select("*").eq("org_id", orgId);
      if (weeks) query = query.in("created_week", [...weeks]);
      return query.order("id").range(from, to);
    }, "listResponses");
    return rows.map(mapResponse);
  }

  // --- Participation aggregates & recommendations ------------------------------

  async listParticipationStats(orgId: OrgId): Promise<ParticipationStat[]> {
    const rows = unwrap<ParticipationStatRow[]>(
      await this.db
        .from("participation_stats")
        .select("*")
        .eq("org_id", orgId),
      "listParticipationStats",
    );
    // A cycle that is still open and has no completion yet is "in progress",
    // not a 0 % week — keep it out of the dashboard until someone answers.
    const openEmpty = new Set(
      (await this.listCycles(orgId, { status: "open" })).map((c) => c.id),
    );
    return rows
      .filter((r) => !(openEmpty.has(r.cycle_id) && Number(r.completed) === 0))
      .map((r) => ({
        org_id: r.org_id,
        cycle_id: r.cycle_id,
        template_key: r.template_key,
        week: r.week,
        invited: Number(r.invited),
        completed: Number(r.completed),
      }));
  }

  async addParticipationStats(): Promise<void> {
    throw new Error(
      "addParticipationStats is demo-only; real participation is tracked per membership",
    );
  }

  async listRules(): Promise<RecommendationRule[]> {
    const active = this.rules.filter((r) => r.active);
    active.sort((a, b) => a.key.localeCompare(b.key, "de"));
    return structuredClone(active);
  }

  async listRecommendationStates(orgId: OrgId): Promise<RecommendationState[]> {
    return unwrap<RecommendationState[]>(
      await this.db
        .from("recommendation_states")
        .select("org_id, rule_key, context, status")
        .eq("org_id", orgId),
      "listRecommendationStates",
    );
  }

  async setRecommendationState(state: RecommendationState): Promise<void> {
    if (state.rule_key === "") {
      throw new Error("setRecommendationState: empty rule_key");
    }
    const { error } = await this.db
      .from("recommendation_states")
      .upsert(state, { onConflict: "org_id,rule_key,context" });
    if (error) throw new Error(`setRecommendationState: ${error.message}`);
  }

  // --- Internals -------------------------------------------------------------

  private async fetchAll<T>(
    page: (from: number, to: number) => PromiseLike<QueryResult<T[]>>,
    what: string,
  ): Promise<T[]> {
    const all: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const rows = unwrap<T[]>(await page(from, from + PAGE_SIZE - 1), what);
      all.push(...rows);
      if (rows.length < PAGE_SIZE) return all;
    }
  }
}
