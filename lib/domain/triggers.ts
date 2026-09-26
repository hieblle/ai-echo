/**
 * Rule-based recommendation trigger engine (SPEC.md §11, Regelwerk v1).
 *
 * Pure domain code: no IO, no framework imports, fully deterministic
 * (CLAUDE.md architecture rule 1). The rules themselves are DATA
 * (`lib/seed/rules.ts` → `recommendation_rules`); this module only knows how
 * to EVALUATE each known rule key against pre-aggregated inputs. A rule fires
 * only when it is present in the passed rule list AND active — SPEC.md §11:
 * rules are activatable per org.
 *
 * Boundary semantics are strict `<` / `>` exactly as written in the SPEC
 * table: values sitting exactly on a threshold (0.5, 5, 0.3, 0.2, 3, 0.4)
 * do NOT fire.
 */

import type {
  GapPairKey,
  GapPairResult,
  OrgToolSetting,
  RecommendationRule,
  ToolUsageStat,
  TrainingWishStat,
  TriggeredRecommendation,
  WeeklyKpis,
} from "@/lib/types";
import { WEEKLY_ADOPTION_MIN_SAMPLE } from "@/lib/domain/kpi";

// --- Thresholds (verbatim from SPEC.md §11) ---------------------------------

/** R1: adoption rate must be below 50 % in the last two weeks with data. */
const R1_ADOPTION_THRESHOLD = 0.5;
/** R2: latest trust index must be below 5. */
const R2_TRUST_THRESHOLD = 5;
/** R3: sentiment index must decline 3 cycles in a row (4 values needed). */
const R3_REQUIRED_VALUES = 4;
/** R4: a training-wish topic must exceed a 30 % share. */
const R4_WISH_THRESHOLD = 0.3;
/** R5: a paid tool's most-used share must be below 20 %. */
const R5_USAGE_THRESHOLD = 0.2;
/** R5 data guard: only evaluate with at least 10 W1.2 answers in total. */
const R5_MIN_TOTAL_ANSWERS = 10;
/** R6: the signed perception gap must exceed 3 points. */
const R6_GAP_THRESHOLD = 3;
/** R7: participation rate must be below 40 % in the last two cycles. */
const R7_PARTICIPATION_THRESHOLD = 0.4;

/** German labels for the mirrored gap pairs (SPEC.md §10). */
const GAP_PAIR_LABELS: Record<GapPairKey, string> = {
  strategy: "Strategie-Klarheit",
  competence: "KI-Kompetenz",
  benefit: "Nutzen-Einschätzung",
};

// --- Input contract ----------------------------------------------------------

export interface TriggerEvaluationInput {
  /** Weekly KPI snapshots, chronological, oldest first. */
  weekly: WeeklyKpis[];
  gapPairs: GapPairResult[];
  toolUsage: ToolUsageStat[];
  toolSettings: OrgToolSetting[];
  trainingWishes: TrainingWishStat[];
}

// --- German-ish number formatting ---------------------------------------------

/** 0..1 share as percent without decimals, e.g. 0.42 → "42 %". */
function formatPercent(share: number): string {
  return `${Math.round(share * 100)} %`;
}

