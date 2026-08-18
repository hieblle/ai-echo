import { describe, expect, it } from "vitest";
import type {
  GapPairKey,
  GapPairResult,
  OrgToolSetting,
  RecommendationRule,
  ToolUsageStat,
  TrainingWishStat,
  WeeklyKpis,
} from "@/lib/types";
import { RECOMMENDATION_RULES } from "@/lib/seed/rules";
import { evaluateTriggers, type TriggerEvaluationInput } from "./triggers";

// --- Fixtures ----------------------------------------------------------------

function makeInput(
  overrides: Partial<TriggerEvaluationInput> = {},
): TriggerEvaluationInput {
  return {
    weekly: [],
    gapPairs: [],
    toolUsage: [],
    toolSettings: [],
    trainingWishes: [],
    ...overrides,
  };
}

type WeeklyMetric =
  | "adoption_rate"
  | "trust_index"
  | "sentiment_index"
  | "participation_rate";

/** Chronological weekly series with one metric set, everything else null. */
function weeklySeries(
  metric: WeeklyMetric,
  values: (number | null)[],
): WeeklyKpis[] {
  return values.map((value, index) => ({
    week: `2026-W${String(10 + index).padStart(2, "0")}`,
    n_pulse: 12,
    // Large enough that every fixture week counts as adoption evidence
    // (R1's thin-sample guard is tested separately).
    n_adoption: 12,
    adoption_rate: null,
    power_user_share: null,
    saved_hours_sum: 0,
    efficiency_index: null,
    trust_index: null,
    sentiment_index: null,
    participation_rate: null,
    [metric]: value,
  }));
}

function makeGapPair(
  pair: GapPairKey,
  employee: number | null,
  leadership: number | null,
): GapPairResult {
  return {
    pair,
    employee_value: employee,
    leadership_value: leadership,
    gap: employee !== null && leadership !== null ? leadership - employee : null,
    n_employee: 8,
    n_leadership: 5,
  };
}

function makeUsage(
  tool_value: string,
  mentions: number,
  total: number,
): ToolUsageStat {
  return {
    tool_value,
    mentions,
    total,
    share: total === 0 ? null : mentions / total,
  };
}

function makeToolSetting(
  tool_value: string,
  tool_label: string,
  monthly_license_cost_eur: number,
  active = true,
): OrgToolSetting {
  return {
    id: `setting-${tool_value}`,
    org_id: "org-demo",
    tool_value,
    tool_label,
    monthly_license_cost_eur,
    active,
  };
}

function makeWish(topic: string, share: number, total = 20): TrainingWishStat {
  return { topic, count: Math.round(share * total), total, share };
}

const ALL_RULES = RECOMMENDATION_RULES;

function evaluate(input: TriggerEvaluationInput, rules = ALL_RULES) {
  return evaluateTriggers(input, rules);
}

// --- Seed sanity (rules are data) ---------------------------------------------

