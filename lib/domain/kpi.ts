/**
 * KPI engine — formulas exactly per SPEC.md §10.
 *
 * Pure domain logic (CLAUDE.md architecture rule 1): no IO, no framework
 * imports, no Math.random, no Date.now. Works on anonymous `SurveyResponse`
 * rows; k-anonymity is enforced ONLY via `meetsKAnonymity` (rule 4) inside
 * the heatmap aggregation — never in the client, never as a local constant.
 *
 * Conventions used throughout:
 * - Malformed answers (wrong `AnswerValue.kind` for a question, or a choice
 *   value without a defined mapping) are silently ignored — they contribute
 *   to no numerator, denominator, sum or count.
 * - All means are arithmetic. NOTHING is rounded except the NPS value
 *   (SPEC.md §10 defines NPS in whole points; all other formatting is UI).
 * - Inputs are never mutated; sorting always happens on copies.
 * - `null` means "no data for this metric", 0 is a real measured zero.
 */

import { meetsKAnonymity } from "@/lib/domain/anonymity";
import type {
  Department,
  GapPairResult,
  HeatmapCell,
  OrgToolSetting,
  ParticipationStat,
  RoiSnapshot,
  SurveyResponse,
  ToolUsageStat,
  TrainingWishStat,
  WeeklyDimension,
  WeeklyKpis,
} from "@/lib/types";
import { WEEKLY_DIMENSIONS } from "@/lib/types";

// --- Mappings (SPEC.md §10) -------------------------------------------------

/**
 * W2.1 saved-hours class midpoints in hours (SPEC.md §10:
 * "0; 0,5; 2; 4; 7,5; 12"). Keys are the stable choice values of the seed.
 */
export const W21_CLASS_MIDPOINTS: Readonly<Record<string, number>> = {
  none: 0,
  lt_1: 0.5,
  "1_3": 2,
  "3_5": 4,
  "5_10": 7.5,
  gt_10: 12,
};

/**
 * W3.1 rework frequency, inverted onto the 0–10 trust scale (SPEC.md §10:
 * "Nie=10, Selten=7,5, Manchmal=5, Oft=2,5, Fast immer=0").
 */
export const W31_INVERTED: Readonly<Record<string, number>> = {
  never: 10,
  rarely: 7.5,
  sometimes: 5,
  often: 2.5,
  almost_always: 0,
};

/**
 * W4.1 relief/strain, mapped onto the 0–10 sentiment scale (SPEC.md §10:
 * "10/7,5/5/2,5/0").
 */
export const W41_MAPPED: Readonly<Record<string, number>> = {
  strong_relief: 10,
  some_relief: 7.5,
  neutral: 5,
  some_strain: 2.5,
  strong_strain: 0,
};

/**
 * Normalize an M1.3 productivity answer (scale −5..+5) onto 0..10
 * (SPEC.md §10: "(x+5)/10×10").
 */
export function normalizeM13(x: number): number {
  return ((x + 5) / 10) * 10;
}

/**
 * Minimum W1.1 answers a week needs before its adoption share counts as
 * evidence. Weeks where the rotation did not draw W1.1 only carry the
 * short-variant answers of non-users (who by design answer "none") — a
 * statistically thin, structurally biased sample that must neither drive the
 * headline nor fire trigger R1. This is a sample-size floor, NOT the
 * k-anonymity threshold (that lives in anonymity.ts).
 */
export const WEEKLY_ADOPTION_MIN_SAMPLE = 5;

/**
 * Adoption pooled over a multi-week window: share of all W1.1 answers in the
 * window with usage >= "1–2 mal". Pooling across weeks averages out the
 * draw/no-draw sampling artifact of single weeks; null when no W1.1 answers.
 */
export function pooledAdoption(
  responses: readonly SurveyResponse[],
  weeks: readonly string[],
): { rate: number; n: number } | null {
  const weekSet = new Set(weeks);
  const values: string[] = [];
  for (const row of responses) {
    if (row.question_code !== "W1.1" || !weekSet.has(row.created_week)) {
      continue;
    }
    if (row.answer.kind === "choice") values.push(row.answer.value);
  }
  if (values.length === 0) return null;
  return {
    rate: values.filter((v) => v !== "none").length / values.length,
    n: values.length,
  };
}