/** Index/gap value with one decimal and a German decimal comma, e.g. "4,2". */
function formatDecimal(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

/** Nullable variant for defensive display (a well-formed gap has both sides). */
function formatDecimalOrDash(value: number | null): string {
  return value === null ? "–" : formatDecimal(value);
}

/** Euro amount: whole numbers plain, otherwise two decimals with comma. */
function formatEuro(value: number): string {
  return Number.isInteger(value)
    ? `${value} €`
    : `${value.toFixed(2).replace(".", ",")} €`;
}

// --- Shared helpers ------------------------------------------------------------

/** Chronological series of a weekly metric with null entries dropped. */
function nonNullSeries(
  weekly: WeeklyKpis[],
  pick: (entry: WeeklyKpis) => number | null,
): number[] {
  const values: number[] = [];
  for (const entry of weekly) {
    const value = pick(entry);
    if (value !== null) {
      values.push(value);
    }
  }
  return values;
}

/**
 * R1/R7 share the "last two data points both below threshold" shape:
 * take the non-null series, require at least 2 entries, fire only when the
 * LAST TWO are both strictly below the threshold.
 */
function lastTwoBelow(
  values: number[],
  threshold: number,
): { previous: number; last: number } | null {
  const previous = values.at(-2);
  const last = values.at(-1);
  if (previous === undefined || last === undefined) {
    return null;
  }
  return previous < threshold && last < threshold ? { previous, last } : null;
}

/** A rule hit before the rule key is attached. */
type RuleHit = Omit<TriggeredRecommendation, "rule_key">;

type RuleEvaluator = (input: TriggerEvaluationInput) => RuleHit[];

// --- Rule evaluators (SPEC.md §11) ---------------------------------------------

/**
 * R1 — Adoption-Rate < 50 % über 2 Wochen.
 * Among the weeks with a non-null adoption_rate AND a sufficient W1.1 sample
 * (n_adoption >= WEEKLY_ADOPTION_MIN_SAMPLE — weeks where the rotation did
 * not draw W1.1 only carry the biased non-user short-variant answers) there
 * must be at least 2, and the LAST TWO must both be strictly below 0.5.
 * Context is "".
 */
function evaluateR1(input: TriggerEvaluationInput): RuleHit[] {
  const qualified = input.weekly.filter(
    (w) => w.n_adoption >= WEEKLY_ADOPTION_MIN_SAMPLE,
  );
  const values = nonNullSeries(qualified, (w) => w.adoption_rate);
  const hit = lastTwoBelow(values, R1_ADOPTION_THRESHOLD);
  if (hit === null) {
    return [];
  }
  return [
    {
      context: "",
      detail: `Adoption-Rate zuletzt ${formatPercent(hit.previous)} und ${formatPercent(hit.last)} (Schwelle: 50 %).`,
    },
  ];
}

/**
 * R2 — Vertrauensindex < 5.
 * The latest non-null trust_index must be strictly below 5. Context is "".
 */
function evaluateR2(input: TriggerEvaluationInput): RuleHit[] {
  const latest = nonNullSeries(input.weekly, (w) => w.trust_index).at(-1);
  if (latest === undefined || latest >= R2_TRUST_THRESHOLD) {
    return [];
  }
  return [
    {
      context: "",
      detail: `Vertrauensindex aktuell ${formatDecimal(latest)} (Schwelle: 5).`,
    },
  ];
}

/**
 * R3 — Stimmungsindex sinkt 3 Zyklen in Folge.
 * Among the non-null sentiment_index values the last 4 must exist and form
 * 3 STRICT consecutive declines (v1 > v2 > v3 > v4). A plateau breaks the
 * streak. Context is "".
 */
function evaluateR3(input: TriggerEvaluationInput): RuleHit[] {
  const values = nonNullSeries(input.weekly, (w) => w.sentiment_index);
  if (values.length < R3_REQUIRED_VALUES) {
    return [];
  }
  const window = values.slice(-R3_REQUIRED_VALUES);
  for (let i = 1; i < window.length; i += 1) {
    const previous = window[i - 1];
    const current = window[i];
    if (previous === undefined || current === undefined || previous <= current) {
      return [];
    }
  }
  return [
    {
      context: "",
      detail: `Stimmungsindex sinkt seit 3 Zyklen in Folge: ${window
        .map(formatDecimal)
        .join(" → ")}.`,
    },
  ];
}

/**
 * R4 — Schulungswunsch-Thema X > 30 % (M3.2).
 * Every trainingWishes entry with topic !== "none" and share strictly above
 * 0.3 fires ONE recommendation per topic; context = topic.
 */
function evaluateR4(input: TriggerEvaluationInput): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const wish of input.trainingWishes) {
    if (wish.topic === "none" || wish.share <= R4_WISH_THRESHOLD) {
      continue;
    }
    hits.push({
      context: wish.topic,
      detail: `${formatPercent(wish.share)} wünschen sich eine Schulung zum Thema „${wish.topic}“ (Schwelle: 30 %).`,
    });
  }
  return hits;
}

/**
 * R5 — Tool mit Lizenzkosten > 0 und Nutzung < 20 %.
 * For each ACTIVE tool setting with monthly_license_cost_eur > 0 the W1.2
 * most-used share must be strictly below 0.2; a tool without a usage entry
 * counts as share 0. Data guard: only evaluated at all when the total number
 * of W1.2 answers is >= 10 — no firing on thin data. Context = tool_value.
 * The W1.2 total is derived as the maximum `total` across the usage stats
 * (every stat carries the same denominator).
 */
