import { describe, expect, it } from "vitest";

import type {
  Choice,
  Dimension,
  Question,
  QuestionType,
  TemplateKey,
} from "@/lib/types";
import { QUESTIONS, TOOL_CATALOG, WEEKLY_POOL, questionsFor } from "./questions";
import { KNOWLEDGE_TIPS } from "./tips";

// --- Helpers ---------------------------------------------------------------

function getQuestion(code: string): Question {
  const question = QUESTIONS.find((q) => q.code === code);
  if (!question) throw new Error(`question ${code} is missing from the seed`);
  return question;
}

function choicesOf(question: Question): Choice[] {
  if (!question.options || question.options.kind !== "choices") {
    throw new Error(`question ${question.code} has no choice options`);
  }
  return question.options.choices;
}

function findChoice(question: Question, value: string): Choice {
  const choice = choicesOf(question).find((c) => c.value === value);
  if (!choice) {
    throw new Error(`question ${question.code} has no choice "${value}"`);
  }
  return choice;
}

// Dictated template / dimension / type mapping for all 42 questions.
const EXPECTED: Record<
  string,
  { template: TemplateKey; dimension: Dimension; type: QuestionType }
> = {
  O1: { template: "onboarding", dimension: "meta", type: "single_choice" },
  O2: { template: "onboarding", dimension: "tools", type: "multi_choice" },
  O3: { template: "onboarding", dimension: "adoption", type: "single_choice" },
  O4: { template: "onboarding", dimension: "learning", type: "scale_1_10" },
  O5: { template: "onboarding", dimension: "adoption", type: "multi_choice" },
  "W1.1": { template: "weekly", dimension: "adoption", type: "single_choice" },
  "W1.2": { template: "weekly", dimension: "adoption", type: "single_choice" },
  "W1.3": { template: "weekly", dimension: "adoption", type: "single_choice" },
  "W2.1": { template: "weekly", dimension: "efficiency", type: "single_choice" },
  "W2.2": { template: "weekly", dimension: "efficiency", type: "text_optional" },
  "W2.3": { template: "weekly", dimension: "efficiency", type: "scale_1_10" },
  "W3.1": { template: "weekly", dimension: "trust", type: "single_choice" },
  "W3.2": { template: "weekly", dimension: "trust", type: "single_choice" },
  "W3.3": { template: "weekly", dimension: "trust", type: "scale_1_10" },
  "W4.1": { template: "weekly", dimension: "sentiment", type: "single_choice" },
  "W4.2": { template: "weekly", dimension: "sentiment", type: "scale_1_10" },
  "W4.3": { template: "weekly", dimension: "sentiment", type: "text_optional" },
  "M1.1": { template: "monthly", dimension: "roi", type: "number" },
  "M1.2": { template: "monthly", dimension: "roi", type: "text_optional" },
  "M1.3": { template: "monthly", dimension: "roi", type: "scale_minus5_plus5" },
  "M1.4": { template: "monthly", dimension: "roi", type: "text_optional" },
  "M2.1": { template: "monthly", dimension: "tools", type: "tool_matrix" },
  "M2.2": { template: "monthly", dimension: "tools", type: "text_optional" },
  "M2.3": { template: "monthly", dimension: "tools", type: "text_optional" },
  "M3.1": { template: "monthly", dimension: "learning", type: "scale_1_10" },
  "M3.2": { template: "monthly", dimension: "learning", type: "multi_choice" },
  "M3.3": { template: "monthly", dimension: "learning", type: "single_choice" },
  "M4.1": { template: "monthly", dimension: "culture", type: "scale_1_10" },
  "M4.2": { template: "monthly", dimension: "culture", type: "single_choice" },
  "M4.3": { template: "monthly", dimension: "culture", type: "text_optional" },
  "M4.4": { template: "monthly", dimension: "culture", type: "text_optional" },
  "M5.1": { template: "monthly", dimension: "strategy", type: "scale_1_10" },
  "M5.2": { template: "monthly", dimension: "strategy", type: "scale_1_10" },
  "M5.3": { template: "monthly", dimension: "strategy", type: "text_optional" },
  "M6.1": { template: "monthly", dimension: "nps", type: "scale_0_10" },
  F1: { template: "leadership", dimension: "roi", type: "currency" },
  F2: { template: "leadership", dimension: "roi", type: "scale_1_10" },
  F3: { template: "leadership", dimension: "roi", type: "text_optional" },
  F4: { template: "leadership", dimension: "culture", type: "text_optional" },
  F5: { template: "leadership", dimension: "roi", type: "currency" },
  F6: { template: "leadership", dimension: "strategy", type: "scale_1_10" },
  F7: { template: "leadership", dimension: "learning", type: "scale_1_10" },
};

