import { beforeEach, describe, expect, it, vi } from "vitest";
import { getIsoWeek } from "@/lib/domain/isoWeek";
import { DEMO_ORG_ID } from "@/lib/seed/demo-org";
import { getStore } from "@/lib/server/store-instance";
import { getSurveySession } from "@/lib/server/survey-service";
import type { AnswerValue, Question } from "@/lib/types";
import { setDemoFormOfAddress, submitSurvey } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function resetStore() {
  (globalThis as { __kiBarometerStore?: unknown }).__kiBarometerStore =
    undefined;
}

const NOW = () => new Date(); // actions derive the week from the real clock
const WEEK = () => getIsoWeek(NOW());
const MARKETING = "p-emp-marketing";

/** A valid answer for any served question (mirrors what the runner produces). */
function validAnswer(q: Question): AnswerValue {
  switch (q.type) {
    case "single_choice": {
      if (q.options?.kind !== "choices") throw new Error("fixture");
      // Prefer a choice without follow-up obligations ("Nein" etc.).
      const plain =
        q.options.choices.find(
          (c) => !c.allows_text && c.value !== q.options?.kind,
        ) ?? q.options.choices[0];
      return { kind: "choice", value: plain!.value };
    }
    case "multi_choice": {
      if (q.options?.kind !== "choices") throw new Error("fixture");
      const nonExclusive = q.options.choices.find(
        (c) => !c.exclusive && !c.allows_text,
      );
      return { kind: "choices", values: [nonExclusive!.value] };
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
      throw new Error("tool_matrix answers are built per profile");
  }
}

async function buildPayload(
  template: "onboarding" | "weekly" | "monthly" | "leadership",
  personaId: string,
) {
  const session = await getSurveySession(template, personaId, NOW());
  const answers = session.questions
    .filter((q) => q.type !== "tool_matrix")
    .map((q) => ({ question_code: q.code, answer: validAnswer(q) }));
  for (const q of session.questions.filter((x) => x.type === "tool_matrix")) {
    answers.push({
      question_code: q.code,
      answer: {
        kind: "tool_matrix",
        tools: session.toolChoices.map((c) => ({
          tool: c.value,
          usefulness: 8,
          uses_per_week: 3,
        })),
      },
    });
  }
  return { template, personaId, isoWeek: session.isoWeek, answers, session };
}

beforeEach(resetStore);

describe("submitSurvey · happy path & anonymity shape", () => {
  it("stores rows without any respondent link and exactly the SPEC §6 fields", async () => {
    const { session, ...payload } = await buildPayload("weekly", MARKETING);
    const result = await submitSurvey(payload);
    expect(result).toEqual({ ok: true });

    const rows = await (await getStore()).listResponses(DEMO_ORG_ID);
    expect(rows.length).toBe(payload.answers.length);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "answer",
        "created_week",
        "cycle_id",
        "department_id",
        "id",
        "org_id",
        "question_code",
        "role_scope",
      ]);
      expect(row.created_week).toBe(WEEK());
      expect(row.cycle_id).toBe(`weekly-${WEEK()}`);
      expect(row.role_scope).toBe(session.profile.role_scope);
    }
  });

  it("stores free-text rows without a department (SPEC §7.3)", async () => {
    const { session, ...payload } = await buildPayload("monthly", MARKETING);
    expect(await submitSurvey(payload)).toEqual({ ok: true });
    const rows = await (await getStore()).listResponses(DEMO_ORG_ID);
    const freeTextCodes = new Set(
      session.questions
        .filter((q) => q.type === "text_optional")
        .map((q) => q.code),
    );
    expect(freeTextCodes.size).toBeGreaterThan(0);
    for (const row of rows) {
      if (freeTextCodes.has(row.question_code)) {
        expect(row.department_id).toBeNull();
      } else {
        expect(row.department_id).not.toBeNull();
      }
    }
  });

  it("accepts omitted optional free-text questions (D1.8)", async () => {
    const { session, ...payload } = await buildPayload("weekly", MARKETING);
    void session;
    const withoutText = {
      ...payload,
      answers: payload.answers.filter((a) => a.answer.kind !== "text"),
    };
    expect(await submitSurvey(withoutText)).toEqual({ ok: true });
  });
});

