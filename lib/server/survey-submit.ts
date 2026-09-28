/**
 * Shared submission rules for both survey flows (demo personas and real
 * members). Server-only.
 *
 * The server re-derives the exact question set for the respondent and
 * validates every answer against the served questions — the client is never
 * trusted for org, department, role scope or question selection (SPEC §5).
 */

import { z } from "zod";
import { toolCatalogFromPool } from "@/lib/domain/conditional";
import type {
  AnswerValue,
  Choice,
  Department,
  NewSurveyResponse,
  Question,
  RespondentProfile,
  RoleScope,
  TemplateKey,
} from "@/lib/types";

export const answerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("choice"),
    value: z.string().min(1),
    // Empty/whitespace inline text would pollute free-text aggregation —
    // the client never sends it, so reject it here.
    text: z.string().trim().min(1).max(500).optional(),
    scale: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal("choices"),
    values: z.array(z.string().min(1)).min(1).max(20),
    other_text: z.string().trim().min(1).max(500).optional(),
  }),
  z.object({ kind: z.literal("scale"), value: z.number().int() }),
  z.object({ kind: z.literal("number"), value: z.number().finite() }),
  z.object({
    kind: z.literal("text"),
    value: z.string().trim().min(1).max(2000),
  }),
  z.object({
    kind: z.literal("tool_matrix"),
    tools: z
      .array(
        z.object({
          tool: z.string().min(1),
          usefulness: z.number().int().min(1).max(10),
          // Range 0..500 is validated in validateAnswer so violations
          // surface with the question code instead of a generic error.
          uses_per_week: z.number().finite().min(0),
        }),
      )
      .min(1)
      .max(20),
  }),
]);

export const submittedAnswersSchema = z
  .array(z.object({ question_code: z.string().min(1), answer: answerSchema }))
  .min(1)
  .max(50);

export type SubmittedAnswer = z.infer<typeof submittedAnswersSchema>[number];

/** What the runner sends; flows add their own respondent reference. */
export const surveyPayloadSchema = z.object({
  template: z.string(),
  /** ISO week the questions were rendered for — guards week/cycle rollover. */
  isoWeek: z.string().regex(/^\d{4}-W\d{2}$/),
  answers: submittedAnswersSchema,
});

export type SurveyPayload = z.infer<typeof surveyPayloadSchema>;

export type SubmitSurveyResult = { ok: true } | { ok: false; error: string };

export const GENERIC_SUBMIT_ERROR =
  "Es ist ein Fehler aufgetreten. Bitte die Seite neu laden und erneut versuchen.";

function scaleRange(q: Question): { min: number; max: number } {
  if (q.options?.kind === "scale") {
    return { min: q.options.min, max: q.options.max };
  }
  switch (q.type) {
    case "scale_0_10":
      return { min: 0, max: 10 };
    case "scale_minus5_plus5":
      return { min: -5, max: 5 };
    default:
      return { min: 1, max: 10 };
  }
}

/** Validate one answer against the served question; returns an error or null. */
export function validateAnswer(
  q: Question,
  answer: AnswerValue,
  toolChoices: Choice[],
): string | null {
  const fail = (msg: string) => `${q.code}: ${msg}`;

  switch (q.type) {
    case "single_choice": {
      if (answer.kind !== "choice") return fail("expected a choice answer");
      if (q.options?.kind !== "choices") return fail("question has no choices");
      const choice = q.options.choices.find((c) => c.value === answer.value);
      if (!choice) return fail(`invalid choice value "${answer.value}"`);
      if (answer.text !== undefined && !choice.allows_text) {
        return fail("text not allowed for this choice");
      }
      const followup = q.options.followup_scale;
      if (followup && answer.value === followup.on_value) {
        if (
          answer.scale === undefined ||
          answer.scale < 1 ||
          answer.scale > 10
        ) {
          return fail("follow-up scale (1–10) required");
        }
      } else if (answer.scale !== undefined) {
        return fail("unexpected follow-up scale");
      }
      return null;
    }
    case "multi_choice": {
      if (answer.kind !== "choices") return fail("expected a multi-choice answer");
      if (q.options?.kind !== "choices") return fail("question has no choices");
      const byValue = new Map(q.options.choices.map((c) => [c.value, c]));
      if (new Set(answer.values).size !== answer.values.length) {
        return fail("duplicate values");
      }
      for (const v of answer.values) {
        if (!byValue.has(v)) return fail(`invalid choice value "${v}"`);
      }
      const exclusives = answer.values.filter((v) => byValue.get(v)?.exclusive);
      if (exclusives.length > 0 && answer.values.length > 1) {
        return fail("exclusive option cannot be combined");
      }
      if (
        answer.other_text !== undefined &&
        !answer.values.some((v) => byValue.get(v)?.allows_text)
      ) {
        return fail("text not allowed without a text-bearing choice");
      }
      return null;
    }
    case "scale_1_10":
    case "scale_0_10":
    case "scale_minus5_plus5": {
      if (answer.kind !== "scale") return fail("expected a scale answer");
      const { min, max } = scaleRange(q);
      if (answer.value < min || answer.value > max) {
        return fail(`scale out of range ${min}..${max}`);
      }
      return null;
    }
    case "number":
    case "currency": {
      if (answer.kind !== "number") return fail("expected a number answer");
      const min = q.options?.kind === "number" ? (q.options.min ?? 0) : 0;
      if (answer.value < min) return fail(`must be >= ${min}`);
      if (answer.value > 1_000_000) return fail("implausibly large value");
      return null;
    }
    case "text_optional": {
      if (answer.kind !== "text") return fail("expected a text answer");
      if (answer.value.trim().length === 0) return fail("empty text");
      return null;
    }
    case "tool_matrix": {
      if (answer.kind !== "tool_matrix") return fail("expected a tool matrix");
      const allowed = new Set(toolChoices.map((c) => c.value));
      const seen = new Set<string>();
      for (const row of answer.tools) {
        if (!allowed.has(row.tool)) return fail(`unknown tool "${row.tool}"`);
        if (seen.has(row.tool)) return fail(`duplicate tool "${row.tool}"`);
        if (row.uses_per_week > 500) return fail("uses per week out of range");
        seen.add(row.tool);
      }
      // All-or-nothing also holds inside the matrix: every tool the
      // respondent uses must be rated (mirrors the client's completeness rule).
      if (answer.tools.length !== toolChoices.length) {
        return fail("all tools must be rated");
      }
      return null;
    }
  }
}

