import { describe, expect, it } from "vitest";
import type {
  AnswerValue,
  Department,
  HeatmapCell,
  OrgToolSetting,
  ParticipationStat,
  RoleScope,
  SurveyResponse,
  WeeklyDimension,
  WeeklyKpis,
} from "@/lib/types";
import {
  W21_CLASS_MIDPOINTS,
  W31_INVERTED,
  W41_MAPPED,
  computeBaseline,
  computeEfficiencyIndex,
  computeGapPairs,
  computeHeatmap,
  computeKpiHistory,
  computeNps,
  computeRoi,
  computeToolUsage,
  computeTrainingWishes,
  computeWeeklyKpis,
  normalizeM13,
  pooledAdoption,
  WEEKLY_ADOPTION_MIN_SAMPLE,
} from "./kpi";

// --- Fixture helpers ---------------------------------------------------------

let seq = 0;

interface RowOpts {
  week?: string;
  department_id?: string | null;
  role_scope?: RoleScope;
}

/** Build a survey response row; defaults: week 2026-W01, dep-1, employee. */
function row(code: string, answer: AnswerValue, opts: RowOpts = {}): SurveyResponse {
  seq += 1;
  return {
    id: `r-${seq}`,
    org_id: "org-1",
    cycle_id: `cycle-${opts.week ?? "2026-W01"}`,
    department_id: opts.department_id === undefined ? "dep-1" : opts.department_id,
    role_scope: opts.role_scope ?? "employee",
    question_code: code,
    answer,
    created_week: opts.week ?? "2026-W01",
  };
}

const choice = (value: string): AnswerValue => ({ kind: "choice", value });
const scale = (value: number): AnswerValue => ({ kind: "scale", value });
const multi = (values: string[]): AnswerValue => ({ kind: "choices", values });

function participation(
  week: string,
  invited: number,
  completed: number,
  template_key: ParticipationStat["template_key"] = "weekly",
): ParticipationStat {
  return {
    org_id: "org-1",
    cycle_id: `${template_key}-${week}`,
    template_key,
    week,
    invited,
    completed,
  };
}

function toolSetting(
  tool_value: string,
  monthly_license_cost_eur: number,
  active = true,
): OrgToolSetting {
  return {
    id: `ts-${tool_value}`,
    org_id: "org-1",
    tool_value,
    tool_label: tool_value,
    monthly_license_cost_eur,
    active,
  };
}

const department = (id: string): Department => ({ id, org_id: "org-1", name: id });

/** WeeklyKpis fixture with all-null/zero defaults for ROI/baseline tests. */
function weeklyKpis(partial: Partial<WeeklyKpis> & { week: string }): WeeklyKpis {
  return {
    n_pulse: 0,
    n_adoption: 0,
    adoption_rate: null,
    power_user_share: null,
    saved_hours_sum: 0,
    efficiency_index: null,
    trust_index: null,
    sentiment_index: null,
    participation_rate: null,
    ...partial,
  };
}

function cellOf(
  cells: HeatmapCell[],
  department_id: string | null,
  dimension: WeeklyDimension,
): HeatmapCell {
  const cell = cells.find(
    (c) => c.department_id === department_id && c.dimension === dimension,
  );
  if (!cell) throw new Error(`missing cell ${department_id}/${dimension}`);
  return cell;
}

// --- Mapping tables (SPEC.md §10) ---------------------------------------------

describe("mapping tables", () => {
  it("W2.1 class midpoints are 0 / 0.5 / 2 / 4 / 7.5 / 12", () => {
    expect(W21_CLASS_MIDPOINTS).toEqual({
      none: 0,
      lt_1: 0.5,
      "1_3": 2,
      "3_5": 4,
      "5_10": 7.5,
      gt_10: 12,
    });
  });

  it("W3.1 rework frequency inverts to 10 / 7.5 / 5 / 2.5 / 0", () => {
    expect(W31_INVERTED).toEqual({
      never: 10,
      rarely: 7.5,
      sometimes: 5,
      often: 2.5,
      almost_always: 0,
    });
  });

  it("W4.1 relief/strain maps to 10 / 7.5 / 5 / 2.5 / 0", () => {
    expect(W41_MAPPED).toEqual({
      strong_relief: 10,
      some_relief: 7.5,
      neutral: 5,
      some_strain: 2.5,
      strong_strain: 0,
    });
  });

  it("normalizeM13 maps −5..+5 onto 0..10", () => {
    expect(normalizeM13(-5)).toBe(0);
    expect(normalizeM13(0)).toBe(5);
    expect(normalizeM13(5)).toBe(10);
    expect(normalizeM13(2)).toBe(7);
    expect(normalizeM13(-3)).toBe(2);
  });
});

