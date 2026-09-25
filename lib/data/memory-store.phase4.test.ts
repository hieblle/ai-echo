import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store";
import type { NewMembership, NewSurveyCycle, Organization } from "@/lib/types";

const ORG: Organization = {
  id: "org-a",
  name: "Org A",
  slug: "org-a",
  logo_url: null,
  primary_color: null,
  hourly_rate_default: 60,
  locale: "de",
  form_of_address: "du",
  k_anonymity_min: 5,
  is_demo: false,
};

function membership(userId: string, overrides: Partial<NewMembership> = {}): NewMembership {
  return {
    org_id: ORG.id,
    user_id: userId,
    email: `${userId}@example.org`,
    department_id: null,
    role: "employee",
    status: "invited",
    invited_at: "2026-09-21T09:00:00.000Z",
    joined_at: null,
    ...overrides,
  };
}

const WEEKLY_CYCLE: NewSurveyCycle = {
  org_id: ORG.id,
  template_key: "weekly",
  week: "2026-W39",
  period_start: "2026-09-21",
  period_end: "2026-09-27",
  status: "open",
  reminder_sent_at: null,
};

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore({
    organizations: [ORG],
    departments: [{ id: "d1", org_id: ORG.id, name: "Vertrieb" }],
    personas: [],
    questions: [],
    toolSettings: [],
    rules: [],
  });
});

describe("MemoryStore · org setup (F1)", () => {
  it("creates organizations with unique slugs", async () => {
    const created = await store.createOrganization({ ...ORG, slug: "org-b", name: "Org B" });
    expect(created.id).not.toBe(ORG.id);
    expect(await store.getOrganizationBySlug("org-b")).toEqual(created);
    await expect(
      store.createOrganization({ ...ORG, slug: "org-b" }),
    ).rejects.toThrow(/slug/);
  });

  it("only ever raises k_anonymity_min (SPEC §7.2)", async () => {
    await store.updateOrganization(ORG.id, { k_anonymity_min: 7 });
    expect((await store.getOrganization(ORG.id))?.k_anonymity_min).toBe(7);
    await expect(
      store.updateOrganization(ORG.id, { k_anonymity_min: 5 }),
    ).rejects.toThrow(/raised/);
  });

  it("creates departments idempotently by name and unassigns members on delete", async () => {
    const a = await store.createDepartment(ORG.id, "Technik");
    const b = await store.createDepartment(ORG.id, "Technik");
    expect(b.id).toBe(a.id);
    const m = await store.createMembership(membership("u1", { department_id: a.id }));
    await store.deleteDepartment(ORG.id, a.id);
    expect((await store.listDepartments(ORG.id)).map((d) => d.name)).toEqual(["Vertrieb"]);
    expect((await store.getMembership(m.id))?.department_id).toBeNull();
  });

  it("upserts tool settings by (org, tool_value)", async () => {
    const first = await store.upsertToolSetting({
      org_id: ORG.id,
      tool_value: "chatgpt",
      tool_label: "ChatGPT",
      monthly_license_cost_eur: 20,
      active: true,
    });
    const second = await store.upsertToolSetting({
      org_id: ORG.id,
      tool_value: "chatgpt",
      tool_label: "ChatGPT Team",
      monthly_license_cost_eur: 25,
      active: true,
    });
    expect(second.id).toBe(first.id);
    expect(await store.listToolSettings(ORG.id)).toHaveLength(1);
    await store.deleteToolSetting(ORG.id, "chatgpt");
    expect(await store.listToolSettings(ORG.id)).toHaveLength(0);
  });
});

