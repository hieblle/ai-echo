/**
 * Unit tests for the conditional survey logic (SPEC.md §9).
 *
 * Fixtures are built inline on purpose — lib/seed/ is developed concurrently
 * and must not be imported here.
 */

import { describe, expect, it } from "vitest";

import type { Choice, Question, RespondentProfile } from "@/lib/types";
import {
  NON_USER_WEEKLY_CODES,
  applyConditionalLogic,
  resolveToolChoices,
  shortWeeklyVariant,
} from "@/lib/domain/conditional";

// --- Fixtures ---------------------------------------------------------------

const toolCatalog: Choice[] = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "copilot", label: "GitHub Copilot" },
  { value: "midjourney", label: "Midjourney" },
  { value: "claude", label: "Claude" },
];

function makeQuestion(overrides: Partial<Question> & { code: string }): Question {
  return {
    id: `q-${overrides.code}`,
    template_key: "weekly",
    dimension: "adoption",
    type: "scale_1_10",
    text: "Fixture question text",
    text_sie: null,
    options: {
      kind: "scale",
      min: 1,
      max: 10,
      min_label: "low",
      max_label: "high",
    },
    condition: null,
    is_gap_pair_with: null,
    sort_order: 0,
    active: true,
    ...overrides,
  };
}

/** Weekly pool W1.1..W4.3 incl. the requires_tool single_choice W1.2. */
function makeWeeklyPool(): Question[] {
  return [
    makeQuestion({ code: "W1.1", type: "single_choice", dimension: "adoption" }),
    makeQuestion({
      code: "W1.2",
      type: "single_choice",
      dimension: "adoption",
      condition: { requires_tool: true },
      options: { kind: "choices", choices: [...toolCatalog] },
    }),
    makeQuestion({ code: "W2.1", type: "single_choice", dimension: "efficiency" }),
    makeQuestion({ code: "W2.3", dimension: "efficiency" }),
    makeQuestion({ code: "W3.1", type: "single_choice", dimension: "trust" }),
    makeQuestion({ code: "W3.3", dimension: "trust" }),
    makeQuestion({ code: "W4.1", type: "single_choice", dimension: "sentiment" }),
    makeQuestion({ code: "W4.2", dimension: "sentiment" }),
    makeQuestion({ code: "W4.3", type: "text_optional", dimension: "sentiment", options: { kind: "text" } }),
  ];
}

/** Monthly tool_matrix M2.1 — rows are resolved at render time. */
function makeToolMatrix(): Question {
  return makeQuestion({
    code: "M2.1",
    template_key: "monthly",
    type: "tool_matrix",
    dimension: "tools",
    condition: { requires_tool: true },
    options: { kind: "tool_matrix" },
  });
}

function makeProfile(tools: string[]): RespondentProfile {
  return {
    respondent_key: "persona-1",
    org_id: "org-1",
    department_id: "dep-1",
    role_scope: "employee",
    tools_used: tools,
    uses_no_tools: tools.length === 0,
    ai_experience: null,
    question_history: null,
    onboarding_completed: true,
    completed_cycles: [],
  };
}

// --- shortWeeklyVariant -------------------------------------------------------

describe("NON_USER_WEEKLY_CODES", () => {
  it("is exactly W1.1 + W4.1 + W4.2 (SPEC.md §9)", () => {
    expect(NON_USER_WEEKLY_CODES).toEqual(["W1.1", "W4.1", "W4.2"]);
  });
});

describe("shortWeeklyVariant", () => {
  it("picks exactly the non-user codes from the pool, in that order", () => {
    const result = shortWeeklyVariant(makeWeeklyPool());
    expect(result.map((q) => q.code)).toEqual(["W1.1", "W4.1", "W4.2"]);
  });

  it("keeps the fixed order even when the pool is ordered differently", () => {
    const shuffled = makeWeeklyPool().reverse();
    const result = shortWeeklyVariant(shuffled);
    expect(result.map((q) => q.code)).toEqual(["W1.1", "W4.1", "W4.2"]);
  });

  it("returns the original pool questions (no cloning needed)", () => {
    const pool = makeWeeklyPool();
    const result = shortWeeklyVariant(pool);
    expect(result[0]).toBe(pool.find((q) => q.code === "W1.1"));
  });

  it("throws when a required code is missing from the pool", () => {
    const pool = makeWeeklyPool().filter((q) => q.code !== "W4.1");
    expect(() => shortWeeklyVariant(pool)).toThrowError(/W4\.1/);
  });
});

// --- resolveToolChoices -------------------------------------------------------

