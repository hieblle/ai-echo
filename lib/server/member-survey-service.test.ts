import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/lib/data/memory-store";
import { getIsoWeek } from "@/lib/domain/isoWeek";
import { DEMO_DEPARTMENTS, DEMO_ORG } from "@/lib/seed/demo-org";
import { QUESTIONS } from "@/lib/seed/questions";
import { RECOMMENDATION_RULES } from "@/lib/seed/rules";
import type { AnswerValue, Membership, Question, TemplateKey } from "@/lib/types";
import {
  getMemberSurveySession,
  submitMemberSurvey,
  SurveyAccessError,
} from "./member-survey-service";
import { respondentKeyFor } from "./respondent-key";

vi.stubEnv("PSEUDONYM_SECRET", "test-secret-please-do-not-use-in-prod");

const NOW = new Date(Date.UTC(2026, 8, 23, 9, 17)); // 2026-W39, Wednesday
const WEEK = getIsoWeek(NOW);

function membership(role: Membership["role"], id = `m-${role}`): Membership {
  return {
    id,
    org_id: DEMO_ORG.id,
    user_id: `u-${id}`,
    email: `${id}@example.org`,
    department_id: "sales",
    role,
    status: "active",
    invited_at: "2026-09-20T09:00:00.000Z",
    joined_at: "2026-09-21T09:00:00.000Z",
  };
}

/** A valid answer for any served question (mirrors what the runner produces). */
function validAnswer(q: Question): AnswerValue {
  switch (q.type) {
    case "single_choice": {
      if (q.options?.kind !== "choices") throw new Error("fixture");
      if (q.code === "O1") return { kind: "choice", value: "marketing" };
      const plain =
        q.options.choices.find((c) => !c.allows_text) ?? q.options.choices[0];
      return { kind: "choice", value: plain!.value };
    }
    case "multi_choice": {
      if (q.options?.kind !== "choices") throw new Error("fixture");
      if (q.code === "O2") return { kind: "choices", values: ["chatgpt"] };
      const plain = q.options.choices.find((c) => !c.exclusive && !c.allows_text);
      return { kind: "choices", values: [plain!.value] };
    }
    case "scale_1_10":
      return { kind: "scale", value: 7 };
    case "scale_0_10":
      return { kind: "scale", value: 9 };
    case "scale_minus5_plus5":
      return { kind: "scale", value: 2 };
    case "number":
    case "currency":
      return { kind: "number", value: 5 };
    case "text_optional":
      return { kind: "text", value: "Testantwort" };
    case "tool_matrix":
      throw new Error("built per session");
  }
}

let store: MemoryStore;

async function payloadFor(m: Membership, template: TemplateKey) {
  const session = await getMemberSurveySession(store, DEMO_ORG, m, template, NOW);
  const answers = session.questions
    .filter((q) => q.type !== "tool_matrix")
    .map((q) => ({ question_code: q.code, answer: validAnswer(q) }));
  for (const q of session.questions.filter((x) => x.type === "tool_matrix")) {
    answers.push({
      question_code: q.code,
      answer: {
        kind: "tool_matrix",
        tools: session.toolChoices.map((c) => ({ tool: c.value, usefulness: 8, uses_per_week: 3 })),
      },
    });
  }
  return { session, payload: { template, isoWeek: session.isoWeek, answers } };
}

async function openCycle(template: TemplateKey, week = WEEK) {
  return store.ensureCycle({
    org_id: DEMO_ORG.id,
    template_key: template,
    week,
    period_start: "2026-09-21",
    period_end: "2026-09-27",
    status: "open",
    reminder_sent_at: null,
  });
}

beforeEach(() => {
  store = new MemoryStore({
    organizations: [DEMO_ORG],
    departments: DEMO_DEPARTMENTS,
    personas: [],
    questions: QUESTIONS,
    toolSettings: [],
    rules: RECOMMENDATION_RULES,
  });
});