// --- Internal answer-extraction helpers -------------------------------------

/** True for weekly pulse question codes ("W1.1" … "W4.3"). */
function isWeeklyCode(code: string): boolean {
  return code.startsWith("W");
}

/** Scale values of all answers to `code`; wrong-kind answers are skipped. */
function scaleValues(rows: readonly SurveyResponse[], code: string): number[] {
  const values: number[] = [];
  for (const row of rows) {
    if (row.question_code === code && row.answer.kind === "scale") {
      values.push(row.answer.value);
    }
  }
  return values;
}

/** Choice values of all answers to `code`; wrong-kind answers are skipped. */
function choiceValues(rows: readonly SurveyResponse[], code: string): string[] {
  const values: string[] = [];
  for (const row of rows) {
    if (row.question_code === code && row.answer.kind === "choice") {
      values.push(row.answer.value);
    }
  }
  return values;
}

/**
 * Choice answers to `code` mapped through a value table; answers whose value
 * has no mapping are malformed and skipped.
 */
function mappedChoiceValues(
  rows: readonly SurveyResponse[],
  code: string,
  mapping: Readonly<Record<string, number>>,
): number[] {
  const values: number[] = [];
  for (const value of choiceValues(rows, code)) {
    const mapped = mapping[value];
    if (mapped !== undefined) values.push(mapped);
  }
  return values;
}

/** Arithmetic mean; null on an empty list (no data ≠ zero). */
function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/**
 * Mean of two sub-means (SPEC.md §10 "Mittel aus …"): when one side has no
 * data it falls back to the other alone; null when neither side has data.
 * Averaging sub-means (not pooling raw values) keeps both sources equally
 * weighted regardless of how many answers each question received.
 */
function meanOfSubMeans(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return (a + b) / 2;
}

/**
 * Respondent proxy for a set of anonymous rows: the MAX answer count of any
 * single question code. Rows carry no respondent key (SPEC.md §7), so exact
 * respondent counts are unknowable from `responses` alone; since each person
 * answers a question at most once per cycle, the busiest question's answer
 * count is the best available lower bound on distinct respondents.
 */
function respondentProxy(rows: readonly SurveyResponse[]): number {
  const countsByCode = new Map<string, number>();
  for (const row of rows) {
    countsByCode.set(
      row.question_code,
      (countsByCode.get(row.question_code) ?? 0) + 1,
    );
  }
  let max = 0;
  for (const count of countsByCode.values()) {
    if (count > max) max = count;
  }
  return max;
}

/** Group rows by their `created_week`. */
function groupByWeek(
  rows: readonly SurveyResponse[],
): Map<string, SurveyResponse[]> {
  const byWeek = new Map<string, SurveyResponse[]>();
  for (const row of rows) {
    const bucket = byWeek.get(row.created_week);
    if (bucket) {
      bucket.push(row);
    } else {
      byWeek.set(row.created_week, [row]);
    }
  }
  return byWeek;
}

// --- 1. Weekly KPI snapshot --------------------------------------------------

/**
 * Compute one week's pulse KPIs (SPEC.md §10, dashboard index tiles).
 *
 * Only rows of the given ISO week with weekly question codes ("W…") are
 * considered. `participation` is the week's weekly-cycle stat, matched by the
 * caller (or `computeKpiHistory`).
 */
