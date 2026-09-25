// @vitest-environment node
/**
 * Integration tests against a real Supabase project (Phase 4 acceptance,
 * SPEC §13): two orgs strictly isolated, responses without user link.
 *
 * Skipped unless NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY are set (CI runs without secrets). Everything
 * created here is prefixed "itest-" and removed afterwards.
 */

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSupabaseEnv } from "@/lib/server/env";
import { QUESTIONS } from "@/lib/seed/questions";
import { RECOMMENDATION_RULES } from "@/lib/seed/rules";
import type { Organization } from "@/lib/types";
import { SupabaseStore } from "./supabase-store";

const env = getSupabaseEnv();
const run = env !== null;

const stamp = Date.now().toString(36);
const orgFixture = (suffix: string): Omit<Organization, "id"> => ({
  name: `itest ${suffix} ${stamp}`,
  slug: `itest-${suffix}-${stamp}`,
  logo_url: null,
  primary_color: null,
  hourly_rate_default: 55,
  locale: "de",
  form_of_address: "sie",
  k_anonymity_min: 5,
  is_demo: false,
});

describe.skipIf(!run)("SupabaseStore (integration)", () => {
  // Constructed lazily: createClient rejects empty credentials at collection
  // time, and this suite must collect cleanly when it is skipped.
  let store: SupabaseStore;
  let admin: SupabaseStore["client"];
  let orgA: Organization;
  let orgB: Organization;
  const userIds: string[] = [];

  beforeAll(async () => {
    store = new SupabaseStore({
      url: env?.url ?? "",
      serviceRoleKey: env?.serviceRoleKey ?? "",
      questions: QUESTIONS,
      rules: RECOMMENDATION_RULES,
    });
    admin = store.client;
    orgA = await store.createOrganization(orgFixture("a"));
    orgB = await store.createOrganization(orgFixture("b"));
  });

  afterAll(async () => {
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    for (const org of [orgA, orgB]) {
      if (org) await admin.from("organizations").delete().eq("id", org.id);
    }
  });

  it("round-trips organizations, departments and tool settings", async () => {
    expect(await store.getOrganizationBySlug(orgA.slug)).toEqual(orgA);
    const dept = await store.createDepartment(orgA.id, "Vertrieb");
    expect(await store.createDepartment(orgA.id, "Vertrieb")).toEqual(dept);
    await store.upsertToolSetting({
      org_id: orgA.id,
      tool_value: "chatgpt",
      tool_label: "ChatGPT",
      monthly_license_cost_eur: 20,
      active: true,
    });
    expect(await store.listToolSettings(orgA.id)).toMatchObject([
      { tool_value: "chatgpt", monthly_license_cost_eur: 20 },
    ]);
    await expect(
      store.updateOrganization(orgA.id, { k_anonymity_min: 4 }),
    ).rejects.toThrow();
  });

  it("keeps responses of two orgs strictly apart", async () => {
    const row = {
      cycle_id: "weekly-2026-W39",
      department_id: null,
      role_scope: "employee" as const,
      question_code: "W4.2",
      answer: { kind: "scale" as const, value: 8 },
      created_week: "2026-W39",
    };
    await store.submitResponses([
      { ...row, org_id: orgA.id },
      { ...row, org_id: orgA.id, question_code: "W4.1", answer: { kind: "choice", value: "relief" } },
    ]);
    await store.submitResponses([{ ...row, org_id: orgB.id }]);

    const a = await store.listResponses(orgA.id);
    const b = await store.listResponses(orgB.id);
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(1);
    expect(a.every((r) => r.org_id === orgA.id)).toBe(true);
    expect(await store.listResponses(orgA.id, { weeks: ["2026-W01"] })).toEqual([]);
  });

  it("stores responses without any user link (column-level check)", async () => {
    const { data, error } = await admin
      .from("responses")
      .select("*")
      .eq("org_id", orgA.id)
      .limit(1)
      .single();
    expect(error).toBeNull();
    expect(Object.keys(data ?? {}).sort()).toEqual([
      "answer",
      "created_week",
      "cycle_id",
      "department_id",
      "id",
      "org_id",
      "question_code",
      "role_scope",
    ]);
  });

  it("RLS: a member sees only their org and never raw responses", async () => {
    const email = `itest-${stamp}@example.org`;
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    const userId = created.data.user?.id ?? "";
    userIds.push(userId);

    const membership = await store.createMembership({
      org_id: orgA.id,
      user_id: userId,
      email,
      department_id: null,
      role: "employee",
      status: "active",
      invited_at: new Date().toISOString(),
      joined_at: null,
    });
    const cycle = await store.ensureCycle({
      org_id: orgA.id,
      template_key: "weekly",
      week: "2026-W39",
      period_start: "2026-09-21",
      period_end: "2026-09-27",
      status: "open",
      reminder_sent_at: null,
    });
    await store.addParticipations([
      { cycle_id: cycle.id, membership_id: membership.id, status: "invited", completed_at: null },
    ]);

    // Obtain a user session without email: magic link → token hash → verifyOtp.
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    expect(link.error).toBeNull();
    const userClient = createClient(env?.url ?? "", env?.anonKey ?? "", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const verified = await userClient.auth.verifyOtp({
      token_hash: link.data.properties?.hashed_token ?? "",
      type: "magiclink",
    });
    expect(verified.error).toBeNull();

    const orgs = await userClient.from("organizations").select("id");
    expect(orgs.error).toBeNull();
    expect(orgs.data?.map((o) => o.id)).toEqual([orgA.id]);

    const cycles = await userClient.from("survey_cycles").select("org_id");
    expect(cycles.data?.every((c) => c.org_id === orgA.id)).toBe(true);

    const responses = await userClient.from("responses").select("id");
    expect(responses.data ?? []).toEqual([]);
    const profiles = await userClient.from("respondent_profiles").select("id");
    expect(profiles.data ?? []).toEqual([]);

    const memberships = await userClient.from("memberships").select("org_id");
    expect(memberships.data).toEqual([{ org_id: orgA.id }]);

    // Duplicate-submission guard on the real participations table.
    expect(await store.completeParticipation(cycle.id, membership.id, "2026-09-22T10:00:00.000Z")).toBe(true);
    expect(await store.completeParticipation(cycle.id, membership.id, "2026-09-22T11:00:00.000Z")).toBe(false);
    expect(await store.listParticipationStats(orgA.id)).toMatchObject([
      { week: "2026-W39", invited: 1, completed: 1 },
    ]);
  });

  it("anonymous clients read nothing", async () => {
    const anon = createClient(env?.url ?? "", env?.anonKey ?? "", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await anon.from("organizations").select("id");
    expect(result.data ?? []).toEqual([]);
  });
});