describe("member survey · onboarding", () => {
  it("requires onboarding before any pulse", async () => {
    await openCycle("weekly");
    await expect(
      getMemberSurveySession(store, DEMO_ORG, membership("employee"), "weekly", NOW),
    ).rejects.toMatchObject({ reason: "onboarding_required" } satisfies Partial<SurveyAccessError>);
  });

  it("lists the org's departments in O1 and stores the baseline anonymously", async () => {
    const m = membership("employee");
    const { session, payload } = await payloadFor(m, "onboarding");
    const o1 = session.questions.find((q) => q.code === "O1");
    expect(o1?.options?.kind).toBe("choices");
    if (o1?.options?.kind === "choices") {
      expect(o1.options.choices.map((c) => c.value)).toEqual(DEMO_DEPARTMENTS.map((d) => d.id));
    }

    expect(await submitMemberSurvey(store, DEMO_ORG, m, payload, NOW)).toEqual({ ok: true });

    const rows = await store.listResponses(DEMO_ORG.id);
    expect(rows.length).toBe(payload.answers.length);
    for (const row of rows) {
      expect(row.created_week).toBe(WEEK);
      expect(row.cycle_id).toBe(`onboarding-${WEEK}`);
      expect(row.role_scope).toBe("employee");
      expect(Object.keys(row)).not.toContain("membership_id");
    }
    // Department from O1, tools from O2 — in the pseudonymous profile only.
    const profile = await store.getProfile(DEMO_ORG.id, respondentKeyFor(m.id));
    expect(profile).toMatchObject({
      onboarding_completed: true,
      department_id: "marketing",
      tools_used: ["chatgpt"],
      uses_no_tools: false,
    });
    expect(profile?.respondent_key).not.toBe(m.id);

    const again = await submitMemberSurvey(store, DEMO_ORG, m, payload, NOW);
    expect(again).toMatchObject({ ok: false, error: expect.stringMatching(/Onboarding/) });
  });
});

describe("member survey · pulses bound to open cycles", () => {
  it("rejects a pulse without an open cycle, then serves the cycle's week", async () => {
    const m = membership("employee");
    await submitMemberSurvey(store, DEMO_ORG, m, (await payloadFor(m, "onboarding")).payload, NOW);
    await expect(
      getMemberSurveySession(store, DEMO_ORG, m, "weekly", NOW),
    ).rejects.toMatchObject({ reason: "no_open_cycle" });

    const cycle = await openCycle("weekly", "2026-W38");
    const { session, payload } = await payloadFor(m, "weekly");
    expect(session.isoWeek).toBe("2026-W38");
    expect(session.questions).toHaveLength(5);

    expect(await submitMemberSurvey(store, DEMO_ORG, m, payload, NOW)).toEqual({ ok: true });
    const rows = (await store.listResponses(DEMO_ORG.id)).filter((r) => r.cycle_id.startsWith("weekly"));
    expect(rows.every((r) => r.created_week === "2026-W38")).toBe(true);
    expect(rows.every((r) => r.department_id === "marketing" || r.department_id === null)).toBe(true);

    expect(await store.listParticipations(cycle.id)).toMatchObject([
      { membership_id: m.id, status: "completed", completed_at: "2026-09-23T09:00:00.000Z" },
    ]);
    expect(await store.listParticipationStats(DEMO_ORG.id)).toMatchObject([
      { week: "2026-W38", invited: 1, completed: 1 },
    ]);

    const again = await submitMemberSurvey(store, DEMO_ORG, m, payload, NOW);
    expect(again).toMatchObject({ ok: false, error: expect.stringMatching(/bereits abgeschlossen/) });
    expect((await store.listResponses(DEMO_ORG.id)).filter((r) => r.cycle_id.startsWith("weekly")).length).toBe(rows.length);
  });

  it("rejects answers rendered for a cycle that has since been replaced", async () => {
    const m = membership("employee");
    await submitMemberSurvey(store, DEMO_ORG, m, (await payloadFor(m, "onboarding")).payload, NOW);
    const old = await openCycle("weekly", "2026-W38");
    const { payload } = await payloadFor(m, "weekly");
    await store.updateCycle(old.id, { status: "closed" });
    await openCycle("weekly", "2026-W39");
    const result = await submitMemberSurvey(store, DEMO_ORG, m, payload, NOW);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/gewechselt/) });
  });

  it("only serves the leadership survey to leads", async () => {
    const employee = membership("employee");
    await submitMemberSurvey(store, DEMO_ORG, employee, (await payloadFor(employee, "onboarding")).payload, NOW);
    await openCycle("leadership");
    await expect(
      getMemberSurveySession(store, DEMO_ORG, employee, "leadership", NOW),
    ).rejects.toMatchObject({ reason: "leadership" });

    const lead = membership("team_lead");
    await submitMemberSurvey(store, DEMO_ORG, lead, (await payloadFor(lead, "onboarding")).payload, NOW);
    const { session, payload } = await payloadFor(lead, "leadership");
    expect(session.questions.map((q) => q.code)).toContain("F6");
    expect(await submitMemberSurvey(store, DEMO_ORG, lead, payload, NOW)).toEqual({ ok: true });
    const rows = (await store.listResponses(DEMO_ORG.id)).filter((r) => r.cycle_id.startsWith("leadership"));
    expect(rows.every((r) => r.role_scope === "lead")).toBe(true);
  });
});
