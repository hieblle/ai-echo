/**
 * Weekly question rotation (SPEC.md §9 "Rotation (weekly)").
 *
 * Pure domain logic (CLAUDE.md architecture rule 1): no IO, no framework
 * imports, no Math.random, no Date.now — all randomness comes from a PRNG
 * seeded with the caller-supplied identifiers, so every draw is fully
 * deterministic and reproducible.
 *
 * The rotation happens in two steps:
 *
 *   1. `pickWeeklyQuestions` — the org-level draw: per org and ISO week,
 *      3–5 questions from the weekly pool; with 4+ questions at least one
 *      per dimension in `WEEKLY_DIMENSIONS` (constraint a).
 *   2. `personalizeWeeklyDraw` — the per-person no-repeat rule: any drawn
 *      question the respondent already answered last week (per
 *      `respondent_profiles.question_history`) is individually replaced by a
 *      substitute question of the SAME dimension (constraint b).
 */

import type { Question } from "@/lib/types";
import { WEEKLY_DIMENSIONS } from "@/lib/types";

/** Weekly pulse size bounds (SPEC.md §9: "3–5 Fragen"). */
export const WEEKLY_DRAW_MIN = 3;
export const WEEKLY_DRAW_MAX = 5;
export const WEEKLY_DRAW_DEFAULT = 5;

/**
 * Questions anchored in EVERY weekly draw. W1.1 feeds the lead KPI
 * (Adoption-Rate, SPEC §10: "an allen W1.1-Antworten der Woche") — without a
 * weekly draw the only W1.1 answers come from the non-user short variant,
 * which is structurally biased toward "none". SPEC §9's no-repeat rule and
 * §10's weekly adoption measurement conflict here; resolved in favor of §10
 * (documented in DECISIONS.md D2.10): anchors repeat weekly by design and
 * are exempt from exclusion and personalization.
 */
export const WEEKLY_ANCHOR_CODES: readonly string[] = ["W1.1"];

/** Monthly deep-dive size bounds (SPEC.md §4.1/§8: "8–12 Fragen"). */
export const MONTHLY_DRAW_MIN = 8;
export const MONTHLY_DRAW_MAX = 12;
export const MONTHLY_DRAW_DEFAULT = 10;

/**
 * Monthly questions that must be asked EVERY month: the gap-pair halves
 * (M3.1↔F7, M5.1↔F6 — the Perception Gap needs both sides monthly), the ROI
 * anchors (M1.1, M1.3) and the NPS (M6.1). The remaining slots rotate.
 */
export const MONTHLY_CORE_CODES: readonly string[] = [
  "M1.1",
  "M1.3",
  "M3.1",
  "M5.1",
  "M6.1",
];

// --- Deterministic randomness ---------------------------------------------

/**
 * xmur3 string hash — turns an arbitrary string into a stream of 32-bit
 * seeds. Used only to seed `mulberry32`; not cryptographic (and does not
 * need to be: the draw must be fair-ish and reproducible, nothing more).
 */
function xmur3(input: string): () => number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 PRNG — returns floats in [0, 1), deterministic per seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** PRNG seeded from a string (e.g. `orgId + "|" + isoWeek`). */
function seededRng(seedString: string): () => number {
  return mulberry32(xmur3(seedString)());
}

// --- Helpers ----------------------------------------------------------------

/** Fisher–Yates shuffle of a COPY of `items`; the input is never mutated. */
function shuffledCopy<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = a;
  }
  return copy;
}

/** Stable presentation order: by `sort_order`, ties broken by `code`. */
function sortBySortOrder(questions: Question[]): Question[] {
  return questions.sort(
    (a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code),
  );
}

function clampCount(count: number): number {
  return Math.min(
    WEEKLY_DRAW_MAX,
    Math.max(WEEKLY_DRAW_MIN, Math.trunc(count)),
  );
}

// --- Org-level draw (constraint a) ------------------------------------------

/**
 * Deterministic org-level weekly draw (SPEC.md §9).
 *
 * Same `(pool, orgId, isoWeek, count)` always yields the same result — the
 * PRNG is seeded from `orgId + "|" + isoWeek`, so every respondent of an org
 * sees the same base set in a given week, and re-rendering never reshuffles.
 *
 * - `count` defaults to 5 and is clamped to 3..5.
 * - With `count >= 4`, at least one question per `WEEKLY_DIMENSIONS` entry is
 *   guaranteed; throws when the pool cannot satisfy that.
 * - Throws when the pool has fewer distinct questions than `count`.
 * - `exclude` (typically last week's org draw) removes codes from the pool
 *   BEFORE drawing, which makes consecutive draws disjoint and the per-person
 *   no-repeat rule structurally satisfiable (SPEC.md §9 constraint b). When
 *   the exclusion would make the draw infeasible (tiny pool), it is ignored —
 *   a feasible draw always wins over a strict exclusion.
 * - Result is sorted by `sort_order`. Inputs are never mutated.
 */