// --- 1. computeWeeklyKpis -------------------------------------------------------

describe("computeWeeklyKpis", () => {
  it("counts adoption from usage >= '1–2 mal'; a 'none' answer counts in the denominator only", () => {
    const kpis = computeWeeklyKpis({
      responses: [
        row("W1.1", choice("none")),
        row("W1.1", choice("1_2")),
        row("W1.1", choice("daily")),
      ],
      week: "2026-W01",
    });
    expect(kpis.adoption_rate).toBeCloseTo(2 / 3, 10);
    expect(kpis.power_user_share).toBeCloseTo(1 / 3, 10);
  });

  it("counts daily and multiple_daily as power users", () => {
    const kpis = computeWeeklyKpis({
      responses: [
        row("W1.1", choice("daily")),
        row("W1.1", choice("multiple_daily")),
        row("W1.1", choice("3_5")),
        row("W1.1", choice("none")),
      ],
      week: "2026-W01",
    });
    expect(kpis.adoption_rate).toBeCloseTo(0.75, 10);
    expect(kpis.power_user_share).toBeCloseTo(0.5, 10);
  });

  it("returns null adoption and power-user share without W1.1 answers", () => {
    const kpis = computeWeeklyKpis({
      responses: [row("W2.3", scale(7))],
      week: "2026-W01",
    });
    expect(kpis.adoption_rate).toBeNull();
    expect(kpis.power_user_share).toBeNull();
  });

  it("sums W2.1 class midpoints into saved_hours_sum", () => {
    const kpis = computeWeeklyKpis({
      responses: [
        row("W2.1", choice("lt_1")),
        row("W2.1", choice("1_3")),
        row("W2.1", choice("gt_10")),
        row("W2.1", choice("none")),
      ],
      week: "2026-W01",
    });
    expect(kpis.saved_hours_sum).toBeCloseTo(14.5, 10);
  });

  it("reports 0 saved hours (not null) without W2.1 answers", () => {
    const kpis = computeWeeklyKpis({ responses: [], week: "2026-W01" });
    expect(kpis.saved_hours_sum).toBe(0);
  });

  it("computes the weekly efficiency index from W2.3 only", () => {
    const kpis = computeWeeklyKpis({
      responses: [
        row("W2.3", scale(6)),
        row("W2.3", scale(8)),
        // M1.3 is monthly — folded in by computeEfficiencyIndex, not here.
        row("M1.3", scale(5)),
      ],
      week: "2026-W01",
    });
    expect(kpis.efficiency_index).toBe(7);
  });

  it("computes the trust index as mean of sub-means of W3.3 and inverted W3.1", () => {
    const kpis = computeWeeklyKpis({
      responses: [
        row("W3.3", scale(8)),
        row("W3.1", choice("never")), // 10
        row("W3.1", choice("sometimes")), // 5
      ],
      week: "2026-W01",
    });
    // sub-means: W3.3 = 8, W3.1 = 7.5 → (8 + 7.5) / 2
    expect(kpis.trust_index).toBeCloseTo(7.75, 10);
  });

  it("falls back to a single trust sub-mean when the other question has no answers", () => {
    const onlyW31 = computeWeeklyKpis({
      responses: [row("W3.1", choice("often"))],
      week: "2026-W01",
    });
    expect(onlyW31.trust_index).toBe(2.5);

    const onlyW33 = computeWeeklyKpis({
      responses: [row("W3.3", scale(9))],
      week: "2026-W01",
    });
    expect(onlyW33.trust_index).toBe(9);
  });

  it("computes the sentiment index as mean of sub-means of W4.2 and mapped W4.1", () => {
    const kpis = computeWeeklyKpis({
      responses: [
        row("W4.2", scale(6)),
        row("W4.1", choice("strong_relief")), // 10
        row("W4.1", choice("neutral")), // 5
      ],
      week: "2026-W01",
    });
    expect(kpis.sentiment_index).toBeCloseTo(6.75, 10);
  });

  it("keeps a 0-valued sentiment sub-mean (fallback must check null, not falsiness)", () => {
    const kpis = computeWeeklyKpis({
      responses: [row("W4.1", choice("strong_strain"))], // maps to 0
      week: "2026-W01",
    });
    expect(kpis.sentiment_index).toBe(0);
  });

  it("uses the max per-code answer count as respondent proxy (3× W1.1 + 2× W2.3 → n 3)", () => {
    const kpis = computeWeeklyKpis({
      responses: [
        row("W1.1", choice("daily")),
        row("W1.1", choice("daily")),
        row("W1.1", choice("none")),
        row("W2.3", scale(5)),
        row("W2.3", scale(7)),
      ],
      week: "2026-W01",
    });
    expect(kpis.n_pulse).toBe(3);
  });

  it("ignores rows of other weeks and non-weekly question codes", () => {
    const kpis = computeWeeklyKpis({
      responses: [
        row("W1.1", choice("daily"), { week: "2026-W02" }),
        row("M6.1", scale(10)),
        row("F6", scale(9)),
      ],
      week: "2026-W01",
    });
    expect(kpis.n_pulse).toBe(0);
    expect(kpis.adoption_rate).toBeNull();
  });

  it("silently ignores malformed answers (wrong kind or unmapped choice value)", () => {
    const kpis = computeWeeklyKpis({
      responses: [
        row("W1.1", scale(5)), // wrong kind → not in adoption denominator
        row("W1.1", choice("daily")),
        row("W2.3", choice("none")), // wrong kind → not in efficiency mean
        row("W2.3", scale(4)),
        row("W2.1", choice("bogus")), // unmapped → not in the sum
        row("W2.1", choice("1_3")),
      ],
      week: "2026-W01",
    });
    expect(kpis.adoption_rate).toBe(1);
    expect(kpis.efficiency_index).toBe(4);
    expect(kpis.saved_hours_sum).toBe(2);
  });

  it("derives participation_rate from the passed stat", () => {
    const kpis = computeWeeklyKpis({
      responses: [],
      week: "2026-W01",
      participation: participation("2026-W01", 10, 8),
    });
    expect(kpis.participation_rate).toBeCloseTo(0.8, 10);
  });

  it("returns null participation_rate without a stat or with invited 0", () => {
    expect(
      computeWeeklyKpis({ responses: [], week: "2026-W01" }).participation_rate,
    ).toBeNull();
    expect(
      computeWeeklyKpis({
        responses: [],
        week: "2026-W01",
        participation: participation("2026-W01", 0, 0),
      }).participation_rate,
    ).toBeNull();
  });

  it("is null-safe on empty input", () => {
    expect(computeWeeklyKpis({ responses: [], week: "2026-W01" })).toEqual({
      week: "2026-W01",
      n_pulse: 0,
      n_adoption: 0,
      adoption_rate: null,
      power_user_share: null,
      saved_hours_sum: 0,
      efficiency_index: null,
      trust_index: null,
      sentiment_index: null,
      participation_rate: null,
    });
  });
});

