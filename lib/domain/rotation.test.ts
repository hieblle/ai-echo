import { describe, expect, it } from "vitest";
import type { Question, WeeklyDimension } from "@/lib/types";
import { WEEKLY_DIMENSIONS } from "@/lib/types";
import {
  MONTHLY_CORE_CODES,
  personalizeWeeklyDraw,
  pickMonthlyQuestions,
  pickWeeklyQuestions,
} from "./rotation";

// --- Fixture -----------------------------------------------------------------
// Inline 12-question weekly pool: 3 questions per weekly dimension,
// codes W1.1..W4.3, distinct sort_order. Deliberately NOT imported from
// lib/seed/ (built concurrently by another module).

function makeQuestion(
  code: string,
  dimension: WeeklyDimension,
  sortOrder: number,
): Question {
  const question: Question = {
    id: `q-${code}`,
    template_key: "weekly",
    code,
    dimension,
    type: "scale_1_10",
    text: `Frage ${code}`,
    text_sie: null,
    options: {
      kind: "scale",
      min: 1,
      max: 10,
      min_label: "niedrig",
      max_label: "hoch",
    },
    condition: null,
    is_gap_pair_with: null,
    sort_order: sortOrder,
    active: true,
  };
  Object.freeze(question.options);
  return Object.freeze(question) as Question;
}

function buildPool(): Question[] {
  const pool: Question[] = [
    makeQuestion("W1.1", "adoption", 11),
    makeQuestion("W1.2", "adoption", 12),
    makeQuestion("W1.3", "adoption", 13),
    makeQuestion("W2.1", "efficiency", 21),
    makeQuestion("W2.2", "efficiency", 22),
    makeQuestion("W2.3", "efficiency", 23),
    makeQuestion("W3.1", "trust", 31),
    makeQuestion("W3.2", "trust", 32),
    makeQuestion("W3.3", "trust", 33),
    makeQuestion("W4.1", "sentiment", 41),
    makeQuestion("W4.2", "sentiment", 42),
    makeQuestion("W4.3", "sentiment", 43),
  ];
  Object.freeze(pool);
  return pool;
}

const POOL = buildPool();
const ORG = "org-demo";
const WEEK = "2026-W29";

function codesOf(questions: Question[]): string[] {
  return questions.map((q) => q.code);
}

function byCode(code: string): Question {
  const question = POOL.find((q) => q.code === code);
  if (!question) throw new Error(`fixture question ${code} missing`);
  return question;
}

// --- pickWeeklyQuestions -------------------------------------------------------

describe("pickWeeklyQuestions", () => {
  it("is deterministic: two calls with the same inputs return the same draw", () => {
    const first = pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek: WEEK });
    const second = pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek: WEEK });
    expect(codesOf(second)).toEqual(codesOf(first));
    expect(second).toEqual(first);
  });

  it("changes the draw across ISO weeks for at least one of several weeks", () => {
    const weeks = ["2026-W01", "2026-W02", "2026-W03", "2026-W04", "2026-W05", "2026-W06"];
    const signatures = new Set(
      weeks.map((isoWeek) =>
        codesOf(pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek })).join(","),
      ),
    );
    expect(signatures.size).toBeGreaterThan(1);
  });

  it("defaults count to 5", () => {
    const draw = pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek: WEEK });
    expect(draw).toHaveLength(5);
  });

  it("clamps count to the 3..5 range (2 -> 3, 9 -> 5)", () => {
    expect(
      pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek: WEEK, count: 2 }),
    ).toHaveLength(3);
    expect(
      pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek: WEEK, count: 9 }),
    ).toHaveLength(5);
  });

  it("covers every weekly dimension when count is 4", () => {
    const draw = pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek: WEEK, count: 4 });
    expect(draw).toHaveLength(4);
    const dimensions = new Set(draw.map((q) => q.dimension));
    for (const dimension of WEEKLY_DIMENSIONS) {
      expect(dimensions.has(dimension)).toBe(true);
    }
  });

  it("covers every weekly dimension when count is 5", () => {
    const draw = pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek: WEEK, count: 5 });
    expect(draw).toHaveLength(5);
    const dimensions = new Set(draw.map((q) => q.dimension));
    for (const dimension of WEEKLY_DIMENSIONS) {
      expect(dimensions.has(dimension)).toBe(true);
    }
  });

  it("returns 3 distinct questions for count 3 (no coverage guarantee)", () => {
    const draw = pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek: WEEK, count: 3 });
    expect(draw).toHaveLength(3);
    expect(new Set(codesOf(draw)).size).toBe(3);
  });

  it("throws when a weekly dimension is missing from the pool and count >= 4", () => {
    const withoutTrust = POOL.filter((q) => q.dimension !== "trust");
    expect(() =>
      pickWeeklyQuestions({ pool: withoutTrust, orgId: ORG, isoWeek: WEEK, count: 4 }),
    ).toThrow(/trust/);
    expect(() =>
      pickWeeklyQuestions({ pool: withoutTrust, orgId: ORG, isoWeek: WEEK, count: 5 }),
    ).toThrow(/trust/);
  });

  it("does not require full dimension coverage for count 3", () => {
    const withoutTrust = POOL.filter((q) => q.dimension !== "trust");
    expect(
      pickWeeklyQuestions({ pool: withoutTrust, orgId: ORG, isoWeek: WEEK, count: 3 }),
    ).toHaveLength(3);
  });

  it("returns the draw sorted by sort_order", () => {
    for (const isoWeek of ["2026-W10", "2026-W11", "2026-W12"]) {
      const draw = pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek });
      const orders = draw.map((q) => q.sort_order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    }
  });

  it("does not mutate the pool", () => {
    const snapshot = POOL.map((q) => ({ ...q }));
    pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek: WEEK });
    expect(POOL).toEqual(snapshot);
    expect(codesOf([...POOL])).toEqual(snapshot.map((q) => q.code));
  });
});