export function pickWeeklyQuestions(args: {
  pool: Question[];
  orgId: string;
  isoWeek: string;
  count?: number;
  exclude?: readonly string[];
  /** Codes drawn in EVERY week (default WEEKLY_ANCHOR_CODES semantics are opt-in). */
  anchors?: readonly string[];
}): Question[] {
  const { pool, orgId, isoWeek } = args;
  const count = clampCount(args.count ?? WEEKLY_DRAW_DEFAULT);
  const anchors = args.anchors ?? [];

  const anchorQuestions = anchors.map((code) => {
    const question = pool.find((q) => q.code === code);
    if (!question) {
      throw new Error(
        `Weekly pool is missing anchor question "${code}" (anchors must always be drawable)`,
      );
    }
    return question;
  });

  // Anchors are exempt from exclusion by definition — they repeat weekly.
  const excluded = new Set(args.exclude ?? []);
  for (const code of anchors) excluded.delete(code);

  if (excluded.size > 0) {
    const reduced = pool.filter((q) => !excluded.has(q.code));
    if (isDrawFeasible(reduced, count)) {
      return drawWeekly(reduced, orgId, isoWeek, count, anchorQuestions);
    }
  }
  return drawWeekly(pool, orgId, isoWeek, count, anchorQuestions);
}

/** Whether `pool` can satisfy a weekly draw of `count` (distinct + coverage). */
function isDrawFeasible(pool: Question[], count: number): boolean {
  if (new Set(pool.map((q) => q.code)).size < count) return false;
  if (count >= 4) {
    for (const dimension of WEEKLY_DIMENSIONS) {
      if (!pool.some((q) => q.dimension === dimension)) return false;
    }
  }
  return true;
}

function drawWeekly(
  pool: Question[],
  orgId: string,
  isoWeek: string,
  count: number,
  anchorQuestions: readonly Question[] = [],
): Question[] {
  const rng = seededRng(`${orgId}|${isoWeek}`);
  const shuffled = shuffledCopy(pool, rng);

  const picked: Question[] = [];
  const pickedCodes = new Set<string>();

  // Anchors first: they are part of every draw (see WEEKLY_ANCHOR_CODES)
  // and count toward `count` and the dimension coverage below.
  for (const question of anchorQuestions) {
    if (!pickedCodes.has(question.code)) {
      picked.push(question);
      pickedCodes.add(question.code);
    }
  }

  // First pass: guarantee dimension coverage (constraint a, only for 4+).
  if (count >= 4) {
    for (const dimension of WEEKLY_DIMENSIONS) {
      const question = shuffled.find(
        (q) => q.dimension === dimension && !pickedCodes.has(q.code),
      );
      if (!question) {
        throw new Error(
          `Weekly pool cannot cover dimension "${dimension}" required for a draw of ${count} questions (SPEC.md §9 constraint a)`,
        );
      }
      picked.push(question);
      pickedCodes.add(question.code);
    }
  }

  // Second pass: fill the remaining slots from the rest of the shuffled pool.
  for (const question of shuffled) {
    if (picked.length >= count) break;
    if (!pickedCodes.has(question.code)) {
      picked.push(question);
      pickedCodes.add(question.code);
    }
  }

  if (picked.length < count) {
    throw new Error(
      `Weekly pool has only ${picked.length} distinct questions but ${count} were requested`,
    );
  }

  return sortBySortOrder(picked);
}

// --- Per-person no-repeat rule (constraint b) --------------------------------

/**
 * Applies the per-person no-repeat rule to an org draw (SPEC.md §9).
 *
 * Every drawn question whose code appears in `history` (the codes served to
 * this respondent last week) is replaced by a deterministically chosen
 * substitute from `pool` with the SAME dimension whose code is (i) not in
 * `history` and (ii) not already part of the personalized result. The PRNG is
 * seeded from `respondentKey + "|" + isoWeek`, so a respondent always gets
 * the same substitutes within a week.
 *
 * Substitution has two tiers:
 *   1. a substitute of the SAME dimension (the SPEC's preferred mechanism);
 *   2. when the dimension offers no candidate but stays covered by another
 *      kept question, a substitute of ANY dimension — the no-repeat rule is
 *      absolute in SPEC §9, dimension coverage is the only harder constraint.
 * Only when even that would break dimension coverage is the ORIGINAL question
 * kept: a one-off repeat beats a missing dimension, which would break the
 * KPI aggregation. (With the real 12-question pool — 3 per dimension — and
 * 5-question histories this last resort is unreachable.)
 *
 * Result is sorted by `sort_order`, contains no duplicates, and no input is
 * mutated.
 */
