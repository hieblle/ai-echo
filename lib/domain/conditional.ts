/**
 * Conditional survey logic (SPEC.md §9 "Conditional Logic").
 *
 * Questions with `condition.requires_tool = true` (e.g. W1.2) only make sense
 * for respondents who picked at least one tool in O2 (`profile.tools_used`).
 * Non-users (`profile.uses_no_tools`) instead receive a fixed short weekly
 * pulse: W1.1 + W4.1 + W4.2 — non-users are an important signal too.
 *
 * Pure domain module: no IO, no framework imports, fully unit-tested
 * (CLAUDE.md architecture rule 1).
 */

import type { Choice, Question, RespondentProfile } from "@/lib/types";

/** Fixed short weekly pulse for respondents without tools (SPEC.md §9). */
export const NON_USER_WEEKLY_CODES: readonly string[] = [
  "W1.1",
  "W4.1",
  "W4.2",
];

/**
 * Picks the short weekly pulse variant (exactly `NON_USER_WEEKLY_CODES`, in
 * that order) from the full weekly pool.
 *
 * @throws Error when one of the required codes is missing from the pool.
 */
export function shortWeeklyVariant(pool: Question[]): Question[] {
  return NON_USER_WEEKLY_CODES.map((code) => {
    const question = pool.find((q) => q.code === code);
    if (!question) {
      throw new Error(
        `shortWeeklyVariant: required question "${code}" is missing from the weekly pool`,
      );
    }
    return question;
  });
}

/**
 * Derives the tool catalog from the onboarding questions: the O2 choices
 * minus the non-tool options ("Aktuell keine" is exclusive, "Andere" carries
 * free text). Deriving instead of importing the seed keeps all data access
 * behind the Store interface (CLAUDE.md rule 2) — the catalog follows
 * whatever question set the store serves.
 *
 * @throws Error when O2 is missing or has no choices.
 */
export function toolCatalogFromPool(onboardingPool: Question[]): Choice[] {
  const o2 = onboardingPool.find((q) => q.code === "O2");
  if (!o2 || o2.options?.kind !== "choices") {
    throw new Error(
      "toolCatalogFromPool: onboarding question O2 with choices is required",
    );
  }
  return o2.options.choices.filter((c) => !c.exclusive && !c.allows_text);
}

/**
 * Narrows the org's tool catalog to the tools the respondent actually uses
 * (O2 → `profile.tools_used`).
 *
 * Returns the catalog entries whose `value` is contained in
 * `profile.tools_used`, preserving catalog order (set intersection). Unknown
 * values in `tools_used` that have no catalog entry are ignored.
 */
export function resolveToolChoices(
  profile: RespondentProfile,
  toolCatalog: Choice[],
): Choice[] {
  const used = new Set(profile.tools_used);
  return toolCatalog.filter((choice) => used.has(choice.value));
}

/**
 * Applies conditional display logic (SPEC.md §9) to a list of questions.
 *
 * Per question:
 * - `condition.requires_tool` is true and the respondent has no matching
 *   tools in the catalog → the question is DROPPED.
 * - `condition.requires_tool` is true, matching tools exist and
 *   `options.kind === "choices"` → a CLONE of the question is returned with
 *   `options.choices` replaced by the resolved tool choices.
 * - `condition.requires_tool` is true and the question is a `tool_matrix` →
 *   it passes through unchanged; its rows are resolved at render time via
 *   `resolveToolChoices()`.
 * - Questions without `requires_tool` pass through untouched.
 *
 * Inputs are never mutated; cloned questions are new objects.
 *
 * NOTE: this function does NOT implement the short-variant switch for
 * non-users. The caller (service layer) must use `shortWeeklyVariant()`
 * instead when `profile.uses_no_tools` is true.
 */
export function applyConditionalLogic(args: {
  questions: Question[];
  profile: RespondentProfile;
  toolCatalog: Choice[];
}): Question[] {
  const { questions, profile, toolCatalog } = args;
  const result: Question[] = [];

  for (const question of questions) {
    if (question.condition?.requires_tool !== true) {
      result.push(question);
      continue;
    }

    const toolChoices = resolveToolChoices(profile, toolCatalog);
    if (toolChoices.length === 0) {
      // No matching tools → the question makes no sense for this respondent.
      continue;
    }

    if (question.options?.kind === "choices") {
      result.push({
        ...question,
        options: { ...question.options, choices: toolChoices },
      });
    } else {
      // tool_matrix (and any other non-choices question) passes through;
      // its rows come from resolveToolChoices() at render time.
      result.push(question);
    }
  }

  return result;
}
