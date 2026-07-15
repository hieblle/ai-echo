import { describe, expect, it } from "vitest";

import type { NewSurveyResponse, Question } from "@/lib/types";
import { QUESTIONS } from "./questions";
import {
  DEMO_ORGS,
  DEMO_ORG_DEPARTMENTS,
  DEMO_ORG_HEADCOUNTS,
  DEMO_ORG_TOOL_SETTINGS,
  MERLIN_ORG_ID,
  REWE_ORG_ID,
  SPAR_ORG_ID,
} from "./orgs-demo";
import { generateAllDemoData, generateOrgWeek } from "./demo-data";

// Six consecutive ISO weeks — the SPEC.md §16.3 demo window.
const WEEKS = [
  "2026-W23",
  "2026-W24",
  "2026-W25",
  "2026-W26",
  "2026-W27",
  "2026-W28",
];

const DATA = generateAllDemoData({ weeks: WEEKS });

const QUESTION_BY_CODE = new Map(QUESTIONS.map((q) => [q.code, q]));

// --- Helpers -----------------------------------------------------------------

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}

function rows(
  predicate: (row: NewSurveyResponse) => boolean,
): NewSurveyResponse[] {
  return DATA.responses.filter(predicate);
}

function scaleValue(row: NewSurveyResponse): number {
  if (row.answer.kind !== "scale") {
    throw new Error(`expected scale answer for ${row.question_code}`);
  }
  return row.answer.value;
}

