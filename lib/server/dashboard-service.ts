/**
 * Dashboard/report composition service (server-only).
 *
 * Assembles everything the dashboard and the monthly report need from the
 * store and the pure domain layer (kpi.ts, triggers.ts). Aggregation and the
 * k-anonymity check run exclusively here on the server — the client only ever
 * receives aggregates (SPEC §5, §7).
 */

import {
  computeBaseline,
  computeEfficiencyIndex,
  computeGapPairs,
  computeHeatmap,
  computeKpiHistory,
  computeNps,
  computeRoi,
  computeToolUsage,
  computeTrainingWishes,
  pooledAdoption,
} from "@/lib/domain/kpi";
import { parseIsoWeek } from "@/lib/domain/isoWeek";
import { evaluateTriggers } from "@/lib/domain/triggers";
import type {
  Department,
  GapPairResult,
  HeatmapCell,
  Organization,
  ParticipationStat,
  RecommendationRule,
  RecommendationStatus,
  RoiSnapshot,
  SurveyResponse,
  ToolUsageStat,
  TrainingWishStat,
  WeeklyKpis,
} from "@/lib/types";
import { getStore } from "./store-instance";

export interface DashboardRecommendation {
  rule: RecommendationRule;
  context: string;
  detail: string;
  status: RecommendationStatus;
}

export interface FreeTextHighlight {
  question: string;
  text: string;
}

export interface DashboardData {
  org: Organization;
  orgs: Organization[];
  departments: Department[];
  weeks: string[];
  history: WeeklyKpis[];
  baseline: ReturnType<typeof computeBaseline>;
  /**
   * Adoption pooled over the window/baseline weeks. Weeks where the rotation
   * did not draw W1.1 only carry non-user answers — pooling avoids that
   * single-week sampling artifact for the headline (KPI thin-sample guard).
   * baseline is null while the windows would overlap (< 6 weeks of data).
   */
  adoption: { current: number | null; baseline: number | null };
  efficiencyCombined: number | null;
  /** Hourly rate the ROI uses; from F5 answers when present (SPEC §12). */
  roiHourlyRate: number;
  roiRateFromF5: boolean;
  roi: RoiSnapshot;
  gapPairs: GapPairResult[];
  nps: { value: number; n: number } | null;
  heatmap: HeatmapCell[];
  toolUsage: ToolUsageStat[];
  trainingWishes: TrainingWishStat[];
  recommendations: DashboardRecommendation[];
  freeTexts: FreeTextHighlight[];
  totalResponses: number;
}

/** Monday of an ISO week (UTC). */
export function mondayOfIsoWeek(week: string): Date {
  const { year, week: wk } = parseIsoWeek(week);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const isoDay = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = new Date(jan4.getTime() - (isoDay - 1) * 86_400_000);
  return new Date(week1Monday.getTime() + (wk - 1) * 7 * 86_400_000);
}

