"use server";

/**
 * Server actions for the survey prototype.
 *
 * All inputs are Zod-validated (SPEC.md §5). The server re-derives the exact
 * question set for the respondent (deterministic rotation + conditional
 * logic) and validates every answer against the served questions — the client
 * is never trusted for org, department, role scope or question selection.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getIsoWeek } from "@/lib/domain/isoWeek";
import { DEMO_ORG_ID } from "@/lib/seed/demo-org";
import { TOOL_CATALOG } from "@/lib/seed/questions";
import { getSurveySession, isTemplateKey } from "@/lib/server/survey-service";
import { getStore } from "@/lib/server/store-instance";
import type {
  AnswerValue,
  Choice,
  NewSurveyResponse,
  Question,
} from "@/lib/types";

const answerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("choice"),
    value: z.string().min(1),
    text: z.string().max(500).optional(),
    scale: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal("choices"),
    values: z.array(z.string().min(1)).min(1).max(20),
    other_text: z.string().max(500).optional(),
  }),
  z.object({ kind: z.literal("scale"), value: z.number().int() }),
  z.object({ kind: z.literal("number"), value: z.number().finite() }),
  z.object({ kind: z.literal("text"), value: z.string().min(1).max(2000) }),
  z.object({
    kind: z.literal("tool_matrix"),
    tools: z
      .array(
        z.object({
          tool: z.string().min(1),
          usefulness: z.number().int().min(1).max(10),
          uses_per_week: z.number().finite().min(0).max(500),
        }),
      )
      .min(1)
      .max(20),
  }),
]);

const payloadSchema = z.object({
  template: z.string(),
  personaId: z.string().min(1),
  answers: z
    .array(z.object({ question_code: z.string().min(1), answer: answerSchema }))
    .min(1)
    .max(50),
});

export type SubmitSurveyResult = { ok: true } | { ok: false; error: string };

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
function validateAnswer(
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
        seen.add(row.tool);
      }
      return null;
    }
  }
}

export async function submitSurvey(input: unknown): Promise<SubmitSurveyResult> {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Ungültige Eingabe." };
  }
  const { template, personaId, answers } = parsed.data;
  if (!isTemplateKey(template)) {
    return { ok: false, error: "Unbekannter Befragungstyp." };
  }

  try {
    const now = new Date();
    const session = await getSurveySession(template, personaId, now);
    const served = new Map(session.questions.map((q) => [q.code, q]));

    // No unknown and no duplicate question codes.
    const submittedCodes = new Set<string>();
    for (const { question_code } of answers) {
      if (!served.has(question_code)) {
        return { ok: false, error: `Frage ${question_code} wurde nicht gestellt.` };
      }
      if (submittedCodes.has(question_code)) {
        return { ok: false, error: `Frage ${question_code} doppelt beantwortet.` };
      }
      submittedCodes.add(question_code);
    }

    // Completeness: everything except skippable free text must be answered
    // ("ganz oder gar nicht", SPEC.md §9).
    for (const q of session.questions) {
      if (q.type !== "text_optional" && !submittedCodes.has(q.code)) {
        return { ok: false, error: `Frage ${q.code} fehlt.` };
      }
    }

    for (const { question_code, answer } of answers) {
      const q = served.get(question_code);
      if (!q) continue; // unreachable — checked above
      const error = validateAnswer(q, answer, session.toolChoices);
      if (error) return { ok: false, error: `Ungültige Antwort (${error}).` };
    }

    const isoWeek = getIsoWeek(now);
    const rows: NewSurveyResponse[] = answers.map(({ question_code, answer }) => ({
      org_id: session.org.id,
      cycle_id: `${template}-${isoWeek}`,
      department_id: session.profile.department_id,
      role_scope: session.profile.role_scope,
      question_code,
      answer,
      created_week: isoWeek,
    }));

    const store = getStore();
    await store.submitResponses(rows);

    // Profile updates travel separately from responses (anonymity, SPEC.md §7).
    const profile = { ...session.profile };
    if (template === "onboarding") {
      const o1 = answers.find((a) => a.question_code === "O1")?.answer;
      const o2 = answers.find((a) => a.question_code === "O2")?.answer;
      const o3 = answers.find((a) => a.question_code === "O3")?.answer;
      if (o1?.kind === "choice") {
        const departments = await store.listDepartments(session.org.id);
        if (departments.some((d) => d.id === o1.value)) {
          profile.department_id = o1.value;
        }
      }
      if (o2?.kind === "choices") {
        // Only catalog tools carry labels for W1.2/M2.1; "other"/"none" are
        // not usable as tool rows and are dropped from the profile.
        const catalogValues = new Set(TOOL_CATALOG.map((c) => c.value));
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
        week: isoWeek,
        codes: session.questions.map((q) => q.code),
      };
    }
    await store.saveProfile(profile);

    revalidatePath("/demo");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return { ok: false, error: message };
  }
}

/** Demo-only Du/Sie toggle (SPEC.md §14 org setting). */
export async function setDemoFormOfAddress(form: "du" | "sie"): Promise<void> {
  const store = getStore();
  await store.setFormOfAddress(DEMO_ORG_ID, form);
  revalidatePath("/", "layout");
}