export function computeWeeklyKpis(args: {
  responses: SurveyResponse[];
  week: string;
  participation?: ParticipationStat | null;
}): WeeklyKpis {
  const { responses, week, participation } = args;
  const rows = responses.filter(
    (row) => row.created_week === week && isWeeklyCode(row.question_code),
  );

  // Adoption (SPEC.md §10): share of W1.1 answers with usage >= "1–2 mal",
  // i.e. everything except "none". A "none" answer counts in the denominator
  // only — non-users are a signal, not missing data (SPEC.md §9).
  const w11 = choiceValues(rows, "W1.1");
  const adoption_rate =
    w11.length === 0
      ? null
      : w11.filter((value) => value !== "none").length / w11.length;
  const power_user_share =
    w11.length === 0
      ? null
      : w11.filter((value) => value === "daily" || value === "multiple_daily")
          .length / w11.length;

  // Saved hours: sum of W2.1 class midpoints. A week without W2.1 answers
  // saved 0 reported hours (a sum, not an average — hence 0, not null).
  let saved_hours_sum = 0;
  for (const midpoint of mappedChoiceValues(rows, "W2.1", W21_CLASS_MIDPOINTS)) {
    saved_hours_sum += midpoint;
  }

  // Weekly efficiency trend deliberately uses W2.3 only; the monthly M1.3 is
  // folded in by `computeEfficiencyIndex` for the headline index.
  const efficiency_index = mean(scaleValues(rows, "W2.3"));

  const trust_index = meanOfSubMeans(
    mean(scaleValues(rows, "W3.3")),
    mean(mappedChoiceValues(rows, "W3.1", W31_INVERTED)),
  );
  const sentiment_index = meanOfSubMeans(
    mean(scaleValues(rows, "W4.2")),
    mean(mappedChoiceValues(rows, "W4.1", W41_MAPPED)),
  );

  const participation_rate =
    participation && participation.invited > 0
      ? participation.completed / participation.invited
      : null;

  return {
    week,
    n_pulse: respondentProxy(rows),
    n_adoption: w11.length,
    adoption_rate,
    power_user_share,
    saved_hours_sum,
    efficiency_index,
    trust_index,
    sentiment_index,
    participation_rate,
  };
}

// --- 2. KPI history -----------------------------------------------------------

/**
 * Weekly KPI series for a window of ISO weeks, chronologically ascending.
 * Each week is matched with its WEEKLY-template participation stat (monthly
 * stats of the same week never match). Zero-padded ISO weeks ("2026-W05",
 * see lib/domain/isoWeek.ts) sort chronologically as strings.
 */
export function computeKpiHistory(args: {
  responses: SurveyResponse[];
  weeks: string[];
  participations: ParticipationStat[];
}): WeeklyKpis[] {
  const { responses, weeks, participations } = args;
  return [...weeks].sort().map((week) =>
    computeWeeklyKpis({
      responses,
      week,
      participation:
        participations.find(
          (stat) => stat.template_key === "weekly" && stat.week === week,
        ) ?? null,
    }),
  );
}

// --- 3. Headline efficiency index ---------------------------------------------

/**
 * Headline efficiency index (SPEC.md §10: "Mittel aus W2.3 und normiertem
 * M1.3"): mean of sub-means over [mean(W2.3 within the week window),
 * mean(normalizeM13 over ALL M1.3 scale answers)]. M1.3 is monthly and not
 * bound to a pulse week window, so it is not week-filtered. A missing side
 * falls back to the other alone; null when neither has data.
 */
export function computeEfficiencyIndex(args: {
  responses: SurveyResponse[];
  weeks: string[];
}): number | null {
  const { responses, weeks } = args;
  const weekSet = new Set(weeks);
  const w23Mean = mean(
    scaleValues(
      responses.filter((row) => weekSet.has(row.created_week)),
      "W2.3",
    ),
  );
  const m13Mean = mean(scaleValues(responses, "M1.3").map(normalizeM13));
  return meanOfSubMeans(w23Mean, m13Mean);
}

// --- 4. ROI ---------------------------------------------------------------------

/**
 * ROI tile numbers (SPEC.md §10) over the passed weekly window (the caller
 * passes the last 4 weeks ≈ one month).
 *
 * Conservative per SPEC: `saved_hours` is ONLY the sum of reported W2.1
 * midpoints (M1.1 self-estimates are deliberately not folded in). The
 * participation-based extrapolation to non-participants is the secondary
 * value and only produced for a plausible average participation (0 < p <= 1).
 */