describe("resolveToolChoices", () => {
  it("returns the intersection of catalog and profile tools", () => {
    const profile = makeProfile(["chatgpt", "midjourney"]);
    const result = resolveToolChoices(profile, toolCatalog);
    expect(result.map((c) => c.value)).toEqual(["chatgpt", "midjourney"]);
  });

  it("preserves catalog order regardless of profile order", () => {
    const profile = makeProfile(["claude", "copilot", "chatgpt"]);
    const result = resolveToolChoices(profile, toolCatalog);
    expect(result.map((c) => c.value)).toEqual(["chatgpt", "copilot", "claude"]);
  });

  it("ignores unknown values in tools_used", () => {
    const profile = makeProfile(["chatgpt", "notion-ai", "does-not-exist"]);
    const result = resolveToolChoices(profile, toolCatalog);
    expect(result.map((c) => c.value)).toEqual(["chatgpt"]);
  });

  it("returns [] for a profile without tools", () => {
    expect(resolveToolChoices(makeProfile([]), toolCatalog)).toEqual([]);
  });

  it("returns [] when only unknown tools are used", () => {
    const profile = makeProfile(["unknown-tool"]);
    expect(resolveToolChoices(profile, toolCatalog)).toEqual([]);
  });
});

// --- applyConditionalLogic ----------------------------------------------------

describe("applyConditionalLogic", () => {
  it("drops requires_tool questions when the profile has no matching tools", () => {
    const questions = [...makeWeeklyPool(), makeToolMatrix()];
    const result = applyConditionalLogic({
      questions,
      profile: makeProfile([]),
      toolCatalog,
    });
    expect(result.map((q) => q.code)).not.toContain("W1.2");
    expect(result.map((q) => q.code)).not.toContain("M2.1");
    expect(result).toHaveLength(questions.length - 2);
  });

  it("drops requires_tool questions when tools_used only contains unknown values", () => {
    const result = applyConditionalLogic({
      questions: makeWeeklyPool(),
      profile: makeProfile(["unknown-tool"]),
      toolCatalog,
    });
    expect(result.map((q) => q.code)).not.toContain("W1.2");
  });

  it("replaces W1.2 choices with exactly the profile tools, in catalog order", () => {
    const result = applyConditionalLogic({
      questions: makeWeeklyPool(),
      profile: makeProfile(["claude", "chatgpt"]),
      toolCatalog,
    });
    const w12 = result.find((q) => q.code === "W1.2");
    expect(w12).toBeDefined();
    if (w12?.options?.kind !== "choices") {
      throw new Error("expected W1.2 to keep choices options");
    }
    expect(w12.options.choices.map((c) => c.value)).toEqual([
      "chatgpt",
      "claude",
    ]);
  });

  it("leaves questions without requires_tool untouched (same reference)", () => {
    const questions = makeWeeklyPool();
    const result = applyConditionalLogic({
      questions,
      profile: makeProfile(["chatgpt"]),
      toolCatalog,
    });
    const w11In = questions.find((q) => q.code === "W1.1");
    const w11Out = result.find((q) => q.code === "W1.1");
    expect(w11Out).toBe(w11In);
  });

  it("returns a new object for W1.2 and never mutates the original question", () => {
    const questions = makeWeeklyPool();
    const originalW12 = questions.find((q) => q.code === "W1.2");
    if (!originalW12) throw new Error("fixture is missing W1.2");
    const snapshot = JSON.parse(JSON.stringify(originalW12)) as Question;

    const result = applyConditionalLogic({
      questions,
      profile: makeProfile(["chatgpt"]),
      toolCatalog,
    });
    const clonedW12 = result.find((q) => q.code === "W1.2");

    expect(clonedW12).toBeDefined();
    expect(clonedW12).not.toBe(originalW12);
    expect(clonedW12?.options).not.toBe(originalW12.options);
    // Original still carries the full catalog as choices.
    expect(originalW12).toEqual(snapshot);
  });

  it("does not mutate the input questions array", () => {
    const questions = [...makeWeeklyPool(), makeToolMatrix()];
    const snapshot = JSON.parse(JSON.stringify(questions)) as Question[];
    applyConditionalLogic({
      questions,
      profile: makeProfile(["copilot"]),
      toolCatalog,
    });
    expect(questions).toEqual(snapshot);
  });

  it("passes tool_matrix questions through unchanged when tools exist", () => {
    const matrix = makeToolMatrix();
    const result = applyConditionalLogic({
      questions: [matrix],
      profile: makeProfile(["midjourney"]),
      toolCatalog,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(matrix);
  });

  it("drops tool_matrix questions when no tools match", () => {
    const result = applyConditionalLogic({
      questions: [makeToolMatrix()],
      profile: makeProfile([]),
      toolCatalog,
    });
    expect(result).toEqual([]);
  });
});