// --- 2. computeKpiHistory --------------------------------------------------------

describe("computeKpiHistory", () => {
  it("returns weeks chronologically and matches only weekly-template stats", () => {
    const history = computeKpiHistory({
      responses: [row("W2.3", scale(8), { week: "2026-W02" })],
      weeks: ["2026-W02", "2026-W01"], // deliberately unordered
      participations: [
        participation("2026-W01", 10, 5, "weekly"),
        participation("2026-W02", 10, 10, "monthly"), // must NOT match
      ],
    });
    expect(history.map((entry) => entry.week)).toEqual(["2026-W01", "2026-W02"]);
    expect(history[0]!.participation_rate).toBeCloseTo(0.5, 10);
    expect(history[1]!.participation_rate).toBeNull();
    expect(history[1]!.efficiency_index).toBe(8);
  });

  it("does not mutate the passed weeks array", () => {
    const weeks = ["2026-W03", "2026-W01"];
    computeKpiHistory({ responses: [], weeks, participations: [] });
    expect(weeks).toEqual(["2026-W03", "2026-W01"]);
  });

  it("is empty for an empty week window", () => {
    expect(
      computeKpiHistory({ responses: [], weeks: [], participations: [] }),
    ).toEqual([]);
  });
});

// --- 3. computeEfficiencyIndex ------------------------------------------------------