export function computeRoi(args: {
  weekly: WeeklyKpis[];
  hourlyRate: number;
  toolSettings: OrgToolSetting[];
}): RoiSnapshot {
  const { weekly, hourlyRate, toolSettings } = args;

  let saved_hours = 0;
  for (const entry of weekly) saved_hours += entry.saved_hours_sum;

  const participationRates: number[] = [];
  for (const entry of weekly) {
    if (entry.participation_rate !== null) {
      participationRates.push(entry.participation_rate);
    }
  }
  const avgParticipation = mean(participationRates);
  const saved_hours_extrapolated =
    avgParticipation !== null && avgParticipation > 0 && avgParticipation <= 1
      ? saved_hours / avgParticipation
      : null;

  let license_costs_eur = 0;
  for (const setting of toolSettings) {
    if (setting.active) license_costs_eur += setting.monthly_license_cost_eur;
  }

  const gross_savings_eur = saved_hours * hourlyRate;
  const net_savings_eur = gross_savings_eur - license_costs_eur;
  const roi_multiple =
    license_costs_eur === 0 ? null : gross_savings_eur / license_costs_eur;

  return {
    saved_hours,
    saved_hours_extrapolated,
    gross_savings_eur,
    license_costs_eur,
    net_savings_eur,
    roi_multiple,
  };
}

// --- 5. Perception gap -----------------------------------------------------------

/**
 * The three mirrored perception-gap pairs (SPEC.md §10):
 *
 * 1. strategy:   M5.1 (employee) ↔ F6 (leadership)
 * 2. competence: M3.1 (employee) ↔ F7 (leadership)
 * 3. benefit:    employee efficiency index (W2.3 + normalized M1.3,
 *                employee rows) ↔ F2 (leadership benefit estimate)
 *
 * The employee side counts ONLY rows with `role_scope === "employee"` — a
 * lead answering the monthly M-questions must not dilute the employee view.
 * F-questions are served to leadership only (SPEC.md §12), so the leadership
 * side takes all F-rows. gap = leadership − employee; positive = Führung
 * optimistischer. Always returns exactly three pairs, in the order above.
 */
export function computeGapPairs(responses: SurveyResponse[]): GapPairResult[] {
  const employeeRows = responses.filter(
    (row) => row.role_scope === "employee",
  );

  const scalePair = (
    pair: GapPairResult["pair"],
    employeeCode: string,
    leadershipCode: string,
  ): GapPairResult => {
    const employeeValues = scaleValues(employeeRows, employeeCode);
    const leadershipValues = scaleValues(responses, leadershipCode);
    const employee_value = mean(employeeValues);
    const leadership_value = mean(leadershipValues);
    return {
      pair,
      employee_value,
      leadership_value,
      gap:
        employee_value !== null && leadership_value !== null
          ? leadership_value - employee_value
          : null,
      n_employee: employeeValues.length,
      n_leadership: leadershipValues.length,
    };
  };

  // Benefit pair: employee side is the efficiency index restricted to
  // employee rows (mean of sub-means, same fallback semantics as the index).
  const w23Employee = scaleValues(employeeRows, "W2.3");
  const m13Employee = scaleValues(employeeRows, "M1.3").map(normalizeM13);
  const employeeEfficiency = meanOfSubMeans(
    mean(w23Employee),
    mean(m13Employee),
  );
  const f2Values = scaleValues(responses, "F2");
  const f2Mean = mean(f2Values);
  const benefit: GapPairResult = {
    pair: "benefit",
    employee_value: employeeEfficiency,
    leadership_value: f2Mean,
    gap:
      employeeEfficiency !== null && f2Mean !== null
        ? f2Mean - employeeEfficiency
        : null,
    n_employee: w23Employee.length + m13Employee.length,
    n_leadership: f2Values.length,
  };

  return [
    scalePair("strategy", "M5.1", "F6"),
    scalePair("competence", "M3.1", "F7"),
    benefit,
  ];
}

// --- 6. NPS -------------------------------------------------------------------------

