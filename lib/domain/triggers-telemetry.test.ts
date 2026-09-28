import { describe, expect, it } from "vitest";
import { evaluateTriggers, type TriggerEvaluationInput } from "./triggers";
import type { OrgToolSetting, RecommendationRule, ToolUsageStat } from "@/lib/types";

const R5: RecommendationRule = {
  key: "R5",
  title: "Lizenz prüfen",
  description: "",
  action_type: "license_review",
  course_url: null,
  active: true,
};

const copilot: OrgToolSetting = {
  id: "t",
  org_id: "org",
  tool_value: "copilot365",
  tool_label: "Microsoft Copilot",
  monthly_license_cost_eur: 1440,
  seats: 48,
  active: true,
};

function usage(share: number, total = 40): ToolUsageStat[] {
  return [{ tool_value: "copilot365", mentions: Math.round(share * total), total, share }];
}

function input(overrides: Partial<TriggerEvaluationInput>): TriggerEvaluationInput {
  return {
    weekly: [],
    gapPairs: [],
    toolUsage: [],
    toolSettings: [copilot],
    trainingWishes: [],
    ...overrides,
  };
}

const telemetryLow = [
  { tool_value: "copilot365", share: 0.15, label: "Microsoft-Nutzungsdaten (28 Tage bis 25.09.2026)" },
];
const telemetryHigh = [{ ...telemetryLow[0]!, share: 0.62 }];

describe("R5 with vendor telemetry (D4.10: both sources, the stricter one fires)", () => {
  it("fires on low telemetry even when the survey share is fine", () => {
    const hits = evaluateTriggers(input({ toolUsage: usage(0.45), telemetry: telemetryLow }), [R5]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.detail).toBe(
      "Bezahltes Tool „Microsoft Copilot“ (1440 € pro Monat) wird von 45 % als meistgenutztes Tool genannt (Schwelle: 20 %). " +
        "Laut Microsoft-Nutzungsdaten (28 Tage bis 25.09.2026) sind nur 15 % der Lizenzen aktiv (Schwelle: 20 %).",
    );
  });

  it("fires on a low survey share and names the healthy telemetry", () => {
    const hits = evaluateTriggers(input({ toolUsage: usage(0.1), telemetry: telemetryHigh }), [R5]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.detail).toContain("wird nur von 10 % als meistgenutztes Tool genannt");
    expect(hits[0]?.detail).toContain("sind 62 % der Lizenzen aktiv");
  });

  it("evaluates telemetry alone while the survey sample is still thin", () => {
    const hits = evaluateTriggers(input({ toolUsage: usage(0.1, 4), telemetry: telemetryLow }), [R5]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.detail).toBe(
      "Bezahltes Tool „Microsoft Copilot“ (1440 € pro Monat). " +
        "Laut Microsoft-Nutzungsdaten (28 Tage bis 25.09.2026) sind nur 15 % der Lizenzen aktiv (Schwelle: 20 %).",
    );
  });

  it("stays silent when both sources are above the threshold", () => {
    expect(evaluateTriggers(input({ toolUsage: usage(0.45), telemetry: telemetryHigh }), [R5])).toEqual([]);
  });

  it("keeps the pre-telemetry behaviour: a thin survey without telemetry never fires", () => {
    expect(evaluateTriggers(input({ toolUsage: usage(0.1, 4) }), [R5])).toEqual([]);
    const hits = evaluateTriggers(input({ toolUsage: usage(0.1) }), [R5]);
    expect(hits[0]?.detail).toBe(
      "Bezahltes Tool „Microsoft Copilot“ (1440 € pro Monat) wird nur von 10 % als meistgenutztes Tool genannt (Schwelle: 20 %).",
    );
  });
});