describe("computeEfficiencyIndex", () => {
  it("means the sub-means of windowed W2.3 and normalized M1.3 (M1.3 not week-filtered)", () => {
    const index = computeEfficiencyIndex({
      responses: [
        row("W2.3", scale(6), { week: "2026-W01" }),
        row("W2.3", scale(1), { week: "2025-W40" }), // outside window → ignored
        row("M1.3", scale(0), { week: "2025-W40" }), // → 5, counts despite week
        row("M1.3", scale(5), { week: "2026-W01" }), // → 10
      ],
      weeks: ["2026-W01", "2026-W02"],
    });
    // sub-means: W2.3 = 6, M1.3 = (5 + 10) / 2 = 7.5 → (6 + 7.5) / 2
    expect(index).toBeCloseTo(6.75, 10);
  });

  it("falls back to the remaining sub-mean when one side has no data", () => {
    expect(
      computeEfficiencyIndex({
        responses: [row("W2.3", scale(6))],
        weeks: ["2026-W01"],
      }),
    ).toBe(6);
    expect(
      computeEfficiencyIndex({
        responses: [row("M1.3", scale(-5))], // → 0, must survive the fallback
        weeks: ["2026-W01"],
      }),
    ).toBe(0);
  });

  it("is null on empty input", () => {
    expect(computeEfficiencyIndex({ responses: [], weeks: [] })).toBeNull();
  });
});

// --- 4. computeRoi ---------------------------------------------------------------------

describe("computeRoi", () => {
  it("computes gross, net, multiple and participation extrapolation over the window", () => {
    const roi = computeRoi({
      weekly: [
        weeklyKpis({ week: "2026-W01", saved_hours_sum: 6, participation_rate: 0.5 }),
        weeklyKpis({ week: "2026-W02", saved_hours_sum: 4, participation_rate: null }),
      ],
      hourlyRate: 100,
      toolSettings: [
        toolSetting("chatgpt", 200),
        toolSetting("copilot365", 999, false), // inactive → excluded
      ],
    });
    expect(roi.saved_hours).toBe(10);
    // 10h at 50% average participation → 20h extrapolated
    expect(roi.saved_hours_extrapolated).toBeCloseTo(20, 10);
    expect(roi.gross_savings_eur).toBe(1000);
    expect(roi.license_costs_eur).toBe(200);
    expect(roi.net_savings_eur).toBe(800);
    expect(roi.roi_multiple).toBe(5);
  });

  it("returns a null multiple when license costs are 0", () => {
    const roi = computeRoi({
      weekly: [weeklyKpis({ week: "2026-W01", saved_hours_sum: 5, participation_rate: 1 })],
      hourlyRate: 80,
      toolSettings: [],
    });
    expect(roi.roi_multiple).toBeNull();
    expect(roi.net_savings_eur).toBe(400);
    // full participation → extrapolation equals the reported sum
    expect(roi.saved_hours_extrapolated).toBe(5);
  });

  it("returns null extrapolation without any participation data", () => {
    const roi = computeRoi({
      weekly: [weeklyKpis({ week: "2026-W01", saved_hours_sum: 8 })],
      hourlyRate: 100,
      toolSettings: [toolSetting("chatgpt", 100)],
    });
    expect(roi.saved_hours_extrapolated).toBeNull();
  });

  it("is null-safe on an empty window", () => {
    const roi = computeRoi({ weekly: [], hourlyRate: 100, toolSettings: [] });
    expect(roi).toEqual({
      saved_hours: 0,
      saved_hours_extrapolated: null,
      gross_savings_eur: 0,
      license_costs_eur: 0,
      net_savings_eur: 0,
      roi_multiple: null,
    });
  });
});