export function personalizeWeeklyDraw(args: {
  draw: Question[];
  pool: Question[];
  history: readonly string[];
  respondentKey: string;
  isoWeek: string;
  /** Codes exempt from the no-repeat rule (weekly anchors, e.g. W1.1). */
  anchors?: readonly string[];
}): Question[] {
  const { draw, pool, history, respondentKey, isoWeek } = args;
  const rng = seededRng(`${respondentKey}|${isoWeek}`);
  const historyCodes = new Set(history);
  for (const code of args.anchors ?? []) historyCodes.delete(code);

  // Codes that are (currently) part of the personalized result. Seeded with
  // the full draw so a substitute can never duplicate a question that is kept.
  const resultCodes = new Set(draw.map((q) => q.code));
  const dimensionByCode = new Map(pool.map((q) => [q.code, q.dimension]));

  // Deterministic candidate order: filter creates a copy, sorting it does
  // not touch `pool`; sorting decouples the choice from the pool's order.
  const sortedCandidates = (predicate: (q: Question) => boolean) =>
    pool
      .filter(
        (q) => !historyCodes.has(q.code) && !resultCodes.has(q.code) && predicate(q),
      )
      .sort(
        (a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code),
      );

  const personalized = draw.map((question) => {
    if (!historyCodes.has(question.code)) return question;

    // Tier 1: same dimension.
    let candidates = sortedCandidates(
      (q) => q.dimension === question.dimension,
    );

    // Tier 2: any dimension — allowed only if the colliding question's
    // dimension remains covered by another question of the result.
    if (candidates.length === 0) {
      const dimensionStillCovered = [...resultCodes].some(
        (code) =>
          code !== question.code &&
          dimensionByCode.get(code) === question.dimension,
      );
      if (dimensionStillCovered) {
        candidates = sortedCandidates(() => true);
      }
    }

    const substitute = candidates[Math.floor(rng() * candidates.length)];
    if (!substitute) return question; // last resort → keep original (see above)

    resultCodes.delete(question.code);
    resultCodes.add(substitute.code);
    return substitute;
  });

  return sortBySortOrder(personalized);
}

// --- Monthly selection --------------------------------------------------------

/**
 * Deterministic monthly deep-dive selection (SPEC.md §4.1/§8: 8–12 questions
 * out of the 18-question monthly catalog).
 *
 * `MONTHLY_CORE_CODES` are always included; the remaining slots are drawn
 * deterministically from the rest of the pool, seeded from
 * `orgId + "|" + month` (calendar month, e.g. "2026-07") — every respondent
 * of an org answers the same monthly set, and the non-core questions rotate
 * month over month.
 *
 * - `count` defaults to 10 and is clamped to 8..12 (and to the pool size).
 * - Throws when a core code is missing from the pool.
 * - Result is sorted by `sort_order`. Inputs are never mutated.
 */
export function pickMonthlyQuestions(args: {
  pool: Question[];
  orgId: string;
  /** Calendar month key, e.g. "2026-07". */
  month: string;
  count?: number;
}): Question[] {
  const { pool, orgId, month } = args;
  const requested = Math.min(
    MONTHLY_DRAW_MAX,
    Math.max(MONTHLY_DRAW_MIN, Math.trunc(args.count ?? MONTHLY_DRAW_DEFAULT)),
  );
  const count = Math.min(requested, new Set(pool.map((q) => q.code)).size);

  const picked: Question[] = [];
  const pickedCodes = new Set<string>();

  for (const code of MONTHLY_CORE_CODES) {
    const question = pool.find((q) => q.code === code);
    if (!question) {
      throw new Error(
        `Monthly pool is missing core question "${code}" (gap pairs / ROI anchors must be asked every month)`,
      );
    }
    picked.push(question);
    pickedCodes.add(code);
  }

  const rng = seededRng(`${orgId}|${month}`);
  const rest = shuffledCopy(
    pool.filter((q) => !pickedCodes.has(q.code)),
    rng,
  );
  for (const question of rest) {
    if (picked.length >= count) break;
    if (!pickedCodes.has(question.code)) {
      picked.push(question);
      pickedCodes.add(question.code);
    }
  }

  return sortBySortOrder(picked);
}