const SCALE_RANGES: Partial<Record<QuestionType, { min: number; max: number }>> =
  {
    scale_1_10: { min: 1, max: 10 },
    scale_0_10: { min: 0, max: 10 },
    scale_minus5_plus5: { min: -5, max: 5 },
  };

// Dictated stable choice values (Phase-2 KPI formulas depend on them).
const EXPECTED_CHOICE_VALUES: Record<string, string[]> = {
  O1: [
    "management",
    "sales",
    "marketing",
    "hr",
    "finance",
    "it",
    "operations",
    "support",
    "rnd",
    "other",
  ],
  O2: [
    "copilot365",
    "chatgpt",
    "claude",
    "gemini",
    "perplexity",
    "github_copilot",
    "notion_ai",
    "deepl_write",
    "internal_ai",
    "other",
    "none",
  ],
  O3: ["lt_1m", "1_3m", "3_6m", "6_12m", "gt_1y", "not_yet"],
  O5: [
    "writing",
    "emails",
    "research",
    "summaries",
    "translation",
    "data_analysis",
    "coding",
    "brainstorming",
    "presentations",
    "images",
    "meeting_notes",
    "other",
  ],
  "W1.1": ["none", "1_2", "3_5", "daily", "multiple_daily"],
  "W1.3": ["yes", "no"],
  "W2.1": ["none", "lt_1", "1_3", "3_5", "5_10", "gt_10"],
  "W3.1": ["never", "rarely", "sometimes", "often", "almost_always"],
  "W3.2": ["yes", "no", "dont_know"],
  "W4.1": [
    "strong_relief",
    "some_relief",
    "neutral",
    "some_strain",
    "strong_strain",
  ],
  "M3.2": [
    "basics",
    "prompt_engineering",
    "specific_tool",
    "data_analysis",
    "creative",
    "privacy_legal",
    "ethics",
    "automation",
    "none",
  ],
  "M3.3": ["yes", "no"],
  "M4.2": ["regularly", "sometimes", "rarely", "never"],
};

/** Matches a direct Du-form address in the German question text. */
const DU_ADDRESS = /\b(du|dich|dir|dein\w*|ihr|euch|euer|eure\w*)\b/i;

// --- Tests -------------------------------------------------------------------