// --- 5. computeGapPairs --------------------------------------------------------------------

describe("computeGapPairs", () => {
  it("returns exactly the three pairs strategy, competence, benefit", () => {
    expect(computeGapPairs([]).map((pair) => pair.pair)).toEqual([
      "strategy",
      "competence",
      "benefit",
    ]);
  });

  it("computes strategy from employee M5.1 vs F6; a lead's M5.1 must not count", () => {
    const [strategy] = computeGapPairs([
      row("M5.1", scale(4)),
      row("M5.1", scale(6)),
      row("M5.1", scale(10), { role_scope: "lead" }), // must NOT count
      row("F6", scale(8), { role_scope: "lead" }),
    ]);
    expect(strategy!.employee_value).toBe(5);
    expect(strategy!.leadership_value).toBe(8);
    // leadership − employee, positive = Führung optimistischer
    expect(strategy!.gap).toBe(3);
    expect(strategy!.n_employee).toBe(2);
    expect(strategy!.n_leadership).toBe(1);
  });

  it("computes competence from employee M3.1 vs F7 with a negative gap when employees rate higher", () => {
    const [, competence] = computeGapPairs([
      row("M3.1", scale(7)),
      row("F7", scale(6), { role_scope: "lead" }),
    ]);
    expect(competence!.employee_value).toBe(7);
    expect(competence!.leadership_value).toBe(6);
    expect(competence!.gap).toBe(-1);
  });

  it("computes benefit from the employee efficiency index (W2.3 + normalized M1.3) vs F2", () => {
    const [, , benefit] = computeGapPairs([
      row("W2.3", scale(6)),
      row("M1.3", scale(0)), // → 5
      row("W2.3", scale(10), { role_scope: "lead" }), // must NOT count
      row("F2", scale(7), { role_scope: "lead" }),
      row("F2", scale(9), { role_scope: "lead" }),
    ]);
    // employee: mean of sub-means (6, 5) = 5.5; leadership: mean(7, 9) = 8
    expect(benefit!.employee_value).toBeCloseTo(5.5, 10);
    expect(benefit!.leadership_value).toBe(8);
    expect(benefit!.gap).toBeCloseTo(2.5, 10);
    expect(benefit!.n_employee).toBe(2);
    expect(benefit!.n_leadership).toBe(2);
  });

  it("returns a null gap when either side has no data", () => {
    const [strategy] = computeGapPairs([row("M5.1", scale(5))]);
    expect(strategy!.employee_value).toBe(5);
    expect(strategy!.leadership_value).toBeNull();
    expect(strategy!.gap).toBeNull();
  });

  it("is null-safe on empty input", () => {
    for (const pair of computeGapPairs([])) {
      expect(pair.employee_value).toBeNull();
      expect(pair.leadership_value).toBeNull();
      expect(pair.gap).toBeNull();
      expect(pair.n_employee).toBe(0);
      expect(pair.n_leadership).toBe(0);
    }
  });
});

// --- 6. computeNps ------------------------------------------------------------------------------