describe("MemoryStore · memberships", () => {
  it("rejects a second membership of the same user in the same org", async () => {
    await store.createMembership(membership("u1"));
    await expect(store.createMembership(membership("u1"))).rejects.toThrow(
      /already a member/,
    );
  });

  it("lists by org and by user, and applies patches", async () => {
    const m = await store.createMembership(membership("u1"));
    await store.updateMembership(m.id, { status: "active", role: "team_lead" });
    expect(await store.listMembershipsByUser("u1")).toMatchObject([
      { status: "active", role: "team_lead" },
    ]);
    expect(await store.listMemberships(ORG.id)).toHaveLength(1);
    expect(await store.listMemberships("other")).toHaveLength(0);
  });
});

describe("MemoryStore · cycles & participations", () => {
  it("ensureCycle is idempotent per (org, template, week)", async () => {
    const a = await store.ensureCycle(WEEKLY_CYCLE);
    const b = await store.ensureCycle({ ...WEEKLY_CYCLE, status: "closed" });
    expect(b.id).toBe(a.id);
    expect(b.status).toBe("open");
    expect(await store.listCycles(ORG.id, { template_key: "weekly" })).toHaveLength(1);
  });

  it("addParticipations skips existing pairs; completeParticipation guards duplicates", async () => {
    const cycle = await store.ensureCycle(WEEKLY_CYCLE);
    const m = await store.createMembership(membership("u1"));
    await store.addParticipations([
      { cycle_id: cycle.id, membership_id: m.id, status: "invited", completed_at: null },
      { cycle_id: cycle.id, membership_id: m.id, status: "invited", completed_at: null },
    ]);
    expect(await store.listParticipations(cycle.id)).toHaveLength(1);

    expect(
      await store.completeParticipation(cycle.id, m.id, "2026-09-22T10:00:00.000Z"),
    ).toBe(true);
    expect(
      await store.completeParticipation(cycle.id, m.id, "2026-09-22T11:00:00.000Z"),
    ).toBe(false);
    expect(await store.listParticipationsByMembership(m.id)).toMatchObject([
      { status: "completed", completed_at: "2026-09-22T10:00:00.000Z" },
    ]);
  });

  it("records a completion for someone not invited to the cycle", async () => {
    const cycle = await store.ensureCycle(WEEKLY_CYCLE);
    const m = await store.createMembership(membership("late"));
    expect(await store.completeParticipation(cycle.id, m.id, "2026-09-23T08:00:00.000Z")).toBe(true);
    expect(await store.listParticipations(cycle.id)).toHaveLength(1);
  });

  it("derives participation stats from real cycles", async () => {
    const cycle = await store.ensureCycle(WEEKLY_CYCLE);
    const m1 = await store.createMembership(membership("u1"));
    const m2 = await store.createMembership(membership("u2"));
    await store.addParticipations([
      { cycle_id: cycle.id, membership_id: m1.id, status: "invited", completed_at: null },
      { cycle_id: cycle.id, membership_id: m2.id, status: "invited", completed_at: null },
    ]);
    await store.completeParticipation(cycle.id, m1.id, "2026-09-22T10:00:00.000Z");
    expect(await store.listParticipationStats(ORG.id)).toEqual([
      {
        org_id: ORG.id,
        cycle_id: cycle.id,
        template_key: "weekly",
        week: "2026-W39",
        invited: 2,
        completed: 1,
      },
    ]);
  });
});

describe("MemoryStore · listResponses week filter", () => {
  it("returns only the requested weeks", async () => {
    const base = {
      org_id: ORG.id,
      cycle_id: "weekly-2026-W38",
      department_id: null,
      role_scope: "employee" as const,
      question_code: "W4.2",
      answer: { kind: "scale" as const, value: 7 },
    };
    await store.submitResponses([
      { ...base, created_week: "2026-W38" },
      { ...base, cycle_id: "weekly-2026-W39", created_week: "2026-W39" },
    ]);
    expect(await store.listResponses(ORG.id, { weeks: ["2026-W39"] })).toHaveLength(1);
    expect(await store.listResponses(ORG.id, { weeks: [] })).toHaveLength(0);
    expect(await store.listResponses(ORG.id)).toHaveLength(2);
  });
});
