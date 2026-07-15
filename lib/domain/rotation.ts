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
 * - Result is sorted by `sort_order`. Inputs are never mutated.
 */
export function pickWeeklyQuestions(args: {
  pool: Question[];
  orgId: string;
  isoWeek: string;
  count?: number;
}): Question[] {
  const { pool, orgId, isoWeek } = args;
  const count = clampCount(args.count ?? WEEKLY_DRAW_DEFAULT);
  const rng = seededRng(`${orgId}|${isoWeek}`);
  const shuffled = shuffledCopy(pool, rng);

  const picked: Question[] = [];
  const pickedCodes = new Set<string>();

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
 * Trade-off: when no such candidate exists (e.g. the whole dimension was
 * already served last week), the ORIGINAL question is kept. Repeating a
 * question once beats shrinking the pulse below 3 questions or losing the
 * dimension coverage the org draw guarantees — a repeat is a UX blemish,
 * a missing dimension breaks the KPI aggregation.
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
}): Question[] {
  const { draw, pool, history, respondentKey, isoWeek } = args;
  const rng = seededRng(`${respondentKey}|${isoWeek}`);
  const historyCodes = new Set(history);

  // Codes that are (currently) part of the personalized result. Seeded with
  // the full draw so a substitute can never duplicate a question that is kept.
  const resultCodes = new Set(draw.map((q) => q.code));

  const personalized = draw.map((question) => {
    if (!historyCodes.has(question.code)) return question;

    // Deterministic candidate order: filter creates a copy, sorting it does
    // not touch `pool`; sorting decouples the choice from the pool's order.
    const candidates = pool
      .filter(
        (q) =>
          q.dimension === question.dimension &&
          !historyCodes.has(q.code) &&
          !resultCodes.has(q.code),
      )
      .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));

    const substitute = candidates[Math.floor(rng() * candidates.length)];
    if (!substitute) return question; // no candidate → keep original (see above)

    resultCodes.delete(question.code);
    resultCodes.add(substitute.code);
    return substitute;
  });

  return sortBySortOrder(personalized);
}