// --- personalizeWeeklyDraw -----------------------------------------------------

describe("personalizeWeeklyDraw", () => {
  const baseDraw = [byCode("W1.1"), byCode("W2.1"), byCode("W3.1"), byCode("W4.1")];

  it("returns a non-colliding draw unchanged", () => {
    const result = personalizeWeeklyDraw({
      draw: baseDraw,
      pool: POOL,
      history: ["W1.2", "W2.3"],
      respondentKey: "persona-1",
      isoWeek: WEEK,
    });
    expect(result).toEqual(baseDraw);
  });

  it("replaces a colliding question with a same-dimension question not in history", () => {
    const result = personalizeWeeklyDraw({
      draw: baseDraw,
      pool: POOL,
      history: ["W1.1"],
      respondentKey: "persona-1",
      isoWeek: WEEK,
    });
    expect(result).toHaveLength(4);
    const codes = codesOf(result);
    expect(codes).not.toContain("W1.1");
    expect(codes).toEqual(expect.arrayContaining(["W2.1", "W3.1", "W4.1"]));
    const substitute = result.find((q) => !["W2.1", "W3.1", "W4.1"].includes(q.code));
    expect(substitute).toBeDefined();
    expect(substitute?.dimension).toBe("adoption");
    expect(["W1.2", "W1.3"]).toContain(substitute?.code);
  });

  it("never picks a substitute that is already part of the result", () => {
    const draw = [byCode("W1.1"), byCode("W1.2"), byCode("W2.1"), byCode("W3.1")];
    const result = personalizeWeeklyDraw({
      draw,
      pool: POOL,
      history: ["W1.1"],
      respondentKey: "persona-1",
      isoWeek: WEEK,
    });
    const codes = codesOf(result);
    // W1.2 is already in the result, W1.1 is in history -> only W1.3 remains.
    expect(codes).toEqual(expect.arrayContaining(["W1.2", "W1.3", "W2.1", "W3.1"]));
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("is deterministic for the same respondent and week", () => {
    const args = {
      draw: baseDraw,
      pool: POOL,
      history: ["W1.1", "W3.1"],
      respondentKey: "persona-7",
      isoWeek: WEEK,
    };
    const first = personalizeWeeklyDraw(args);
    const second = personalizeWeeklyDraw(args);
    expect(codesOf(second)).toEqual(codesOf(first));
    expect(second).toEqual(first);
  });

  it("keeps the original question when no substitute candidate exists", () => {
    // The whole adoption dimension was served last week -> no candidate left.
    const result = personalizeWeeklyDraw({
      draw: baseDraw,
      pool: POOL,
      history: ["W1.1", "W1.2", "W1.3"],
      respondentKey: "persona-1",
      isoWeek: WEEK,
    });
    expect(codesOf(result)).toContain("W1.1");
    expect(result).toHaveLength(4);
  });

  it("returns the personalized draw sorted by sort_order without duplicates", () => {
    const unsortedDraw = [byCode("W4.1"), byCode("W1.1"), byCode("W3.1"), byCode("W2.1")];
    const result = personalizeWeeklyDraw({
      draw: unsortedDraw,
      pool: POOL,
      history: ["W4.1"],
      respondentKey: "persona-2",
      isoWeek: WEEK,
    });
    const orders = result.map((q) => q.sort_order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(codesOf(result)).size).toBe(result.length);
  });

  it("does not mutate draw, pool or history", () => {
    const draw = Object.freeze([...baseDraw]) as unknown as Question[];
    const history = Object.freeze(["W1.1"]) as readonly string[];
    const drawSnapshot = codesOf([...draw]);
    const poolSnapshot = POOL.map((q) => ({ ...q }));

    personalizeWeeklyDraw({
      draw,
      pool: POOL,
      history,
      respondentKey: "persona-3",
      isoWeek: WEEK,
    });

    expect(codesOf([...draw])).toEqual(drawSnapshot);
    expect(POOL).toEqual(poolSnapshot);
    expect([...history]).toEqual(["W1.1"]);
  });
});

// --- exclude (previous org draw) ----------------------------------------------

describe("pickWeeklyQuestions · exclude", () => {
  it("never draws an excluded code when the reduced pool stays feasible", () => {
    const prev = pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek: WEEK });
    const next = pickWeeklyQuestions({
      pool: POOL,
      orgId: ORG,
      isoWeek: "2026-W30",
      exclude: codesOf(prev),
    });
    const prevCodes = new Set(codesOf(prev));
    for (const code of codesOf(next)) {
      expect(prevCodes.has(code)).toBe(false);
    }
    // Coverage still holds on the reduced pool.
    for (const dimension of WEEKLY_DIMENSIONS) {
      expect(next.some((q) => q.dimension === dimension)).toBe(true);
    }
  });

  it("ignores the exclusion when it would make the draw infeasible", () => {
    // Excluding all three adoption questions leaves no adoption coverage —
    // the draw must fall back to the full pool instead of throwing.
    const result = pickWeeklyQuestions({
      pool: POOL,
      orgId: ORG,
      isoWeek: WEEK,
      exclude: ["W1.1", "W1.2", "W1.3"],
    });
    expect(result).toHaveLength(5);
    expect(result.some((q) => q.dimension === "adoption")).toBe(true);
    // Fallback equals the unexcluded draw (deterministic).
    expect(codesOf(result)).toEqual(
      codesOf(pickWeeklyQuestions({ pool: POOL, orgId: ORG, isoWeek: WEEK })),
    );
  });

  it("stays deterministic with exclusions", () => {
    const a = pickWeeklyQuestions({
      pool: POOL,
      orgId: ORG,
      isoWeek: WEEK,
      exclude: ["W1.1", "W2.1"],
    });
    const b = pickWeeklyQuestions({
      pool: POOL,
      orgId: ORG,
      isoWeek: WEEK,
      exclude: ["W1.1", "W2.1"],
    });
    expect(codesOf(a)).toEqual(codesOf(b));
  });
});