describe("computeNps", () => {
  it("scores promoters (9–10) minus detractors (0–6), passives neutral", () => {
    const nps = computeNps([
      row("M6.1", scale(10)), // promoter
      row("M6.1", scale(9)), // promoter
      row("M6.1", scale(8)), // passive
      row("M6.1", scale(7)), // passive
      row("M6.1", scale(6)), // detractor
      row("M6.1", scale(0)), // detractor
    ]);
    expect(nps).toEqual({ value: 0, n: 6 });
  });

  it("hits the boundary buckets exactly", () => {
    expect(computeNps([row("M6.1", scale(9))])).toEqual({ value: 100, n: 1 });
    expect(computeNps([row("M6.1", scale(8))])).toEqual({ value: 0, n: 1 });
    expect(computeNps([row("M6.1", scale(6))])).toEqual({ value: -100, n: 1 });
  });

  it("rounds to a whole number", () => {
    expect(
      computeNps([row("M6.1", scale(9)), row("M6.1", scale(7)), row("M6.1", scale(7))]),
    ).toEqual({ value: 33, n: 3 });
    expect(
      computeNps([row("M6.1", scale(9)), row("M6.1", scale(9)), row("M6.1", scale(7))]),
    ).toEqual({ value: 67, n: 3 });
  });

  it("is null without M6.1 answers", () => {
    expect(computeNps([])).toBeNull();
    expect(computeNps([row("W4.2", scale(10))])).toBeNull();
  });
});

// --- 7. computeHeatmap --------------------------------------------------------------------------------

describe("computeHeatmap", () => {
  const weeks = ["2026-W01", "2026-W02"];
  const departments = [department("dep-a"), department("dep-b"), department("dep-c")];

  // dep-a: 4 respondents per week (proxy 4 < k=5) — must be suppressed.
  // dep-b: 6 W1.1 per week (3 daily / 3 none) + 2 W2.3 in W01 — reportable.
  const responses: SurveyResponse[] = weeks.flatMap((week) => [
    ...Array.from({ length: 4 }, () =>
      row("W1.1", choice("daily"), { week, department_id: "dep-a" }),
    ),
    ...Array.from({ length: 3 }, () =>
      row("W1.1", choice("daily"), { week, department_id: "dep-b" }),
    ),
    ...Array.from({ length: 3 }, () =>
      row("W1.1", choice("none"), { week, department_id: "dep-b" }),
    ),
  ]);
  responses.push(
    row("W2.3", scale(8), { week: "2026-W01", department_id: "dep-b" }),
    row("W2.3", scale(6), { week: "2026-W01", department_id: "dep-b" }),
  );

  it("suppresses every cell of a department below k, with value null and n = max weekly proxy", () => {
    const cells = computeHeatmap({ responses, departments, k: 5, weeks });
    for (const dimension of ["adoption", "efficiency", "trust", "sentiment"] as const) {
      const cell = cellOf(cells, "dep-a", dimension);
      expect(cell.suppressed).toBe(true);
      expect(cell.value).toBeNull();
      expect(cell.n).toBe(4); // max weekly proxy, NOT the 8 answers total
    }
  });

  it("reports a department at or above k with n = sum of qualifying weekly proxies", () => {
    const cells = computeHeatmap({ responses, departments, k: 5, weeks });
    const adoption = cellOf(cells, "dep-b", "adoption");
    expect(adoption.suppressed).toBe(false);
    expect(adoption.n).toBe(12); // 6 + 6
    expect(adoption.value).toBeCloseTo(5, 10); // share 0.5 scaled ×10

    const efficiency = cellOf(cells, "dep-b", "efficiency");
    expect(efficiency.value).toBe(7); // mean(8, 6)

    // Qualifying department without trust data: not suppressed, but no value.
    const trust = cellOf(cells, "dep-b", "trust");
    expect(trust.suppressed).toBe(false);
    expect(trust.value).toBeNull();
  });

  it("marks a zero-data department as suppressed with n 0", () => {
    const cells = computeHeatmap({ responses, departments, k: 5, weeks });
    const cell = cellOf(cells, "dep-c", "sentiment");
    expect(cell).toEqual({
      department_id: "dep-c",
      dimension: "sentiment",
      value: null,
      n: 0,
      suppressed: true,
    });
  });

  it("always includes an unsuppressed org-total row over ALL window rows", () => {
    const cells = computeHeatmap({ responses, departments, k: 5, weeks });
    const orgAdoption = cellOf(cells, null, "adoption");
    expect(orgAdoption.suppressed).toBe(false);
    // 20 W1.1 answers org-wide, 14 non-"none" (dep-a's sub-k rows fold in)
    expect(orgAdoption.value).toBeCloseTo(7, 10);
    expect(orgAdoption.n).toBe(20); // weekly proxies 10 + 10
    expect(cells).toHaveLength((departments.length + 1) * 4);
  });

  it("qualifies week by week: a sub-k week contributes neither value nor n", () => {
    const mixed = [
      ...Array.from({ length: 6 }, () =>
        row("W2.3", scale(8), { week: "2026-W01", department_id: "dep-e" }),
      ),
      ...Array.from({ length: 4 }, () =>
        row("W2.3", scale(2), { week: "2026-W02", department_id: "dep-e" }),
      ),
    ];
    const cells = computeHeatmap({
      responses: mixed,
      departments: [department("dep-e")],
      k: 5,
      weeks,
    });
    const cell = cellOf(cells, "dep-e", "efficiency");
    expect(cell.suppressed).toBe(false);
    expect(cell.n).toBe(6); // only the qualifying week
    expect(cell.value).toBe(8); // W02's rows excluded from the mean
  });

  it("uses the max per-code count as the department-week proxy", () => {
    const rows = [
      row("W1.1", choice("daily"), { department_id: "dep-f" }),
      row("W1.1", choice("daily"), { department_id: "dep-f" }),
      row("W1.1", choice("daily"), { department_id: "dep-f" }),
      row("W2.3", scale(5), { department_id: "dep-f" }),
      row("W2.3", scale(5), { department_id: "dep-f" }),
    ];
    const cells = computeHeatmap({
      responses: rows,
      departments: [department("dep-f")],
      k: 3,
      weeks: ["2026-W01"],
    });
    expect(cellOf(cells, "dep-f", "adoption").n).toBe(3);
    expect(cellOf(cells, "dep-f", "adoption").suppressed).toBe(false);
  });

  it("honours the passed k threshold (no hardcoded 5)", () => {
    const cells = computeHeatmap({ responses, departments, k: 7, weeks });
    // dep-b's weekly proxy is 6 — reportable at k=5, suppressed at k=7.
    expect(cellOf(cells, "dep-b", "adoption").suppressed).toBe(true);
    expect(cellOf(cells, "dep-b", "adoption").n).toBe(6);
  });

  it("is null-safe on empty input", () => {
    const cells = computeHeatmap({
      responses: [],
      departments: [department("dep-a")],
      k: 5,
      weeks,
    });
    expect(cells).toHaveLength(8);
    expect(cellOf(cells, "dep-a", "adoption")).toMatchObject({
      value: null,
      n: 0,
      suppressed: true,
    });
    expect(cellOf(cells, null, "adoption")).toMatchObject({
      value: null,
      n: 0,
      suppressed: false,
    });
  });
});