/**
 * Tool NPS from M6.1 (scale 0–10, SPEC.md §10): %promoters (9–10) minus
 * %detractors (0–6), in whole points (−100..+100). The ONLY rounded KPI —
 * NPS is conventionally reported as an integer. Null when no answers.
 */
export function computeNps(
  responses: SurveyResponse[],
): { value: number; n: number } | null {
  const values = scaleValues(responses, "M6.1");
  const n = values.length;
  if (n === 0) return null;
  const promoters = values.filter((value) => value >= 9).length;
  const detractors = values.filter((value) => value <= 6).length;
  return { value: Math.round(((promoters - detractors) / n) * 100), n };
}

// --- 7. Heatmap -----------------------------------------------------------------------

/** Cell value for one weekly dimension over an already-qualified row set. */
function dimensionValue(
  rows: readonly SurveyResponse[],
  dimension: WeeklyDimension,
): number | null {
  switch (dimension) {
    case "adoption": {
      // Adoption share scaled ×10 so every heatmap cell lives on 0..10.
      const w11 = choiceValues(rows, "W1.1");
      if (w11.length === 0) return null;
      return (w11.filter((value) => value !== "none").length / w11.length) * 10;
    }
    case "efficiency":
      return mean(scaleValues(rows, "W2.3"));
    case "trust":
      return meanOfSubMeans(
        mean(scaleValues(rows, "W3.3")),
        mean(mappedChoiceValues(rows, "W3.1", W31_INVERTED)),
      );
    case "sentiment":
      return meanOfSubMeans(
        mean(scaleValues(rows, "W4.2")),
        mean(mappedChoiceValues(rows, "W4.1", W41_MAPPED)),
      );
  }
}

/**
 * Heatmap departments × weekly dimensions (SPEC.md §7 rule 2, §8 F5), plus
 * one org-total row (`department_id: null`).
 *
 * Per department the respondent proxy is computed PER WEEK (n_dw = max
 * per-W-code answer count in that department-week). A week contributes to
 * the department's cells only when `meetsKAnonymity(n_dw, k)` — smaller
 * weeks fold into the org total only. When NO week qualifies the department
 * is suppressed: value null, `n` = max n_dw seen (lets the UI say "n < k");
 * otherwise `n` = Σ qualifying n_dw. The org-total row aggregates all window
 * rows without suppression (org-level reporting is always allowed).
 */
export function computeHeatmap(args: {
  responses: SurveyResponse[];
  departments: Department[];
  k: number;
  weeks: string[];
}): HeatmapCell[] {
  const { responses, departments, k, weeks } = args;
  const weekSet = new Set(weeks);
  const windowRows = responses.filter(
    (row) =>
      weekSet.has(row.created_week) && isWeeklyCode(row.question_code),
  );

  const cells: HeatmapCell[] = [];

  for (const department of departments) {
    const departmentRows = windowRows.filter(
      (row) => row.department_id === department.id,
    );
    const qualifyingRows: SurveyResponse[] = [];
    let qualifyingN = 0;
    let maxProxySeen = 0;
    let anyWeekQualifies = false;

    for (const weekRows of groupByWeek(departmentRows).values()) {
      const proxy = respondentProxy(weekRows);
      if (proxy > maxProxySeen) maxProxySeen = proxy;
      if (meetsKAnonymity(proxy, k)) {
        anyWeekQualifies = true;
        qualifyingN += proxy;
        qualifyingRows.push(...weekRows);
      }
    }

    for (const dimension of WEEKLY_DIMENSIONS) {
      cells.push(
        anyWeekQualifies
          ? {
              department_id: department.id,
              dimension,
              value: dimensionValue(qualifyingRows, dimension),
              n: qualifyingN,
              suppressed: false,
            }
          : {
              department_id: department.id,
              dimension,
              value: null,
              n: maxProxySeen,
              suppressed: true,
            },
      );
    }
  }

  // Org total: every window row counts (including sub-k departments — their
  // answers fold into the org-wide aggregate per SPEC.md §7 rule 2).
  let orgN = 0;
  for (const weekRows of groupByWeek(windowRows).values()) {
    orgN += respondentProxy(weekRows);
  }
  for (const dimension of WEEKLY_DIMENSIONS) {
    cells.push({
      department_id: null,
      dimension,
      value: dimensionValue(windowRows, dimension),
      n: orgN,
      suppressed: false,
    });
  }

  return cells;
}

