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
   */
  adoption: { current: number | null; baseline: number | null };
  efficiencyCombined: number | null;
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
 * date (SPEC §7.3) — the rows already carry no department (Phase 1 hardening).
 */
async function collectFreeTexts(
  responses: SurveyResponse[],
  org: Organization,
  latestWeek: string | undefined,
  limit: number,
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
  const texts = responses
    .filter((r) => r.answer.kind === "text")
    .map((r) => ({
      question: questionText.get(r.question_code) ?? r.question_code,
      text: r.answer.kind === "text" ? r.answer.value : "",
    }));
  return seededShuffle(texts, `${org.id}|${latestWeek ?? ""}`).slice(0, limit);
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
  const roi = computeRoi({
    weekly: roiWindow,
    hourlyRate: org.hourly_rate_default,
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
      baseline: pooledAdoption(responses, weeks.slice(0, 2))?.rate ?? null,
    },
    efficiencyCombined: computeEfficiencyIndex({ responses, weeks }),
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
  /** Aggregates for the AI-Act competence section (SPEC §5 P5). */
  aiAct: {
    baselineKnowledge: number | null; // mean O4
    currentConfidence: number | null; // mean M3.1
    courseShare: number | null; // share of M3.3 "yes"
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
  const monthWeeks = sortedWeeklyWeeks(stats).filter(
    (w) => monthOfIsoWeek(w) === month,
  );
  if (monthWeeks.length === 0) return null;

  const data = await assemble(org, monthWeeks);

  const allResponses = await store.listResponses(org.id);
  const scaleMean = (code: string): number | null => {
    const values = allResponses
      .filter((r) => r.question_code === code && r.answer.kind === "scale")
      .map((r) => (r.answer.kind === "scale" ? r.answer.value : 0));
    return values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;
  };
  const m33 = allResponses.filter(
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
    month,
    aiAct: {
      baselineKnowledge: scaleMean("O4"),
      currentConfidence: scaleMean("M3.1"),
      courseShare,
      avgWeeklyParticipation: weeklyRates.length
        ? weeklyRates.reduce((a, b) => a + b, 0) / weeklyRates.length
        : null,
    },
  };
}
