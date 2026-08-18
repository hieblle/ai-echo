import { beforeEach, describe, expect, it } from "vitest";
import { getIsoWeek } from "@/lib/domain/isoWeek";
import {
  personalizeWeeklyDraw,
  pickWeeklyQuestions,
  WEEKLY_ANCHOR_CODES,
} from "@/lib/domain/rotation";
import { DEMO_ORG_ID, DEMO_PERSONAS } from "@/lib/seed/demo-org";
import { WEEKLY_POOL } from "@/lib/seed/questions";
import { WEEKLY_DIMENSIONS } from "@/lib/types";
import { getStore } from "./store-instance";
import {
  bootstrapProfile,
  getMonthKey,
  getSurveySession,
  isTemplateKey,
} from "./survey-service";

/** Fresh in-memory store per test (the singleton lives on globalThis). */
function resetStore() {
  (globalThis as { __kiBarometerStore?: unknown }).__kiBarometerStore =
    undefined;
}

const NOW = new Date(Date.UTC(2026, 6, 15, 10)); // 2026-W29
const MARKETING = "p-emp-marketing";
const NON_USER = "p-emp-it";

beforeEach(resetStore);

describe("getSurveySession · weekly", () => {
  it("serves 5 questions covering all weekly dimensions for a tool user", async () => {
    const session = await getSurveySession("weekly", MARKETING, NOW);
    expect(session.questions).toHaveLength(5);
    for (const dimension of WEEKLY_DIMENSIONS) {
      expect(session.questions.some((q) => q.dimension === dimension)).toBe(
        true,
      );
    }
  });

  it("narrows requires_tool questions to the profile's tools", async () => {
    const session = await getSurveySession("weekly", MARKETING, NOW);
    const w12 = session.questions.find((q) => q.code === "W1.2");
    if (w12) {
      expect(w12.options?.kind).toBe("choices");
      if (w12.options?.kind === "choices") {
        expect(w12.options.choices.map((c) => c.value)).toEqual([
          "chatgpt",
          "deepl_write",
        ]);
      }
    }
    expect(session.toolChoices.map((c) => c.value)).toEqual([
      "chatgpt",
      "deepl_write",
    ]);
  });

  it("serves exactly the short variant to a non-user", async () => {
    const session = await getSurveySession("weekly", NON_USER, NOW);
    expect(session.questions.map((q) => q.code)).toEqual([
      "W1.1",
      "W4.1",
      "W4.2",
    ]);
  });

  it("is stable within the same week (same-week retake, D1.5)", async () => {
    const first = await getSurveySession("weekly", MARKETING, NOW);
    const store = await getStore();
    const profile = await store.getProfile(DEMO_ORG_ID, MARKETING);
    await store.saveProfile({
      ...profile!,
      question_history: {
        week: first.isoWeek,
        codes: first.questions.map((q) => q.code),
      },
    });
    const second = await getSurveySession("weekly", MARKETING, NOW);
    expect(second.questions.map((q) => q.code)).toEqual(
      first.questions.map((q) => q.code),
    );
  });

  it("anchors W1.1 weekly and never repeats any other question in consecutive weeks (SPEC §9 b / D2.10, 60-week simulation)", async () => {
    // Simulates the exact service composition against the REAL seed pool:
    // anchored draw + previous-draw exclusion + personal substitution.
    let history: string[] = [];
    let previousWeek: string | null = null;
    const start = Date.UTC(2026, 0, 5); // a Monday
    for (let week = 0; week < 60; week++) {
      const date = new Date(start + week * 7 * 86_400_000);
      const isoWeek = getIsoWeek(date);
      const exclude = previousWeek
        ? pickWeeklyQuestions({
            pool: WEEKLY_POOL,
            orgId: DEMO_ORG_ID,
            isoWeek: previousWeek,
            anchors: WEEKLY_ANCHOR_CODES,
          }).map((q) => q.code)
        : [];
      const draw = pickWeeklyQuestions({
        pool: WEEKLY_POOL,
        orgId: DEMO_ORG_ID,
        isoWeek,
        exclude,
        anchors: WEEKLY_ANCHOR_CODES,
      });
      const personalized = personalizeWeeklyDraw({
        draw,
        pool: WEEKLY_POOL,
        history,
        respondentKey: MARKETING,
        isoWeek,
        anchors: WEEKLY_ANCHOR_CODES,
      });
      const codes = personalized.map((q) => q.code);
      // The anchor is served every single week (lead KPI, D2.10)…
      expect(codes).toContain("W1.1");
      // …and every non-anchor question still honors the no-repeat rule.
      const repeats = codes.filter(
        (c) => history.includes(c) && !WEEKLY_ANCHOR_CODES.includes(c),
      );
      expect(repeats).toEqual([]);
      history = codes;
      previousWeek = isoWeek;
    }
  });
});

describe("getSurveySession · monthly", () => {
  it("serves 8-12 questions including the monthly core", async () => {
    const session = await getSurveySession("monthly", MARKETING, NOW);
    expect(session.questions.length).toBeGreaterThanOrEqual(8);
    expect(session.questions.length).toBeLessThanOrEqual(12);
    const codes = session.questions.map((q) => q.code);
    for (const core of ["M1.1", "M1.3", "M3.1", "M5.1", "M6.1"]) {
      expect(codes).toContain(core);
    }
  });

  it("drops the tool matrix for a respondent without tools", async () => {
    const session = await getSurveySession("monthly", NON_USER, NOW);
    expect(session.questions.some((q) => q.code === "M2.1")).toBe(false);
  });
});

describe("getSurveySession · guards & bootstrap", () => {
  it("rejects the leadership survey for an employee persona", async () => {
    await expect(
      getSurveySession("leadership", MARKETING, NOW),
    ).rejects.toThrow(/lead role/);
  });

  it("serves all 7 leadership questions to a lead", async () => {
    const session = await getSurveySession("leadership", "p-lead-sales", NOW);
    expect(session.questions.map((q) => q.code)).toEqual([
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
      "F6",
      "F7",
    ]);
  });

  it("rejects an unknown persona", async () => {
    await expect(getSurveySession("weekly", "p-nope", NOW)).rejects.toThrow(
      /unknown persona/,
    );
  });

  it("bootstraps and persists a profile on first contact", async () => {
    await getSurveySession("weekly", MARKETING, NOW);
    const profile = await (await getStore()).getProfile(DEMO_ORG_ID, MARKETING);
    expect(profile).not.toBeNull();
    expect(profile!.tools_used).toEqual(["chatgpt", "deepl_write"]);
    expect(profile!.uses_no_tools).toBe(false);
    expect(profile!.onboarding_completed).toBe(false);
    expect(profile!.completed_cycles).toEqual([]);
  });

  it("derives uses_no_tools from empty default_tools", () => {
    const persona = DEMO_PERSONAS.find((p) => p.id === NON_USER)!;
    const profile = bootstrapProfile(persona);
    expect(profile.uses_no_tools).toBe(true);
    expect(profile.tools_used).toEqual([]);
  });
});

describe("helpers", () => {
  it("isTemplateKey accepts exactly the four templates", () => {
    expect(isTemplateKey("weekly")).toBe(true);
    expect(isTemplateKey("onboarding")).toBe(true);
    expect(isTemplateKey("dashboard")).toBe(false);
  });

  it("getMonthKey formats UTC months", () => {
    expect(getMonthKey(new Date(Date.UTC(2026, 6, 15)))).toBe("2026-07");
    expect(getMonthKey(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-01");
  });
});