describe("submitSurvey · guards", () => {
  it("rejects a second submission of the same cycle", async () => {
    const { session, ...payload } = await buildPayload("weekly", MARKETING);
    void session;
    expect(await submitSurvey(payload)).toEqual({ ok: true });
    const again = await submitSurvey(payload);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/bereits abgeschlossen/);
    // No second batch stored.
    expect((await (await getStore()).listResponses(DEMO_ORG_ID)).length).toBe(
      payload.answers.length,
    );
  });

  it("rejects a repeated onboarding", async () => {
    const first = await buildPayload("onboarding", MARKETING);
    expect(
      await submitSurvey({
        template: first.template,
        personaId: first.personaId,
        isoWeek: first.isoWeek,
        answers: first.answers,
      }),
    ).toEqual({ ok: true });
    const second = await buildPayload("onboarding", MARKETING);
    const result = await submitSurvey({
      template: second.template,
      personaId: second.personaId,
      isoWeek: second.isoWeek,
      answers: second.answers,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Onboarding/);
  });

  it("rejects a stale ISO week (week rollover)", async () => {
    const { session, ...payload } = await buildPayload("weekly", MARKETING);
    void session;
    const stale = { ...payload, isoWeek: "2020-W01" };
    const result = await submitSurvey(stale);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Kalenderwoche/);
    expect(await (await getStore()).listResponses(DEMO_ORG_ID)).toEqual([]);
  });

  it("rejects unknown, duplicate and missing question codes atomically", async () => {
    const { session, ...payload } = await buildPayload("weekly", MARKETING);
    void session;

    const unknown = {
      ...payload,
      answers: [
        ...payload.answers,
        { question_code: "M6.1", answer: { kind: "scale", value: 9 } as const },
      ],
    };
    expect((await submitSurvey(unknown)).ok).toBe(false);

    const dupe = {
      ...payload,
      answers: [...payload.answers, payload.answers[0]!],
    };
    expect((await submitSurvey(dupe)).ok).toBe(false);

    const nonText = payload.answers.filter((a) => a.answer.kind !== "text");
    const missing = { ...payload, answers: nonText.slice(0, -1) };
    expect((await submitSurvey(missing)).ok).toBe(false);

    expect(await (await getStore()).listResponses(DEMO_ORG_ID)).toEqual([]);
  });
});

describe("submitSurvey · answer validation matrix", () => {
  async function submitWeeklyWith(
    mutate: (
      answers: { question_code: string; answer: AnswerValue }[],
      session: Awaited<ReturnType<typeof getSurveySession>>,
    ) => void,
  ) {
    const { session, ...payload } = await buildPayload("weekly", MARKETING);
    mutate(payload.answers, session);
    return submitSurvey(payload);
  }

  it("rejects a wrong answer kind for a question type", async () => {
    const result = await submitWeeklyWith((answers) => {
      const scale = answers.find((a) => a.answer.kind === "scale");
      if (scale) scale.answer = { kind: "number", value: 7 };
    });
    expect(result.ok).toBe(false);
  });

  it("rejects out-of-range scales", async () => {
    const result = await submitWeeklyWith((answers) => {
      const scale = answers.find((a) => a.answer.kind === "scale");
      if (scale) scale.answer = { kind: "scale", value: 11 };
    });
    expect(result.ok).toBe(false);
  });

  it("rejects choice values that were not offered", async () => {
    const result = await submitWeeklyWith((answers) => {
      const choice = answers.find((a) => a.answer.kind === "choice");
      if (choice) choice.answer = { kind: "choice", value: "hacked" };
    });
    expect(result.ok).toBe(false);
  });

  it("rejects inline text on choices that do not allow it", async () => {
    const result = await submitWeeklyWith((answers, session) => {
      const q = session.questions.find(
        (x) =>
          x.type === "single_choice" &&
          x.options?.kind === "choices" &&
          x.options.choices.some((c) => !c.allows_text),
      );
      const entry = answers.find((a) => a.question_code === q?.code);
      if (entry && q?.options?.kind === "choices") {
        const plain = q.options.choices.find((c) => !c.allows_text)!;
        entry.answer = { kind: "choice", value: plain.value, text: "sneaky" };
      }
    });
    expect(result.ok).toBe(false);
  });

  it("requires the follow-up scale on M3.3 'yes' and rejects partial tool matrices", async () => {
    // Monthly flow: contains M3.3 (followup) only when drawn; the tool matrix
    // (M2.1) is part of the core-independent rotation, so build from session.
    const { session, ...payload } = await buildPayload("monthly", MARKETING);

    const m33 = session.questions.find((q) => q.code === "M3.3");
    if (m33) {
      const entry = payload.answers.find((a) => a.question_code === "M3.3")!;
      entry.answer = { kind: "choice", value: "yes" }; // no scale
      const result = await submitSurvey(payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/M3\.3/);
      entry.answer = { kind: "choice", value: "no" }; // restore validity
    }

    const matrix = payload.answers.find((a) => a.answer.kind === "tool_matrix");
    if (matrix && matrix.answer.kind === "tool_matrix") {
      matrix.answer = { kind: "tool_matrix", tools: matrix.answer.tools.slice(0, 1) };
      const result = await submitSurvey(payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/M2\.1/);
    }
    expect(await (await getStore()).listResponses(DEMO_ORG_ID)).toEqual([]);
  });

  it("rejects exclusive multi-choice combinations (O2 'none' + tool)", async () => {
    const { session, ...payload } = await buildPayload(
      "onboarding",
      MARKETING,
    );
    void session;
    const o2 = payload.answers.find((a) => a.question_code === "O2")!;
    o2.answer = { kind: "choices", values: ["none", "chatgpt"] };
    const result = await submitSurvey(payload);
    expect(result.ok).toBe(false);
  });
});

