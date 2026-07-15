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
import { toolCatalogFromPool } from "@/lib/domain/conditional";
import { getIsoWeek, nextIsoWeek } from "@/lib/domain/isoWeek";
import { generateOrgWeek } from "@/lib/seed/demo-data";
import { DEMO_ORG_ID } from "@/lib/seed/demo-org";
import { DEMO_ORG_HEADCOUNTS } from "@/lib/seed/orgs-demo";
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
    // Empty/whitespace inline text would pollute Phase-2 free-text
    // aggregation — the client never sends it, so reject it here.
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

const payloadSchema = z.object({
  template: z.string(),
  personaId: z.string().min(1),
  /** ISO week the questions were rendered for — guards week rollover. */
  isoWeek: z.string().regex(/^\d{4}-W\d{2}$/),
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
    const isoWeek = getIsoWeek(now);

    // The question set is re-derived per week — a pulse rendered before a
    // week rollover must not be stored under the new week's cycle.
    if (parsed.data.isoWeek !== isoWeek) {
      return {
        ok: false,
        error:
          "Die Kalenderwoche hat inzwischen gewechselt. Bitte die Befragung neu starten.",
      };
    }

    const session = await getSurveySession(template, personaId, now);
    const cycleId = `${template}-${isoWeek}`;

    // Duplicate-submission guard ("ganz oder gar nicht" also means "einmal"):
    // Phase 4 replaces this with participations.status = 'completed'.
    if (template === "onboarding" && session.profile.onboarding_completed) {
      return {
        ok: false,
        error: "Die Onboarding-Befragung wurde bereits abgeschlossen.",
      };
    }
    if ((session.profile.completed_cycles ?? []).includes(cycleId)) {
      return {
        ok: false,
        error: "Diese Befragung wurde in diesem Zyklus bereits abgeschlossen.",
      };
    }

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

    const store = await getStore();

    // The onboarding baseline belongs to the department chosen in O1, not to
    // the persona's pre-onboarding default — resolve it BEFORE writing rows.
    let responseDepartment = session.profile.department_id;
    if (template === "onboarding") {
      const o1 = answers.find((a) => a.question_code === "O1")?.answer;
      if (o1?.kind === "choice") {
        const departments = await store.listDepartments(session.org.id);
        if (departments.some((d) => d.id === o1.value)) {
          responseDepartment = o1.value;
        }
      }
    }

    const rows: NewSurveyResponse[] = answers.map(({ question_code, answer }) => {
      const q = served.get(question_code);
      // Free texts are only ever shown org-wide without department (SPEC §7.3)
      // — don't store a department on them in the first place.
      const isFreeText = q?.type === "text_optional";
      return {
        org_id: session.org.id,
        cycle_id: cycleId,
        department_id: isFreeText ? null : responseDepartment,
        role_scope: session.profile.role_scope,
        question_code,
        answer,
        created_week: isoWeek,
      };
    });

    await store.submitResponses(rows);

    // Profile updates travel separately from responses (anonymity, SPEC.md §7).
    const profile = { ...session.profile };
    profile.completed_cycles = [
      ...(session.profile.completed_cycles ?? []),
      cycleId,
    ];
    if (template === "onboarding") {
      const o2 = answers.find((a) => a.question_code === "O2")?.answer;
      const o3 = answers.find((a) => a.question_code === "O3")?.answer;
      profile.department_id = responseDepartment;
      if (o2?.kind === "choices") {
        // Only catalog tools carry labels for W1.2/M2.1; "other"/"none" are
        // not usable as tool rows and are dropped from the profile.
        const catalog = toolCatalogFromPool(
          await store.listQuestions("onboarding"),
        );
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
        week: isoWeek,
        codes: session.questions.map((q) => q.code),
      };
    }
    await store.saveProfile(profile);

    revalidatePath("/demo");
    return { ok: true };
  } catch (err) {
    // Never surface raw internals (English messages, reflected input) in the
    // German UI — log server-side, answer generically.
    console.error("submitSurvey failed:", err);
    return {
      ok: false,
      error:
        "Es ist ein Fehler aufgetreten. Bitte die Seite neu laden und erneut versuchen.",
    };
  }
}

/**
 * Demo control (SPEC §13 Phase 2): generate the next data week for every
 * generated demo org, continuing the deterministic cadence (weekly always,
 * monthly + leadership every 4th week).
 */
export async function simulateWeek(): Promise<void> {
  const store = await getStore();
  for (const org of await store.listOrganizations()) {
    const headcounts = DEMO_ORG_HEADCOUNTS[org.id];
    if (!headcounts) continue; // orgs without generator profile (Musterwerk)

    const stats = await store.listParticipationStats(org.id);
    const weeks = [
      ...new Set(
        stats.filter((s) => s.template_key === "weekly").map((s) => s.week),
      ),
    ].sort();
    const latest = weeks[weeks.length - 1];
    if (!latest) continue;

    const allWeeks = [...weeks, nextIsoWeek(latest)];
    const { responses, participation } = generateOrgWeek({
      org,
      departments: await store.listDepartments(org.id),
      headcounts,
      toolSettings: await store.listToolSettings(org.id),
      weeks: allWeeks,
      weekIndex: allWeeks.length - 1,
    });
    await store.submitResponses(responses);
    await store.addParticipationStats(participation);
  }
  revalidatePath("/dashboard", "layout");
}

const recommendationStatusSchema = z.object({
  orgId: z.string().min(1),
  ruleKey: z.string().min(1),
  context: z.string().max(200),
  status: z.enum(["open", "done", "dismissed"]),
});

/** org_admin marks a recommendation card as done/dismissed (flow F7). */
export async function updateRecommendationStatus(
  input: unknown,
): Promise<void> {
  const parsed = recommendationStatusSchema.safeParse(input);
  if (!parsed.success) return;
  const store = await getStore();
  await store.setRecommendationState({
    org_id: parsed.data.orgId,
    rule_key: parsed.data.ruleKey,
    context: parsed.data.context,
    status: parsed.data.status,
  });
  revalidatePath("/dashboard", "layout");
}

/** Demo-only Du/Sie toggle (SPEC.md §14 org setting). */
export async function setDemoFormOfAddress(form: unknown): Promise<void> {
  // Server actions are public endpoints — validate even the demo toggle.
  const parsed = z.enum(["du", "sie"]).safeParse(form);
  if (!parsed.success) return;
  const store = await getStore();
  await store.setFormOfAddress(DEMO_ORG_ID, parsed.data);
  revalidatePath("/", "layout");
}