/**
 * Cross-check a submission against the served question set: no unknown or
 * duplicate codes, everything but skippable free text answered, every answer
 * valid. Returns a German error message or null.
 */
export function checkSubmission(
  questions: Question[],
  toolChoices: Choice[],
  answers: SubmittedAnswer[],
): string | null {
  const served = new Map(questions.map((q) => [q.code, q]));

  const submittedCodes = new Set<string>();
  for (const { question_code } of answers) {
    if (!served.has(question_code)) {
      return `Frage ${question_code} wurde nicht gestellt.`;
    }
    if (submittedCodes.has(question_code)) {
      return `Frage ${question_code} doppelt beantwortet.`;
    }
    submittedCodes.add(question_code);
  }

  // Completeness: everything except skippable free text must be answered
  // ("ganz oder gar nicht", SPEC.md §9).
  for (const q of questions) {
    if (q.type !== "text_optional" && !submittedCodes.has(q.code)) {
      return `Frage ${q.code} fehlt.`;
    }
  }

  for (const { question_code, answer } of answers) {
    const q = served.get(question_code);
    if (!q) continue; // unreachable — checked above
    const error = validateAnswer(q, answer, toolChoices);
    if (error) return `Ungültige Antwort (${error}).`;
  }
  return null;
}

/**
 * The onboarding baseline belongs to the department chosen in O1 (when it
 * names one of the org's departments), otherwise to the profile's.
 */
export function resolveResponseDepartment(
  template: TemplateKey,
  answers: SubmittedAnswer[],
  departments: Department[],
  fallback: string | null,
): string | null {
  if (template !== "onboarding") return fallback;
  const o1 = answers.find((a) => a.question_code === "O1")?.answer;
  if (o1?.kind === "choice" && departments.some((d) => d.id === o1.value)) {
    return o1.value;
  }
  return fallback;
}

export interface BuildRowsInput {
  orgId: string;
  /** Logical cycle key, e.g. "weekly-2026-W29". */
  cycleId: string;
  week: string;
  roleScope: RoleScope;
  departmentId: string | null;
  questions: Question[];
  answers: SubmittedAnswer[];
}

/** Anonymous rows: no respondent reference; free text without department. */
export function buildResponseRows(input: BuildRowsInput): NewSurveyResponse[] {
  const served = new Map(input.questions.map((q) => [q.code, q]));
  return input.answers.map(({ question_code, answer }) => {
    // Free texts are only ever shown org-wide without department (SPEC §7.3)
    // — don't store a department on them in the first place.
    const isFreeText = served.get(question_code)?.type === "text_optional";
    return {
      org_id: input.orgId,
      cycle_id: input.cycleId,
      department_id: isFreeText ? null : input.departmentId,
      role_scope: input.roleScope,
      question_code,
      answer,
      created_week: input.week,
    };
  });
}

export interface ProfileUpdateInput {
  profile: RespondentProfile;
  template: TemplateKey;
  answers: SubmittedAnswer[];
  servedQuestions: Question[];
  /** Onboarding pool, to resolve the tool catalog for O2 (CLAUDE.md rule 2). */
  onboardingPool: Question[];
  departmentId: string | null;
  week: string;
  /** Logical cycle key to remember (demo duplicate guard); omit for members. */
  cycleKey?: string;
}

/** The profile after a successful submission (travels separately from rows). */
export function profileAfterSubmit(input: ProfileUpdateInput): RespondentProfile {
  const { profile: previous, template, answers } = input;
  const profile: RespondentProfile = { ...previous };
  if (input.cycleKey) {
    profile.completed_cycles = [
      ...(previous.completed_cycles ?? []),
      input.cycleKey,
    ];
  }
  if (template === "onboarding") {
    const o2 = answers.find((a) => a.question_code === "O2")?.answer;
    const o3 = answers.find((a) => a.question_code === "O3")?.answer;
    profile.department_id = input.departmentId;
    if (o2?.kind === "choices") {
      // Only catalog tools carry labels for W1.2/M2.1; "other"/"none" are
      // not usable as tool rows and are dropped from the profile.
      const catalog = toolCatalogFromPool(input.onboardingPool);
      const catalogValues = new Set(catalog.map((c) => c.value));
      const cleaned = o2.values.includes("none")
        ? []
        : o2.values.filter((v) => catalogValues.has(v));
      profile.tools_used = cleaned;
      profile.uses_no_tools = cleaned.length === 0;
    }
    if (o3?.kind === "choice") {
      profile.ai_experience = o3.value;
    }
    profile.onboarding_completed = true;
  }
  if (template === "weekly") {
    profile.question_history = {
      week: input.week,
      codes: input.servedQuestions.map((q) => q.code),
    };
  }
  return profile;
}