/** Calendar month ("2026-07") an ISO week belongs to (by its Thursday). */
export function monthOfIsoWeek(week: string): string {
  const thursday = new Date(
    mondayOfIsoWeek(week).getTime() + 3 * 86_400_000,
  );
  return `${thursday.getUTCFullYear()}-${String(thursday.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Deterministic shuffle (seeded, stable per org+week — no Math.random). */
function seededShuffle<T>(items: T[], seedString: string): T[] {
  let h = 1779033703 ^ seedString.length;
  for (let i = 0; i < seedString.length; i++) {
    h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const rng = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = a;
  }
  return copy;
}

function sortedWeeklyWeeks(stats: ParticipationStat[]): string[] {
  return [
    ...new Set(
      stats.filter((s) => s.template_key === "weekly").map((s) => s.week),
    ),
  ].sort();
}

/**
 * Free texts are shown org-wide only, in random order, without department or
 * date (SPEC §7.3). Display strips everything but question + text; the rows
 * themselves are department-free at write time (survey action and generator).
 * `codes` optionally narrows to specific questions (report use-case section).
 */
async function collectFreeTexts(
  responses: SurveyResponse[],
  org: Organization,
  latestWeek: string | undefined,
  limit: number,
  codes?: readonly string[],
): Promise<FreeTextHighlight[]> {
  const store = await getStore();
  const questionText = new Map<string, string>();
  for (const template of ["weekly", "monthly", "leadership"] as const) {
    for (const q of await store.listQuestions(template)) {
      questionText.set(
        q.code,
        org.form_of_address === "sie" && q.text_sie ? q.text_sie : q.text,
      );
    }
  }
  const wanted = codes ? new Set(codes) : null;
  const texts = responses
    .filter(
      (r) =>
        r.answer.kind === "text" && (!wanted || wanted.has(r.question_code)),
    )
    .map((r) => ({
      question: questionText.get(r.question_code) ?? r.question_code,
      text: r.answer.kind === "text" ? r.answer.value : "",
    }));
  return seededShuffle(texts, `${org.id}|${latestWeek ?? ""}`).slice(0, limit);
}

/** Mean of F5 (Ø team hourly rate) answers in the rows; SPEC §12: F5 → ROI. */
function effectiveHourlyRate(
  rows: SurveyResponse[],
  fallback: number,
): { rate: number; fromF5: boolean } {
  const values = rows
    .filter((r) => r.question_code === "F5" && r.answer.kind === "number")
    .map((r) => (r.answer.kind === "number" ? r.answer.value : 0))
    .filter((v) => v > 0);
  if (values.length === 0) return { rate: fallback, fromF5: false };
  return {
    rate: values.reduce((a, b) => a + b, 0) / values.length,
    fromF5: true,
  };
}

async function assemble(
  org: Organization,
  weeks: string[],
): Promise<Omit<DashboardData, "orgs">> {
  const store = await getStore();
  const departments = await store.listDepartments(org.id);
  const allResponses = await store.listResponses(org.id);
  const participations = await store.listParticipationStats(org.id);
  const toolSettings = await store.listToolSettings(org.id);
  const rules = await store.listRules();
  const states = await store.listRecommendationStates(org.id);

  const weekSet = new Set(weeks);
  const responses = allResponses.filter((r) => weekSet.has(r.created_week));

  const history = computeKpiHistory({
    responses,
    weeks,
    participations: participations.filter((p) => weekSet.has(p.week)),
  });
  const roiWindow = history.slice(-4);
  const hourly = effectiveHourlyRate(responses, org.hourly_rate_default);
  const roi = computeRoi({
    weekly: roiWindow,
    hourlyRate: hourly.rate,
    toolSettings: toolSettings.filter((t) => t.active),
  });
  const gapPairs = computeGapPairs(responses);
  const toolUsage = computeToolUsage({ responses, weeks });
  const trainingWishes = computeTrainingWishes(responses);

  const triggered = evaluateTriggers(
    {
      weekly: history,
      gapPairs,
      toolUsage,
      toolSettings,
      trainingWishes,
    },
    rules,
  );
  const ruleByKey = new Map(rules.map((r) => [r.key, r]));
  const stateByKey = new Map(
    states.map((s) => [`${s.rule_key}|${s.context}`, s.status]),
  );
  const recommendations: DashboardRecommendation[] = triggered.flatMap((t) => {
    const rule = ruleByKey.get(t.rule_key);
    if (!rule) return [];
    return [
      {
        rule,
        context: t.context,
        detail: t.detail,
        status: stateByKey.get(`${t.rule_key}|${t.context}`) ?? "open",
      },
    ];
  });

  const latestWeek = weeks[weeks.length - 1];
  return {
    org,
    departments,
    weeks,
    history,
    baseline: computeBaseline(history),
    adoption: {
      current: pooledAdoption(responses, weeks.slice(-4))?.rate ?? null,
      // Suppress the baseline while the two windows would overlap — a delta
      // of a window against (parts of) itself is structurally "flat".
      baseline:
        weeks.length >= 6
          ? (pooledAdoption(responses, weeks.slice(0, 2))?.rate ?? null)
          : null,
    },
    efficiencyCombined: computeEfficiencyIndex({ responses, weeks }),
    roiHourlyRate: hourly.rate,
    roiRateFromF5: hourly.fromF5,
    roi,
    gapPairs,
    nps: computeNps(responses),
    heatmap: computeHeatmap({
      responses,
      departments,
      k: org.k_anonymity_min,
      weeks,
    }),
    toolUsage,
    trainingWishes,
    recommendations,
    freeTexts: await collectFreeTexts(responses, org, latestWeek, 6),
    totalResponses: allResponses.length,
  };
}

export async function getDashboardData(
  slug: string,
): Promise<DashboardData | null> {
  const store = await getStore();
  const org = await store.getOrganizationBySlug(slug);
  if (!org) return null;
  const orgs = await store.listOrganizations();

  const stats = await store.listParticipationStats(org.id);
  let weeks = sortedWeeklyWeeks(stats);
  if (weeks.length === 0) {
    // Orgs without generated cycles (e.g. the interactive Musterwerk demo):
    // fall back to the weeks that actually carry responses.
    weeks = [
      ...new Set((await store.listResponses(org.id)).map((r) => r.created_week)),
    ].sort();
  }

  const data = await assemble(org, weeks);
  return { ...data, orgs };
}

export interface ReportData extends Omit<DashboardData, "orgs"> {
  month: string;
  /** Use-case highlights (W2.2/M1.4 only — SPEC §8 F6 "Top-Use-Cases"). */
  useCases: FreeTextHighlight[];
  /** Week of the monthly/leadership cycle the M/F sections are based on. */
  monthlyScopeWeek: string | null;
  /** Aggregates for the AI-Act competence section (SPEC §5 P5). */
  aiAct: {
    baselineKnowledge: number | null; // mean O4 (program baseline, all-time)
    currentConfidence: number | null; // mean M3.1 of the scoped monthly cycle
    courseShare: number | null; // share of M3.3 "yes" of the scoped cycle
    avgWeeklyParticipation: number | null;
  };
}

export async function getReportData(
  slug: string,
  month: string,
): Promise<ReportData | null> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const store = await getStore();
  const org = await store.getOrganizationBySlug(slug);
  if (!org) return null;

  const stats = await store.listParticipationStats(org.id);
  const allWeeks = sortedWeeklyWeeks(stats);
  const monthWeeks = allWeeks.filter((w) => monthOfIsoWeek(w) === month);
  if (monthWeeks.length === 0) return null;

  const data = await assemble(org, monthWeeks);
  const allResponses = await store.listResponses(org.id);

  // SPEC §10: the baseline is the PROGRAM baseline (first two measurement
  // weeks), not the first weeks of the report month — otherwise every report
  // after month one compares the month against itself.
  const weekSetAll = new Set(allWeeks);
  const programHistory = computeKpiHistory({
    responses: allResponses.filter((r) => weekSetAll.has(r.created_week)),
    weeks: allWeeks,
    participations: stats.filter((p) => weekSetAll.has(p.week)),
  });
  const programBaseline = computeBaseline(programHistory);
  const adoptionBaseline =
    pooledAdoption(allResponses, allWeeks.slice(0, 2))?.rate ?? null;

  // M/F sections (gap, NPS, wishes, AI-Act "aktuell"): scope to the latest
  // monthly/leadership cycle at or before the end of the report month —
  // months without their own monthly cycle fall back to the previous one,
  // and later data never changes an old report retroactively.
  const monthlyWeeks = [
    ...new Set(
      stats
        .filter(
          (s) =>
            (s.template_key === "monthly" || s.template_key === "leadership") &&
            monthOfIsoWeek(s.week) <= month,
        )
        .map((s) => s.week),
    ),
  ].sort();
  const monthlyScopeWeek = monthlyWeeks[monthlyWeeks.length - 1] ?? null;
  const monthlyRows = monthlyScopeWeek
    ? allResponses.filter(
        (r) =>
          r.created_week === monthlyScopeWeek &&
          (r.question_code.startsWith("M") || r.question_code.startsWith("F")),
      )
    : [];
  // The benefit gap pair needs employee W2.3 context from the report month.
  const monthRows = allResponses.filter((r) =>
    monthWeeks.includes(r.created_week),
  );
  const gapScopeRows = [
    ...monthlyRows,
    ...monthRows.filter((r) => !monthlyRows.some((m) => m.id === r.id)),
  ];

  const scaleMean = (rows: SurveyResponse[], code: string): number | null => {
    const values = rows
      .filter((r) => r.question_code === code && r.answer.kind === "scale")
      .map((r) => (r.answer.kind === "scale" ? r.answer.value : 0));
    return values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;
  };
  const m33 = monthlyRows.filter(
    (r) => r.question_code === "M3.3" && r.answer.kind === "choice",
  );
  const courseShare = m33.length
    ? m33.filter((r) => r.answer.kind === "choice" && r.answer.value === "yes")
        .length / m33.length
    : null;
  const weeklyRates = data.history
    .map((h) => h.participation_rate)
    .filter((r): r is number => r !== null);

  return {
    ...data,
    baseline: programBaseline,
    adoption: { current: data.adoption.current, baseline: adoptionBaseline },
    gapPairs: computeGapPairs(gapScopeRows),
    nps: computeNps(monthlyRows),
    trainingWishes: computeTrainingWishes(monthlyRows),
    month,
    monthlyScopeWeek,
    useCases: await collectFreeTexts(
      [...monthRows, ...monthlyRows],
      org,
      monthWeeks[monthWeeks.length - 1],
      5,
      ["W2.2", "M1.4"],
    ),
    aiAct: {
      baselineKnowledge: scaleMean(allResponses, "O4"),
      currentConfidence: scaleMean(monthlyRows, "M3.1"),
      courseShare,
      avgWeeklyParticipation: weeklyRates.length
        ? weeklyRates.reduce((a, b) => a + b, 0) / weeklyRates.length
        : null,
    },
  };
}