describe("submitSurvey · profile updates", () => {
  it("onboarding rewrites tools, department and flags — and rows use the O1 department", async () => {
    const { session, ...payload } = await buildPayload("onboarding", MARKETING);
    void session;
    const set = (code: string, answer: AnswerValue) => {
      payload.answers.find((a) => a.question_code === code)!.answer = answer;
    };
    set("O1", { kind: "choice", value: "hr" });
    set("O2", { kind: "choices", values: ["claude", "gemini", "other"], other_text: "Interne KI" });
    set("O3", { kind: "choice", value: "6_12m" });

    expect(await submitSurvey(payload)).toEqual({ ok: true });

    const profile = await (await getStore()).getProfile(DEMO_ORG_ID, MARKETING);
    expect(profile!.department_id).toBe("hr");
    expect(profile!.tools_used).toEqual(["claude", "gemini"]); // "other" dropped (D1.6)
    expect(profile!.uses_no_tools).toBe(false);
    expect(profile!.ai_experience).toBe("6_12m");
    expect(profile!.onboarding_completed).toBe(true);
    expect(profile!.completed_cycles).toContain(`onboarding-${WEEK()}`);

    // The baseline rows already belong to the O1 department, not the default.
    const rows = await (await getStore()).listResponses(DEMO_ORG_ID);
    for (const row of rows.filter((r) => r.department_id !== null)) {
      expect(row.department_id).toBe("hr");
    }
  });

  it("O2 'none' switches the profile to the short pulse", async () => {
    const { session, ...payload } = await buildPayload("onboarding", MARKETING);
    void session;
    payload.answers.find((a) => a.question_code === "O2")!.answer = {
      kind: "choices",
      values: ["none"],
    };
    expect(await submitSurvey(payload)).toEqual({ ok: true });

    const profile = await (await getStore()).getProfile(DEMO_ORG_ID, MARKETING);
    expect(profile!.uses_no_tools).toBe(true);
    expect(profile!.tools_used).toEqual([]);

    const weekly = await getSurveySession("weekly", MARKETING, NOW());
    expect(weekly.questions.map((q) => q.code)).toEqual([
      "W1.1",
      "W4.1",
      "W4.2",
    ]);
  });

  it("weekly submit records the served codes as question history", async () => {
    const { session, ...payload } = await buildPayload("weekly", MARKETING);
    expect(await submitSurvey(payload)).toEqual({ ok: true });
    const profile = await (await getStore()).getProfile(DEMO_ORG_ID, MARKETING);
    expect(profile!.question_history).toEqual({
      week: WEEK(),
      codes: session.questions.map((q) => q.code),
    });
  });
});

describe("setDemoFormOfAddress", () => {
  it("accepts only du/sie", async () => {
    await setDemoFormOfAddress("sie");
    expect((await (await getStore()).getOrganization(DEMO_ORG_ID))!.form_of_address).toBe(
      "sie",
    );
    await setDemoFormOfAddress("hacker");
    expect((await (await getStore()).getOrganization(DEMO_ORG_ID))!.form_of_address).toBe(
      "sie",
    );
    await setDemoFormOfAddress("du");
    expect((await (await getStore()).getOrganization(DEMO_ORG_ID))!.form_of_address).toBe(
      "du",
    );
  });
});