describe("RECOMMENDATION_RULES seed", () => {
  it("contains exactly R1–R7, all active", () => {
    expect(ALL_RULES.map((r) => r.key)).toEqual([
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
      "R6",
      "R7",
    ]);
    expect(ALL_RULES.every((r) => r.active)).toBe(true);
  });

  it("uses the action types from SPEC §11", () => {
    const byKey = Object.fromEntries(ALL_RULES.map((r) => [r.key, r.action_type]));
    expect(byKey).toEqual({
      R1: "course",
      R2: "course",
      R3: "strategy_call",
      R4: "course",
      R5: "license_review",
      R6: "communication",
      R7: "communication",
    });
  });

  it("carries course URLs only on course rules", () => {
    for (const rule of ALL_RULES) {
      if (rule.action_type === "course") {
        expect(rule.course_url).toMatch(/^https:\/\/academy\.dbrains\.example\//);
      } else {
        expect(rule.course_url).toBeNull();
      }
    }
  });
});

// --- R1: adoption rate < 50 % for 2 weeks ---------------------------------------

describe("R1 — Adoption < 50 % über 2 Wochen", () => {
  it("fires when the last two adoption rates are below 50 %", () => {
    const input = makeInput({
      weekly: weeklySeries("adoption_rate", [0.7, 0.42, 0.38]),
    });
    expect(evaluate(input)).toEqual([
      {
        rule_key: "R1",
        context: "",
        detail: "Adoption-Rate zuletzt 42 % und 38 % (Schwelle: 50 %).",
      },
    ]);
  });

  it("does not fire at exactly 50 %", () => {
    const input = makeInput({
      weekly: weeklySeries("adoption_rate", [0.5, 0.5]),
    });
    expect(evaluate(input)).toEqual([]);
  });

  it("does not fire when only one of the last two weeks is below", () => {
    expect(
      evaluate(makeInput({ weekly: weeklySeries("adoption_rate", [0.6, 0.3]) })),
    ).toEqual([]);
    expect(
      evaluate(makeInput({ weekly: weeklySeries("adoption_rate", [0.3, 0.6]) })),
    ).toEqual([]);
  });

  it("does not fire on a single data point", () => {
    const input = makeInput({ weekly: weeklySeries("adoption_rate", [0.38]) });
    expect(evaluate(input)).toEqual([]);
  });

  it("skips weeks without adoption data when picking the last two", () => {
    const input = makeInput({
      weekly: weeklySeries("adoption_rate", [0.4, null, 0.45]),
    });
    expect(evaluate(input)).toEqual([
      {
        rule_key: "R1",
        context: "",
        detail: "Adoption-Rate zuletzt 40 % und 45 % (Schwelle: 50 %).",
      },
    ]);
  });
});

// --- R2: trust index < 5 --------------------------------------------------------

describe("R2 — Vertrauensindex < 5", () => {
  it("fires when the latest trust index is below 5", () => {
    const input = makeInput({ weekly: weeklySeries("trust_index", [6, 4.2]) });
    expect(evaluate(input)).toEqual([
      {
        rule_key: "R2",
        context: "",
        detail: "Vertrauensindex aktuell 4,2 (Schwelle: 5).",
      },
    ]);
  });

  it("does not fire at exactly 5", () => {
    const input = makeInput({ weekly: weeklySeries("trust_index", [4, 5]) });
    expect(evaluate(input)).toEqual([]);
  });

  it("uses the latest NON-NULL value (trailing nulls are skipped)", () => {
    const input = makeInput({ weekly: weeklySeries("trust_index", [4.9, null]) });
    expect(evaluate(input)).toEqual([
      {
        rule_key: "R2",
        context: "",
        detail: "Vertrauensindex aktuell 4,9 (Schwelle: 5).",
      },
    ]);
  });

  it("does not fire without any trust data", () => {
    const input = makeInput({ weekly: weeklySeries("trust_index", [null, null]) });
    expect(evaluate(input)).toEqual([]);
  });
});

// --- R3: sentiment declining 3 cycles in a row ----------------------------------

describe("R3 — Stimmungsindex sinkt 3 Zyklen in Folge", () => {
  it("fires on 4 strictly declining values", () => {
    const input = makeInput({
      weekly: weeklySeries("sentiment_index", [7, 6.5, 6, 5.5]),
    });
    expect(evaluate(input)).toEqual([
      {
        rule_key: "R3",
        context: "",
        detail:
          "Stimmungsindex sinkt seit 3 Zyklen in Folge: 7,0 → 6,5 → 6,0 → 5,5.",
      },
    ]);
  });

  it("does not fire when a plateau breaks the streak", () => {
    const input = makeInput({
      weekly: weeklySeries("sentiment_index", [7, 6.5, 6.5, 6]),
    });
    expect(evaluate(input)).toEqual([]);
  });

  it("does not fire with only 3 values", () => {
    const input = makeInput({
      weekly: weeklySeries("sentiment_index", [7, 6, 5]),
    });
    expect(evaluate(input)).toEqual([]);
  });

  it("looks only at the LAST 4 non-null values", () => {
    // Earlier rise is irrelevant; the last 4 (7 > 6 > 5 > 4) decline strictly.
    const fires = makeInput({
      weekly: weeklySeries("sentiment_index", [2, null, 7, 6, 5, 4]),
    });
    expect(evaluate(fires)).toHaveLength(1);

    // Earlier decline does not help when the last 4 contain a plateau.
    const broken = makeInput({
      weekly: weeklySeries("sentiment_index", [8, 7, 6, 5, 5]),
    });
    expect(evaluate(broken)).toEqual([]);
  });

  it("does not fire on a rising series", () => {
    const input = makeInput({
      weekly: weeklySeries("sentiment_index", [5, 6, 7, 8]),
    });
    expect(evaluate(input)).toEqual([]);
  });
});

// --- R4: training wish > 30 % ----------------------------------------------------

describe("R4 — Schulungswunsch > 30 %", () => {
  it("fires once per qualifying topic, ordered by context", () => {
    const input = makeInput({
      trainingWishes: [
        makeWish("prompting", 0.42),
        makeWish("datenschutz", 0.35),
        makeWish("automatisierung", 0.1),
        makeWish("none", 0.9),
      ],
    });
    expect(evaluate(input)).toEqual([
      {
        rule_key: "R4",
        context: "datenschutz",
        detail:
          "35 % wünschen sich eine Schulung zum Thema „datenschutz“ (Schwelle: 30 %).",
      },
      {
        rule_key: "R4",
        context: "prompting",
        detail:
          "42 % wünschen sich eine Schulung zum Thema „prompting“ (Schwelle: 30 %).",
      },
    ]);
  });

  it("does not fire at exactly 30 %", () => {
    const input = makeInput({ trainingWishes: [makeWish("prompting", 0.3)] });
    expect(evaluate(input)).toEqual([]);
  });

  it('never fires for the "none" topic', () => {
    const input = makeInput({ trainingWishes: [makeWish("none", 0.9)] });
    expect(evaluate(input)).toEqual([]);
  });
});

// --- R5: paid tool < 20 % usage ---------------------------------------------------

describe("R5 — bezahltes Tool < 20 % Nutzung", () => {
  const copilot = makeToolSetting("copilot365", "Copilot 365", 30);

  it("fires for an active paid tool below 20 % share", () => {
    const input = makeInput({
      toolSettings: [copilot],
      toolUsage: [makeUsage("copilot365", 1, 10), makeUsage("chatgpt", 9, 10)],
    });
    expect(evaluate(input)).toEqual([
      {
        rule_key: "R5",
        context: "copilot365",
        detail:
          "Bezahltes Tool „Copilot 365“ (30 € pro Monat) wird nur von 10 % als meistgenutztes Tool genannt (Schwelle: 20 %).",
      },
    ]);
  });

  it("does not fire at exactly 20 %", () => {
    const input = makeInput({
      toolSettings: [copilot],
      toolUsage: [makeUsage("copilot365", 2, 10)],
    });
    expect(evaluate(input)).toEqual([]);
  });

  it("data guard: does not fire with fewer than 10 total answers, even at 0 %", () => {
    const input = makeInput({
      toolSettings: [copilot],
      toolUsage: [makeUsage("copilot365", 0, 9), makeUsage("chatgpt", 9, 9)],
    });
    expect(evaluate(input)).toEqual([]);
  });

  it("data guard: does not fire when there are no usage stats at all", () => {
    const input = makeInput({ toolSettings: [copilot], toolUsage: [] });
    expect(evaluate(input)).toEqual([]);
  });

  it("counts a tool without a usage entry as 0 % share", () => {
    const input = makeInput({
      toolSettings: [copilot],
      toolUsage: [makeUsage("chatgpt", 12, 12)],
    });
    expect(evaluate(input)).toEqual([
      {
        rule_key: "R5",
        context: "copilot365",
        detail:
          "Bezahltes Tool „Copilot 365“ (30 € pro Monat) wird nur von 0 % als meistgenutztes Tool genannt (Schwelle: 20 %).",
      },
    ]);
  });

  it("never fires for an inactive tool setting", () => {
    const input = makeInput({
      toolSettings: [makeToolSetting("copilot365", "Copilot 365", 30, false)],
      toolUsage: [makeUsage("chatgpt", 12, 12)],
    });
    expect(evaluate(input)).toEqual([]);
  });

  it("never fires for a tool without license cost", () => {
    const input = makeInput({
      toolSettings: [makeToolSetting("chatgpt", "ChatGPT (free)", 0)],
      toolUsage: [makeUsage("claude", 12, 12)],
    });
    expect(evaluate(input)).toEqual([]);
  });
});

// --- R6: perception gap > 3 points ------------------------------------------------

describe("R6 — Perception Gap > 3 Punkte", () => {
  it("fires per pair with a positive gap above 3, with German pair names", () => {
    const input = makeInput({
      gapPairs: [
        makeGapPair("strategy", 4.2, 8.5),
        makeGapPair("competence", 6, 7),
      ],
    });
    expect(evaluate(input)).toEqual([
      {
        rule_key: "R6",
        context: "strategy",
        detail:
          "Perception Gap bei Strategie-Klarheit: Führung 8,5 vs. Mitarbeitende 4,2 (Differenz 4,3 Punkte, Schwelle: 3).",
      },
    ]);
  });

  it("does not fire at exactly 3 points", () => {
    const input = makeInput({ gapPairs: [makeGapPair("competence", 5, 8)] });
    expect(evaluate(input)).toEqual([]);
  });

  it("does not fire on a negative gap (employees more optimistic)", () => {
    const input = makeInput({ gapPairs: [makeGapPair("benefit", 8, 4)] });
    expect(evaluate(input)).toEqual([]);
  });

  it("does not fire when the gap is null", () => {
    const input = makeInput({ gapPairs: [makeGapPair("strategy", null, 9)] });
    expect(evaluate(input)).toEqual([]);
  });

  it("fires one result per qualifying pair, ordered by context", () => {
    const input = makeInput({
      gapPairs: [
        makeGapPair("strategy", 3, 7.5),
        makeGapPair("benefit", 2, 6.5),
      ],
    });
    const results = evaluate(input);
    expect(results.map((r) => r.context)).toEqual(["benefit", "strategy"]);
    expect(results.every((r) => r.rule_key === "R6")).toBe(true);
    expect(results[0]?.detail).toBe(
      "Perception Gap bei Nutzen-Einschätzung: Führung 6,5 vs. Mitarbeitende 2,0 (Differenz 4,5 Punkte, Schwelle: 3).",
    );
  });
});

// --- R7: participation < 40 % for 2 cycles ------------------------------------------

describe("R7 — Teilnahmequote < 40 % über 2 Zyklen", () => {
  it("fires when the last two participation rates are below 40 %", () => {
    const input = makeInput({
      weekly: weeklySeries("participation_rate", [0.6, 0.35, 0.3]),
    });
    expect(evaluate(input)).toEqual([
      {
        rule_key: "R7",
        context: "",
        detail: "Teilnahmequote zuletzt 35 % und 30 % (Schwelle: 40 %).",
      },
    ]);
  });

  it("does not fire at exactly 40 %", () => {
    const input = makeInput({
      weekly: weeklySeries("participation_rate", [0.4, 0.4]),
    });
    expect(evaluate(input)).toEqual([]);
  });

  it("does not fire when only one of the last two cycles is below", () => {
    expect(
      evaluate(
        makeInput({ weekly: weeklySeries("participation_rate", [0.3, 0.45]) }),
      ),
    ).toEqual([]);
    expect(
      evaluate(
        makeInput({ weekly: weeklySeries("participation_rate", [0.45, 0.3]) }),
      ),
    ).toEqual([]);
  });

  it("does not fire on a single data point", () => {
    const input = makeInput({
      weekly: weeklySeries("participation_rate", [0.2]),
    });
    expect(evaluate(input)).toEqual([]);
  });
});

// --- Engine behavior ------------------------------------------------------------

describe("evaluateTriggers engine", () => {
  const firingR2Input = makeInput({ weekly: weeklySeries("trust_index", [3]) });

  it("never fires an inactive rule", () => {
    const rules = ALL_RULES.map((rule) =>
      rule.key === "R2" ? { ...rule, active: false } : rule,
    );
    expect(evaluate(firingR2Input, rules)).toEqual([]);
  });

  it("does not evaluate rules missing from the list", () => {
    const rules = ALL_RULES.filter((rule) => rule.key !== "R2");
    expect(evaluate(firingR2Input, rules)).toEqual([]);
  });

  it("ignores unknown rule keys", () => {
    const rules: RecommendationRule[] = [
      {
        key: "R99",
        title: "Unbekannt",
        description: "Unbekannte Regel",
        action_type: "communication",
        course_url: null,
        active: true,
      },
    ];
    expect(evaluate(firingR2Input, rules)).toEqual([]);
  });

  it("returns nothing on empty input", () => {
    expect(evaluate(makeInput())).toEqual([]);
  });

  it("orders results by rule key ascending, then context", () => {
    const input = makeInput({
      weekly: weeklySeries("adoption_rate", [0.3, 0.3]),
      trainingWishes: [makeWish("prompting", 0.5), makeWish("datenschutz", 0.4)],
      gapPairs: [
        makeGapPair("strategy", 2, 8),
        makeGapPair("benefit", 2, 8),
      ],
    });
    expect(evaluate(input).map((r) => [r.rule_key, r.context])).toEqual([
      ["R1", ""],
      ["R4", "datenschutz"],
      ["R4", "prompting"],
      ["R6", "benefit"],
      ["R6", "strategy"],
    ]);
  });
});

// --- R1 thin-sample guard (n_adoption < WEEKLY_ADOPTION_MIN_SAMPLE) -----------

describe("R1 · thin-sample guard", () => {
  it("ignores weeks whose W1.1 sample is too thin (non-user-only weeks)", () => {
    // Two healthy weeks, then two thin weeks where only non-users answered
    // W1.1 ("none" → adoption 0). Without the guard R1 would false-fire.
    const weekly = weeklySeries("adoption_rate", [0.7, 0.72, 0, 0]);
    weekly[2]!.n_adoption = 2;
    weekly[3]!.n_adoption = 3;
    const result = evaluateTriggers(
      makeInput({ weekly }),
      RECOMMENDATION_RULES,
    );
    expect(result.some((r) => r.rule_key === "R1")).toBe(false);
  });

  it("still fires when the last two SUFFICIENTLY SAMPLED weeks are below 50 %", () => {
    const weekly = weeklySeries("adoption_rate", [0.42, 0.38, 0.1]);
    weekly[2]!.n_adoption = 2; // thin trailing week is transparent
    const result = evaluateTriggers(
      makeInput({ weekly }),
      RECOMMENDATION_RULES,
    );
    expect(result.some((r) => r.rule_key === "R1")).toBe(true);
  });
});