// --- 8. computeToolUsage ---------------------------------------------------------------------------------

describe("computeToolUsage", () => {
  it("counts W1.2 mentions within the window, sorted by mentions", () => {
    const stats = computeToolUsage({
      responses: [
        row("W1.2", choice("chatgpt")),
        row("W1.2", choice("chatgpt")),
        row("W1.2", choice("claude")),
        row("W1.2", choice("gemini"), { week: "2025-W50" }), // outside window
        row("W1.1", choice("daily")), // different question → ignored
      ],
      weeks: ["2026-W01"],
    });
    expect(stats).toEqual([
      { tool_value: "chatgpt", mentions: 2, total: 3, share: 2 / 3 },
      { tool_value: "claude", mentions: 1, total: 3, share: 1 / 3 },
    ]);
  });

  it("is empty without W1.2 answers", () => {
    expect(computeToolUsage({ responses: [], weeks: ["2026-W01"] })).toEqual([]);
  });
});

// --- 9. computeTrainingWishes ------------------------------------------------------------------------------

describe("computeTrainingWishes", () => {
  it("shares topics over all M3.2 answers; 'none' counts in the total only", () => {
    const stats = computeTrainingWishes([
      row("M3.2", multi(["basics", "prompt_engineering"])),
      row("M3.2", multi(["basics"])),
      row("M3.2", multi(["none"])), // exclusive "no need" → denominator only
    ]);
    expect(stats).toEqual([
      { topic: "basics", count: 2, total: 3, share: 2 / 3 },
      { topic: "prompt_engineering", count: 1, total: 3, share: 1 / 3 },
    ]);
  });

  it("sorts by share descending", () => {
    const stats = computeTrainingWishes([
      row("M3.2", multi(["ethics"])),
      row("M3.2", multi(["automation", "ethics"])),
    ]);
    expect(stats.map((stat) => stat.topic)).toEqual(["ethics", "automation"]);
  });

  it("ignores other questions and wrong-kind answers", () => {
    expect(
      computeTrainingWishes([
        row("O5", multi(["writing"])),
        row("M3.2", choice("basics")), // wrong kind → not even in the total
      ]),
    ).toEqual([]);
  });

  it("is empty on empty input", () => {
    expect(computeTrainingWishes([])).toEqual([]);
  });
});