describe("questionnaire seed v1.1", () => {
  it("contains 42 questions with per-template counts 5/12/18/7", () => {
    expect(QUESTIONS).toHaveLength(42);
    const countBy = (template: TemplateKey) =>
      QUESTIONS.filter((q) => q.template_key === template).length;
    expect(countBy("onboarding")).toBe(5);
    expect(countBy("weekly")).toBe(12);
    expect(countBy("monthly")).toBe(18);
    expect(countBy("leadership")).toBe(7);
  });

  it("contains exactly the dictated question codes", () => {
    expect(Object.keys(EXPECTED)).toHaveLength(42);
    expect(QUESTIONS.map((q) => q.code).sort()).toEqual(
      Object.keys(EXPECTED).sort(),
    );
  });

  it("has unique codes and ids, with ids derived from lowercased codes", () => {
    const codes = QUESTIONS.map((q) => q.code);
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(codes).size).toBe(QUESTIONS.length);
    expect(new Set(ids).size).toBe(QUESTIONS.length);
    for (const question of QUESTIONS) {
      expect(question.id).toBe(`q-${question.code.toLowerCase()}`);
    }
  });

  it("dictated template, dimension and type mapping holds for all 42 questions", () => {
    for (const question of QUESTIONS) {
      const expected = EXPECTED[question.code];
      expect(expected, `unexpected code ${question.code}`).toBeDefined();
      if (!expected) continue;
      expect(question.template_key, question.code).toBe(expected.template);
      expect(question.dimension, question.code).toBe(expected.dimension);
      expect(question.type, question.code).toBe(expected.type);
    }
  });

  it("every question is active and has a non-null text_sie", () => {
    for (const question of QUESTIONS) {
      expect(question.active, question.code).toBe(true);
      expect(question.text_sie, question.code).not.toBeNull();
      expect(question.text_sie, question.code).not.toBe("");
    }
  });

  it("Sie variant differs from Du text wherever the respondent is addressed directly", () => {
    // Explicit spot checks.
    for (const code of ["O1", "W1.1", "M5.1", "F7"]) {
      const question = getQuestion(code);
      expect(question.text_sie, code).not.toBe(question.text);
    }
    // General rule: any Du address forces a distinct Sie text.
    for (const question of QUESTIONS) {
      if (DU_ADDRESS.test(question.text)) {
        expect(question.text_sie, question.code).not.toBe(question.text);
      }
    }
  });

  it("weekly pool has exactly 3 questions per weekly dimension", () => {
    expect(WEEKLY_POOL).toHaveLength(12);
    for (const dimension of ["adoption", "efficiency", "trust", "sentiment"]) {
      const count = WEEKLY_POOL.filter(
        (q) => q.dimension === dimension,
      ).length;
      expect(count, dimension).toBe(3);
    }
  });

  it("gap pairs are symmetric and limited to M5.1<->F6 and M3.1<->F7", () => {
    const paired = QUESTIONS.filter((q) => q.is_gap_pair_with !== null);
    expect(paired.map((q) => q.code).sort()).toEqual([
      "F6",
      "F7",
      "M3.1",
      "M5.1",
    ]);
    expect(getQuestion("M5.1").is_gap_pair_with).toBe("F6");
    expect(getQuestion("F6").is_gap_pair_with).toBe("M5.1");
    expect(getQuestion("M3.1").is_gap_pair_with).toBe("F7");
    expect(getQuestion("F7").is_gap_pair_with).toBe("M3.1");
  });

  it("choice values are unique within every choice question", () => {
    for (const question of QUESTIONS) {
      if (question.options?.kind !== "choices") continue;
      const values = question.options.choices.map((c) => c.value);
      expect(new Set(values).size, question.code).toBe(values.length);
      for (const choice of question.options.choices) {
        expect(choice.label, `${question.code}/${choice.value}`).not.toBe("");
      }
    }
  });

  it("stable choice values match the dictated lists in order", () => {
    for (const [code, expectedValues] of Object.entries(
      EXPECTED_CHOICE_VALUES,
    )) {
      const values = choicesOf(getQuestion(code)).map((c) => c.value);
      expect(values, code).toEqual(expectedValues);
    }
  });

  it("scale options match the range of their scale type for all scale questions", () => {
    const scaleQuestions = QUESTIONS.filter((q) => SCALE_RANGES[q.type]);
    expect(scaleQuestions).toHaveLength(13);
    for (const question of scaleQuestions) {
      const range = SCALE_RANGES[question.type];
      expect(range).toBeDefined();
      if (!range) continue;
      expect(question.options?.kind, question.code).toBe("scale");
      if (question.options?.kind !== "scale") continue;
      expect(question.options.min, question.code).toBe(range.min);
      expect(question.options.max, question.code).toBe(range.max);
      expect(question.options.min_label, question.code).not.toBe("");
      expect(question.options.max_label, question.code).not.toBe("");
    }
  });

  it("only W1.2 and M2.1 are conditional on having a tool", () => {
    for (const question of QUESTIONS) {
      if (question.code === "W1.2" || question.code === "M2.1") {
        expect(question.condition, question.code).toEqual({
          requires_tool: true,
        });
      } else {
        expect(question.condition, question.code).toBeNull();
      }
    }
  });

  it("O2: 'none' is exclusive, 'other' allows free text", () => {
    const o2 = getQuestion("O2");
    const none = findChoice(o2, "none");
    expect(none.exclusive).toBe(true);
    expect(none.label).toBe("Aktuell keine");
    expect(findChoice(o2, "other").allows_text).toBe(true);
  });

  it("other inline-text and exclusive options are flagged (O5, W1.3, W3.2, M3.2)", () => {
    expect(findChoice(getQuestion("O5"), "other").allows_text).toBe(true);
    expect(findChoice(getQuestion("W1.3"), "yes").allows_text).toBe(true);
    expect(findChoice(getQuestion("W3.2"), "yes").allows_text).toBe(true);
    const m32none = findChoice(getQuestion("M3.2"), "none");
    expect(m32none.exclusive).toBe(true);
    expect(m32none.label).toBe("Kein Bedarf");
    expect(findChoice(getQuestion("M3.2"), "specific_tool").allows_text).toBe(
      true,
    );
  });

  it("W2.1 has exactly the dictated bucket values in order", () => {
    expect(choicesOf(getQuestion("W2.1")).map((c) => c.value)).toEqual([
      "none",
      "lt_1",
      "1_3",
      "3_5",
      "5_10",
      "gt_10",
    ]);
  });

  it("M3.3 carries the 'Ja' inline text and the helpfulness follow-up scale", () => {
    const m33 = getQuestion("M3.3");
    expect(findChoice(m33, "yes").allows_text).toBe(true);
    if (m33.options?.kind !== "choices") throw new Error("M3.3 needs choices");
    expect(m33.options.followup_scale).toEqual({
      on_value: "yes",
      text: "Wie hilfreich war er?",
    });
  });

  it("number and currency questions carry unit and non-negative minimum", () => {
    const expectations: [string, string][] = [
      ["M1.1", "Stunden"],
      ["F1", "€"],
      ["F5", "€/Stunde"],
    ];
    for (const [code, unit] of expectations) {
      const question = getQuestion(code);
      expect(question.options?.kind, code).toBe("number");
      if (question.options?.kind !== "number") continue;
      expect(question.options.unit, code).toBe(unit);
      expect(question.options.min, code).toBe(0);
    }
  });

  it("M2.1 is a tool_matrix whose rows come from the profile, not the seed", () => {
    expect(getQuestion("M2.1").options).toEqual({ kind: "tool_matrix" });
  });

  it("TOOL_CATALOG lists exactly the 9 real tools from O2", () => {
    expect(TOOL_CATALOG).toHaveLength(9);
    const o2Values = choicesOf(getQuestion("O2")).map((c) => c.value);
    expect(o2Values).toEqual([
      ...TOOL_CATALOG.map((c) => c.value),
      "other",
      "none",
    ]);
    // W1.2 offers the same catalog (narrowed at runtime via requires_tool).
    expect(choicesOf(getQuestion("W1.2")).map((c) => c.value)).toEqual(
      TOOL_CATALOG.map((c) => c.value),
    );
  });

  it("W4.1 keeps the emoji labels from the source", () => {
    const labels = choicesOf(getQuestion("W4.1")).map((c) => c.label);
    expect(labels).toEqual([
      "Stark entlastend 😀",
      "Eher entlastend 🙂",
      "Neutral 😐",
      "Eher belastend 😕",
      "Stark belastend 😞",
    ]);
  });

  it("questionsFor returns active questions of a template sorted by sort_order", () => {
    const templates: [TemplateKey, number][] = [
      ["onboarding", 5],
      ["weekly", 12],
      ["monthly", 18],
      ["leadership", 7],
    ];
    for (const [template, count] of templates) {
      const questions = questionsFor(template);
      expect(questions, template).toHaveLength(count);
      const orders = questions.map((q) => q.sort_order);
      expect(orders, template).toEqual([...orders].sort((a, b) => a - b));
      expect(new Set(orders).size, template).toBe(orders.length);
      for (const question of questions) {
        expect(question.template_key).toBe(template);
        expect(question.active).toBe(true);
      }
    }
  });
});

describe("knowledge tips seed", () => {
  it("has at least 8 tips with unique ids and non-empty Du/Sie texts under 200 chars", () => {
    expect(KNOWLEDGE_TIPS.length).toBeGreaterThanOrEqual(8);
    const ids = KNOWLEDGE_TIPS.map((tip) => tip.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tip of KNOWLEDGE_TIPS) {
      expect(tip.text.length, tip.id).toBeGreaterThan(0);
      expect(tip.text_sie.length, tip.id).toBeGreaterThan(0);
      expect(tip.text.length, tip.id).toBeLessThan(200);
      expect(tip.text_sie.length, tip.id).toBeLessThan(200);
    }
  });
});