// --- Monthly selection ----------------------------------------------------------

describe("pickMonthlyQuestions", () => {
  function makeMonthly(code: string, sortOrder: number): Question {
    return {
      ...makeQuestion(code.replace("M", "W") as string, "adoption", sortOrder),
      id: `q-${code}`,
      template_key: "monthly",
      code,
      dimension: "roi",
    };
  }

  const MONTHLY_POOL: Question[] = [
    "M1.1",
    "M1.2",
    "M1.3",
    "M1.4",
    "M2.1",
    "M2.2",
    "M2.3",
    "M3.1",
    "M3.2",
    "M3.3",
    "M4.1",
    "M4.2",
    "M4.3",
    "M4.4",
    "M5.1",
    "M5.2",
    "M5.3",
    "M6.1",
  ].map((code, i) => makeMonthly(code, (i + 1) * 10));

  it("returns 10 questions by default, all core codes included", () => {
    const result = pickMonthlyQuestions({
      pool: MONTHLY_POOL,
      orgId: ORG,
      month: "2026-07",
    });
    expect(result).toHaveLength(10);
    for (const code of MONTHLY_CORE_CODES) {
      expect(codesOf(result)).toContain(code);
    }
    // In range 8..12 per SPEC §4.1.
    expect(result.length).toBeGreaterThanOrEqual(8);
    expect(result.length).toBeLessThanOrEqual(12);
  });

  it("is deterministic per (org, month) and rotates across months", () => {
    const a = pickMonthlyQuestions({
      pool: MONTHLY_POOL,
      orgId: ORG,
      month: "2026-07",
    });
    const b = pickMonthlyQuestions({
      pool: MONTHLY_POOL,
      orgId: ORG,
      month: "2026-07",
    });
    expect(codesOf(a)).toEqual(codesOf(b));

    const months = ["2026-07", "2026-08", "2026-09", "2026-10"];
    const draws = months.map((month) =>
      codesOf(
        pickMonthlyQuestions({ pool: MONTHLY_POOL, orgId: ORG, month }),
      ).join(","),
    );
    expect(new Set(draws).size).toBeGreaterThan(1);
  });

  it("clamps count to 8..12 and sorts by sort_order", () => {
    const small = pickMonthlyQuestions({
      pool: MONTHLY_POOL,
      orgId: ORG,
      month: "2026-07",
      count: 1,
    });
    expect(small).toHaveLength(8);
    const big = pickMonthlyQuestions({
      pool: MONTHLY_POOL,
      orgId: ORG,
      month: "2026-07",
      count: 99,
    });
    expect(big).toHaveLength(12);
    const orders = big.map((q) => q.sort_order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("throws when a core question is missing", () => {
    const poolWithoutNps = MONTHLY_POOL.filter((q) => q.code !== "M6.1");
    expect(() =>
      pickMonthlyQuestions({
        pool: poolWithoutNps,
        orgId: ORG,
        month: "2026-07",
      }),
    ).toThrow(/M6\.1/);
  });
});