// --- 10. computeBaseline -----------------------------------------------------------------------------------

describe("computeBaseline", () => {
  it("means the four indices over the first two entries only", () => {
    const baseline = computeBaseline([
      weeklyKpis({
        week: "2026-W01",
        adoption_rate: 0.5,
        efficiency_index: 6,
        trust_index: null,
        sentiment_index: 4,
      }),
      weeklyKpis({
        week: "2026-W02",
        adoption_rate: 0.7,
        efficiency_index: null,
        trust_index: 8,
        sentiment_index: 6,
      }),
      // Week 3 must NOT influence the baseline.
      weeklyKpis({
        week: "2026-W03",
        adoption_rate: 0.9,
        efficiency_index: 10,
        trust_index: 10,
        sentiment_index: 10,
      }),
    ]);
    expect(baseline.adoption_rate).toBeCloseTo(0.6, 10);
    expect(baseline.efficiency_index).toBe(6); // null week ignored per metric
    expect(baseline.trust_index).toBe(8);
    expect(baseline.sentiment_index).toBe(5);
  });

  it("works with a single entry", () => {
    const baseline = computeBaseline([
      weeklyKpis({ week: "2026-W01", adoption_rate: 0.4 }),
    ]);
    expect(baseline.adoption_rate).toBeCloseTo(0.4, 10);
    expect(baseline.trust_index).toBeNull();
  });

  it("is all-null on empty input", () => {
    expect(computeBaseline([])).toEqual({
      adoption_rate: null,
      efficiency_index: null,
      trust_index: null,
      sentiment_index: null,
    });
  });
});

// --- pooledAdoption + n_adoption (thin-sample guard) ---------------------------

describe("pooledAdoption", () => {
  it("pools W1.1 shares across the window and reports n", () => {
    const rows = [
      row("W1.1", choice("daily"), { week: "2026-W01" }),
      row("W1.1", choice("none"), { week: "2026-W01" }),
      row("W1.1", choice("1_2"), { week: "2026-W02" }),
      row("W1.1", choice("3_5"), { week: "2026-W02" }),
      // outside the window — must not count
      row("W1.1", choice("none"), { week: "2026-W09" }),
    ];
    expect(pooledAdoption(rows, ["2026-W01", "2026-W02"])).toEqual({
      rate: 3 / 4,
      n: 4,
    });
  });

  it("is null without any W1.1 answers in the window", () => {
    expect(pooledAdoption([], ["2026-W01"])).toBeNull();
  });

  it("exposes the sample floor constant", () => {
    expect(WEEKLY_ADOPTION_MIN_SAMPLE).toBe(5);
  });
});

describe("computeWeeklyKpis · n_adoption", () => {
  it("counts the week's W1.1 answers so consumers can gate thin samples", () => {
    const rows = [
      row("W1.1", choice("none"), { week: "2026-W01" }),
      row("W1.1", choice("daily"), { week: "2026-W01" }),
      row("W2.3", scale(7), { week: "2026-W01" }),
    ];
    const kpis = computeWeeklyKpis({ responses: rows, week: "2026-W01" });
    expect(kpis.n_adoption).toBe(2);
    expect(kpis.adoption_rate).toBe(0.5);
  });
});