function choiceValue(row: NewSurveyResponse): string {
  if (row.answer.kind !== "choice") {
    throw new Error(`expected choice answer for ${row.question_code}`);
  }
  return row.answer.value;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error("mean of empty list");
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function choiceValuesOf(question: Question): Set<string> {
  if (!question.options || question.options.kind !== "choices") {
    throw new Error(`question ${question.code} has no choice options`);
  }
  return new Set(question.options.choices.map((c) => c.value));
}

const ACTIVE_TOOLS_BY_ORG = new Map(
  DEMO_ORGS.map((org) => [
    org.id,
    new Set(
      DEMO_ORG_TOOL_SETTINGS.filter((t) => t.org_id === org.id && t.active).map(
        (t) => t.tool_value,
      ),
    ),
  ]),
);

// --- Determinism ---------------------------------------------------------------

describe("determinism", () => {
  it("two generateAllDemoData calls with the same weeks are deeply equal", () => {
    const again = generateAllDemoData({ weeks: WEEKS });
    expect(again.responses).toEqual(DATA.responses);
    expect(again.participation).toEqual(DATA.participation);
  });

  it("generateOrgWeek standalone matches the corresponding slice of the full run", () => {
    const org = required(
      DEMO_ORGS.find((o) => o.id === MERLIN_ORG_ID),
      "merlin org",
    );
    const single = generateOrgWeek({
      org,
      departments: DEMO_ORG_DEPARTMENTS.filter((d) => d.org_id === org.id),
      headcounts: DEMO_ORG_HEADCOUNTS[org.id] ?? {},
      toolSettings: DEMO_ORG_TOOL_SETTINGS.filter((t) => t.org_id === org.id),
      weeks: WEEKS,
      weekIndex: 2,
    });
    expect(single.responses).toEqual(
      rows((r) => r.org_id === org.id && r.created_week === WEEKS[2]),
    );
  });
});

// --- Row validity ---------------------------------------------------------------

describe("row validity", () => {
  it("every row has a valid org, department, week, cycle and question code", () => {
    expect(DATA.responses.length).toBeGreaterThan(0);
    for (const row of DATA.responses) {
      expect(DEMO_ORGS.some((org) => org.id === row.org_id)).toBe(true);
      if (row.department_id !== null) {
        expect(
          DEMO_ORG_DEPARTMENTS.some(
            (dept) => dept.id === row.department_id && dept.org_id === row.org_id,
          ),
        ).toBe(true);
      }
      expect(WEEKS).toContain(row.created_week);

      const question = QUESTION_BY_CODE.get(row.question_code);
      expect(question, `unknown question code ${row.question_code}`).toBeDefined();
      // Cycle id convention "<template>-<week>", consistent with app/actions.ts.
      expect(row.cycle_id).toBe(
        `${required(question, "question").template_key}-${row.created_week}`,
      );
      expect(row.role_scope).toBe(
        required(question, "question").template_key === "leadership"
          ? "lead"
          : "employee",
      );
    }
  });

  it("every answer matches its question type and only uses existing choice values", () => {
    for (const row of DATA.responses) {
      const question = required(
        QUESTION_BY_CODE.get(row.question_code),
        row.question_code,
      );
      const answer = row.answer;
      const label = `${row.org_id} ${row.created_week} ${question.code}`;

      switch (question.type) {
        case "single_choice": {
          expect(answer.kind, label).toBe("choice");
          if (answer.kind !== "choice") break;
          const allowed = choiceValuesOf(question);
          expect(allowed.has(answer.value), `${label}: ${answer.value}`).toBe(true);
          if (answer.text !== undefined) {
            expect(answer.text.trim().length, label).toBeGreaterThan(0);
          }
          break;
        }
        case "multi_choice": {
          expect(answer.kind, label).toBe("choices");
          if (answer.kind !== "choices") break;
          const allowed = choiceValuesOf(question);
          expect(answer.values.length, label).toBeGreaterThan(0);
          expect(new Set(answer.values).size, label).toBe(answer.values.length);
          for (const value of answer.values) {
            expect(allowed.has(value), `${label}: ${value}`).toBe(true);
          }
          // Exclusive options ("none") never mix with other values.
          if (answer.values.includes("none")) {
            expect(answer.values, label).toEqual(["none"]);
          }
          break;
        }
        case "scale_1_10":
        case "scale_minus5_plus5":
        case "scale_0_10": {
          expect(answer.kind, label).toBe("scale");
          if (answer.kind !== "scale") break;
          if (!question.options || question.options.kind !== "scale") {
            throw new Error(`${label}: scale question without scale options`);
          }
          expect(Number.isInteger(answer.value), label).toBe(true);
          expect(answer.value, label).toBeGreaterThanOrEqual(question.options.min);
          expect(answer.value, label).toBeLessThanOrEqual(question.options.max);
          break;
        }
        case "number":
        case "currency": {
          expect(answer.kind, label).toBe("number");
          if (answer.kind !== "number") break;
          expect(Number.isFinite(answer.value), label).toBe(true);
          const min =
            question.options?.kind === "number" ? (question.options.min ?? 0) : 0;
          expect(answer.value, label).toBeGreaterThanOrEqual(min);
          break;
        }
        case "text_optional": {
          expect(answer.kind, label).toBe("text");
          if (answer.kind !== "text") break;
          expect(answer.value.trim().length, label).toBeGreaterThan(0);
          break;
        }
        case "tool_matrix": {
          expect(answer.kind, label).toBe("tool_matrix");
          if (answer.kind !== "tool_matrix") break;
          const activeTools = required(
            ACTIVE_TOOLS_BY_ORG.get(row.org_id),
            `tools of ${row.org_id}`,
          );
          expect(answer.tools.length, label).toBeGreaterThan(0);
          for (const entry of answer.tools) {
            expect(activeTools.has(entry.tool), `${label}: ${entry.tool}`).toBe(true);
            expect(entry.usefulness, label).toBeGreaterThanOrEqual(1);
            expect(entry.usefulness, label).toBeLessThanOrEqual(10);
            expect(entry.uses_per_week, label).toBeGreaterThanOrEqual(0);
          }
          break;
        }
      }
    }
  });
});

// --- Cycle scheduling ------------------------------------------------------------

describe("cycle scheduling", () => {
  it("weekly cycles exist for every org and week", () => {
    for (const org of DEMO_ORGS) {
      for (const week of WEEKS) {
        const stat = DATA.participation.find(
          (p) => p.org_id === org.id && p.cycle_id === `weekly-${week}`,
        );
        expect(stat, `${org.id} ${week}`).toBeDefined();
        expect(required(stat, "stat").template_key).toBe("weekly");
        expect(required(stat, "stat").completed).toBeGreaterThan(0);
        expect(required(stat, "stat").completed).toBeLessThanOrEqual(
          required(stat, "stat").invited,
        );
      }
    }
  });

  it("monthly and leadership cycles exist exactly for weekIndex 3", () => {
    const monthWeek = required(WEEKS[3], "WEEKS[3]");
    for (const templateKey of ["monthly", "leadership"] as const) {
      const stats = DATA.participation.filter(
        (p) => p.template_key === templateKey,
      );
      expect(stats).toHaveLength(DEMO_ORGS.length);
      for (const stat of stats) {
        expect(stat.week).toBe(monthWeek);
        expect(stat.cycle_id).toBe(`${templateKey}-${monthWeek}`);
      }
      const responseWeeks = new Set(
        rows((r) => r.cycle_id.startsWith(`${templateKey}-`)).map(
          (r) => r.created_week,
        ),
      );
      expect([...responseWeeks]).toEqual([monthWeek]);
    }
  });

  it("leadership invites one lead per department plus one", () => {
    for (const org of DEMO_ORGS) {
      const stat = required(
        DATA.participation.find(
          (p) => p.org_id === org.id && p.template_key === "leadership",
        ),
        `leadership stat of ${org.id}`,
      );
      const departmentCount = DEMO_ORG_DEPARTMENTS.filter(
        (d) => d.org_id === org.id,
      ).length;
      expect(stat.invited).toBe(departmentCount + 1);
      expect(stat.completed).toBe(departmentCount + 1);
    }
  });

  it("onboarding happens only in the first week", () => {
    const firstWeek = required(WEEKS[0], "WEEKS[0]");
    const stats = DATA.participation.filter(
      (p) => p.template_key === "onboarding",
    );
    expect(stats).toHaveLength(DEMO_ORGS.length);
    for (const stat of stats) expect(stat.week).toBe(firstWeek);
    const responseWeeks = new Set(
      rows((r) => r.cycle_id.startsWith("onboarding-")).map((r) => r.created_week),
    );
    expect([...responseWeeks]).toEqual([firstWeek]);
  });

  it("W1.1 answers exist for every org and every week", () => {
    for (const org of DEMO_ORGS) {
      for (const week of WEEKS) {
        const w11 = rows(
          (r) =>
            r.org_id === org.id &&
            r.created_week === week &&
            r.question_code === "W1.1",
        );
        expect(w11.length, `${org.id} ${week}`).toBeGreaterThan(0);
      }
    }
  });
});

// --- Merlin (healthy, but Copilot unused + k-anomaly) -----------------------------

describe("Merlin anomalies", () => {
  it("weekly participation is at least 0.6 in every week", () => {
    const stats = DATA.participation.filter(
      (p) => p.org_id === MERLIN_ORG_ID && p.template_key === "weekly",
    );
    expect(stats).toHaveLength(WEEKS.length);
    for (const stat of stats) {
      expect(stat.completed / stat.invited, stat.week).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("marketing (headcount 4) never has more than 4 answers per weekly question", () => {
    for (const week of WEEKS) {
      const marketingRows = rows(
        (r) =>
          r.org_id === MERLIN_ORG_ID &&
          r.cycle_id === `weekly-${week}` &&
          r.department_id === "marketing",
      );
      expect(marketingRows.length, week).toBeGreaterThan(0);
      const countsByCode = new Map<string, number>();
      for (const row of marketingRows) {
        countsByCode.set(
          row.question_code,
          (countsByCode.get(row.question_code) ?? 0) + 1,
        );
      }
      // The respondent proxy (max answers per question) stays under k = 5.
      expect(Math.max(...countsByCode.values()), week).toBeLessThanOrEqual(4);
    }
  });

  it("paid Copilot licence is barely used: W1.2 share < 15 % (→ R5)", () => {
    const w12 = rows(
      (r) => r.org_id === MERLIN_ORG_ID && r.question_code === "W1.2",
    );
    expect(w12.length).toBeGreaterThanOrEqual(30);
    const copilot = w12.filter((r) => choiceValue(r) === "copilot365").length;
    expect(copilot / w12.length).toBeLessThan(0.15);
  });
});

// --- SPAR (perception gap + training wish) ----------------------------------------

describe("SPAR anomalies", () => {
  it("perception gap: mean(F6, leadership) − mean(M5.1, employees) > 3 (→ R6)", () => {
    const f6 = rows(
      (r) => r.org_id === SPAR_ORG_ID && r.question_code === "F6",
    ).map(scaleValue);
    const m51 = rows(
      (r) =>
        r.org_id === SPAR_ORG_ID &&
        r.question_code === "M5.1" &&
        r.role_scope === "employee",
    ).map(scaleValue);
    expect(f6.length).toBeGreaterThan(0);
    expect(m51.length).toBeGreaterThan(0);
    expect(mean(f6) - mean(m51)).toBeGreaterThan(3);
  });

  it("more than 30 % of M3.2 answers wish for prompt engineering training (→ R4)", () => {
    const m32 = rows(
      (r) => r.org_id === SPAR_ORG_ID && r.question_code === "M3.2",
    );
    expect(m32.length).toBeGreaterThan(0);
    const withPrompt = m32.filter(
      (r) =>
        r.answer.kind === "choices" &&
        r.answer.values.includes("prompt_engineering"),
    ).length;
    expect(withPrompt / m32.length).toBeGreaterThan(0.3);
  });
});

// --- REWE (struggling: R1 + R3 + R7, but NOT R2) ------------------------------------

describe("REWE anomalies", () => {
  it("adoption (non-'none' share of W1.1) is below 0.5 in every week (→ R1)", () => {
    for (const week of WEEKS) {
      const w11 = rows(
        (r) =>
          r.org_id === REWE_ORG_ID &&
          r.created_week === week &&
          r.question_code === "W1.1",
      );
      expect(w11.length, week).toBeGreaterThan(0);
      const adopted = w11.filter((r) => choiceValue(r) !== "none").length;
      expect(adopted / w11.length, week).toBeLessThan(0.5);
    }
  });

  it("W4.2 weekly means strictly decrease over the last four weeks (→ R3)", () => {
    const means = WEEKS.map((week) => {
      const values = rows(
        (r) =>
          r.org_id === REWE_ORG_ID &&
          r.created_week === week &&
          r.question_code === "W4.2",
      ).map(scaleValue);
      expect(values.length, week).toBeGreaterThan(0);
      return mean(values);
    });
    const lastFour = means.slice(-4);
    expect(lastFour).toHaveLength(4);
    for (let i = 1; i < lastFour.length; i++) {
      expect(
        required(lastFour[i], "mean"),
        `week ${i} of the last four (means: ${lastFour.join(", ")})`,
      ).toBeLessThan(required(lastFour[i - 1], "mean"));
    }
  });

  it("weekly participation drops below 0.4 in the last two cycles (→ R7)", () => {
    const statByWeek = new Map(
      DATA.participation
        .filter((p) => p.org_id === REWE_ORG_ID && p.template_key === "weekly")
        .map((p) => [p.week, p]),
    );
    const ratios = WEEKS.map((week) => {
      const stat = required(statByWeek.get(week), `weekly stat ${week}`);
      return stat.completed / stat.invited;
    });
    for (const ratio of ratios.slice(-2)) {
      expect(ratio).toBeLessThan(0.4);
    }
    // Earlier weeks sit visibly higher (≈ 0.45) so the drop is a real trend.
    for (const ratio of ratios.slice(0, -2)) {
      expect(ratio).toBeGreaterThan(0.4);
    }
  });

  it("trust stays healthy: every weekly W3.3 mean is at least 5.5 (R2 must NOT fire)", () => {
    const w33Weeks = new Set(
      rows(
        (r) => r.org_id === REWE_ORG_ID && r.question_code === "W3.3",
      ).map((r) => r.created_week),
    );
    expect(w33Weeks.size).toBeGreaterThan(0);
    for (const week of w33Weeks) {
      const values = rows(
        (r) =>
          r.org_id === REWE_ORG_ID &&
          r.created_week === week &&
          r.question_code === "W3.3",
      ).map(scaleValue);
      expect(mean(values), week).toBeGreaterThanOrEqual(5.5);
    }
  });
});