// --- 8. Tool usage -----------------------------------------------------------------------

/**
 * Most-used-tool mentions from W1.2 within the week window. Every tool value
 * that appears is included (the trigger layer joins with `OrgToolSetting`
 * to find configured-but-unmentioned tools). Sorted by mentions descending,
 * then tool value, for a stable order.
 */
export function computeToolUsage(args: {
  responses: SurveyResponse[];
  weeks: string[];
}): ToolUsageStat[] {
  const { responses, weeks } = args;
  const weekSet = new Set(weeks);
  const values = choiceValues(
    responses.filter((row) => weekSet.has(row.created_week)),
    "W1.2",
  );
  const total = values.length;

  const mentionsByTool = new Map<string, number>();
  for (const value of values) {
    mentionsByTool.set(value, (mentionsByTool.get(value) ?? 0) + 1);
  }

  return [...mentionsByTool.entries()]
    .map(
      ([tool_value, mentions]): ToolUsageStat => ({
        tool_value,
        mentions,
        total,
        share: total === 0 ? null : mentions / total,
      }),
    )
    .sort(
      (a, b) =>
        b.mentions - a.mentions || a.tool_value.localeCompare(b.tool_value),
    );
}

// --- 9. Training wishes -----------------------------------------------------------------------

/**
 * Training-wish shares from M3.2 (multi-choice; R4 trigger input).
 * `total` = number of M3.2 answers (an exclusive "none" answer counts in the
 * denominator — "no need" is a real answer, not missing data). Each topic a
 * respondent selected (deduplicated within one answer, "none" excluded)
 * counts once. Sorted by share descending, then topic, for a stable order.
 */
export function computeTrainingWishes(
  responses: SurveyResponse[],
): TrainingWishStat[] {
  const countsByTopic = new Map<string, number>();
  let total = 0;

  for (const row of responses) {
    if (row.question_code !== "M3.2" || row.answer.kind !== "choices") continue;
    total += 1;
    for (const topic of new Set(row.answer.values)) {
      if (topic === "none") continue;
      countsByTopic.set(topic, (countsByTopic.get(topic) ?? 0) + 1);
    }
  }

  return [...countsByTopic.entries()]
    .map(
      ([topic, count]): TrainingWishStat => ({
        topic,
        count,
        total,
        share: count / total,
      }),
    )
    .sort((a, b) => b.share - a.share || a.topic.localeCompare(b.topic));
}

// --- 10. Baseline -----------------------------------------------------------------------

/**
 * Baseline index values = mean over the FIRST TWO weekly entries (SPEC.md
 * §10: "Baseline = Onboarding-Kohorte + erste 2 Pulse-Wochen" — these four
 * indices only exist from pulses, so the pulse part is what is computed
 * here). A week with a null metric is ignored for that metric; null when
 * neither of the first two weeks has data.
 */
export function computeBaseline(weekly: WeeklyKpis[]): {
  adoption_rate: number | null;
  efficiency_index: number | null;
  trust_index: number | null;
  sentiment_index: number | null;
} {
  const window = weekly.slice(0, 2);
  const baselineOf = (
    select: (entry: WeeklyKpis) => number | null,
  ): number | null => {
    const values: number[] = [];
    for (const entry of window) {
      const value = select(entry);
      if (value !== null) values.push(value);
    }
    return mean(values);
  };

  return {
    adoption_rate: baselineOf((entry) => entry.adoption_rate),
    efficiency_index: baselineOf((entry) => entry.efficiency_index),
    trust_index: baselineOf((entry) => entry.trust_index),
    sentiment_index: baselineOf((entry) => entry.sentiment_index),
  };
}