function evaluateR5(input: TriggerEvaluationInput): RuleHit[] {
  const totalAnswers = input.toolUsage.reduce(
    (max, stat) => Math.max(max, stat.total),
    0,
  );
  if (totalAnswers < R5_MIN_TOTAL_ANSWERS) {
    return [];
  }
  const hits: RuleHit[] = [];
  for (const setting of input.toolSettings) {
    if (!setting.active || setting.monthly_license_cost_eur <= 0) {
      continue;
    }
    const usage = input.toolUsage.find(
      (stat) => stat.tool_value === setting.tool_value,
    );
    const share = usage?.share ?? 0;
    if (share >= R5_USAGE_THRESHOLD) {
      continue;
    }
    hits.push({
      context: setting.tool_value,
      detail: `Bezahltes Tool „${setting.tool_label}“ (${formatEuro(setting.monthly_license_cost_eur)} pro Monat) wird nur von ${formatPercent(share)} als meistgenutztes Tool genannt (Schwelle: 20 %).`,
    });
  }
  return hits;
}

/**
 * R6 — Perception Gap > 3 Punkte auf einem Paar.
 * Fires per gap pair with gap !== null and gap strictly above 3. The gap is
 * SIGNED (leadership − employee, positive = Führung optimistischer); a
 * negative gap does NOT fire — SPEC.md frames the risk as leadership
 * over-optimism. Context = pair key.
 */
function evaluateR6(input: TriggerEvaluationInput): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const pair of input.gapPairs) {
    if (pair.gap === null || pair.gap <= R6_GAP_THRESHOLD) {
      continue;
    }
    const label = GAP_PAIR_LABELS[pair.pair];
    hits.push({
      context: pair.pair,
      detail: `Perception Gap bei ${label}: Führung ${formatDecimalOrDash(pair.leadership_value)} vs. Mitarbeitende ${formatDecimalOrDash(pair.employee_value)} (Differenz ${formatDecimal(pair.gap)} Punkte, Schwelle: 3).`,
    });
  }
  return hits;
}

/**
 * R7 — Teilnahmequote < 40 % über 2 Zyklen.
 * Among the weeks with a non-null participation_rate there must be at least
 * 2, and the LAST TWO must both be strictly below 0.4. Context is "".
 */
function evaluateR7(input: TriggerEvaluationInput): RuleHit[] {
  const values = nonNullSeries(input.weekly, (w) => w.participation_rate);
  const hit = lastTwoBelow(values, R7_PARTICIPATION_THRESHOLD);
  if (hit === null) {
    return [];
  }
  return [
    {
      context: "",
      detail: `Teilnahmequote zuletzt ${formatPercent(hit.previous)} und ${formatPercent(hit.last)} (Schwelle: 40 %).`,
    },
  ];
}

const EVALUATORS: Record<string, RuleEvaluator> = {
  R1: evaluateR1,
  R2: evaluateR2,
  R3: evaluateR3,
  R4: evaluateR4,
  R5: evaluateR5,
  R6: evaluateR6,
  R7: evaluateR7,
};

// --- Engine ---------------------------------------------------------------------

/** Deterministic codepoint comparison (no locale dependence). */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Evaluate the recommendation rules against aggregated dashboard inputs.
 *
 * Only rules that are PRESENT in `rules` AND `active` are evaluated; unknown
 * rule keys are ignored (forward compatibility with future rule seeds).
 * Results are ordered by rule key ascending, then by context.
 */
export function evaluateTriggers(
  input: TriggerEvaluationInput,
  rules: RecommendationRule[],
): TriggeredRecommendation[] {
  const results: TriggeredRecommendation[] = [];
  for (const rule of rules) {
    if (!rule.active) {
      continue;
    }
    const evaluate = EVALUATORS[rule.key];
    if (!evaluate) {
      continue;
    }
    for (const hit of evaluate(input)) {
      results.push({ rule_key: rule.key, ...hit });
    }
  }
  results.sort(
    (a, b) =>
      compareStrings(a.rule_key, b.rule_key) ||
      compareStrings(a.context, b.context),
  );
  return results;
}
