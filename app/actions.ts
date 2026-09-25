"use server";

/**
 * Server actions for the demo routes (personas, in-memory store).
 *
 * All inputs are Zod-validated (SPEC.md §5). The server re-derives the exact
 * question set for the respondent (deterministic rotation + conditional
 * logic) and validates every answer against the served questions — the client
 * is never trusted for org, department, role scope or question selection.
 * The member flow shares these rules via lib/server/survey-submit.ts.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getIsoWeek, nextIsoWeek } from "@/lib/domain/isoWeek";
import { generateOrgWeek } from "@/lib/seed/demo-data";
import { DEMO_ORG_ID } from "@/lib/seed/demo-org";
import { DEMO_ORG_HEADCOUNTS } from "@/lib/seed/orgs-demo";
import { getSurveySession, isTemplateKey } from "@/lib/server/survey-service";
import {
  buildResponseRows,
  checkSubmission,
  GENERIC_SUBMIT_ERROR,
  profileAfterSubmit,
  resolveResponseDepartment,
  surveyPayloadSchema,
  type SubmitSurveyResult,
} from "@/lib/server/survey-submit";
import { getDemoStore } from "@/lib/server/store-instance";

export type { SubmitSurveyResult } from "@/lib/server/survey-submit";

const payloadSchema = surveyPayloadSchema.extend({
  personaId: z.string().min(1),
});

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
    // the member flow uses participations instead.
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

    const problem = checkSubmission(session.questions, session.toolChoices, answers);
    if (problem) return { ok: false, error: problem };

    const store = await getDemoStore();
    const departments = await store.listDepartments(session.org.id);
    const departmentId = resolveResponseDepartment(
      template,
      answers,
      departments,
      session.profile.department_id,
    );

    await store.submitResponses(
      buildResponseRows({
        orgId: session.org.id,
        cycleId,
        week: isoWeek,
        roleScope: session.profile.role_scope,
        departmentId,
        questions: session.questions,
        answers,
      }),
    );

    // Profile updates travel separately from responses (anonymity, SPEC.md §7).
    await store.saveProfile(
      profileAfterSubmit({
        profile: session.profile,
        template,
        answers,
        servedQuestions: session.questions,
        onboardingPool: await store.listQuestions("onboarding"),
        departmentId,
        week: isoWeek,
        cycleKey: cycleId,
      }),
    );

    revalidatePath("/demo");
    return { ok: true };
  } catch (err) {
    // Never surface raw internals (English messages, reflected input) in the
    // German UI — log server-side, answer generically.
    console.error("submitSurvey failed:", err);
    return { ok: false, error: GENERIC_SUBMIT_ERROR };
  }
}

/**
 * Demo control (SPEC §13 Phase 2): generate the next data week for every
 * generated demo org, continuing the deterministic cadence (weekly always,
 * monthly + leadership every 4th week).
 *
 * Serialized through a globalThis promise chain: overlapping invocations
 * (double-click, two tabs) would otherwise check-then-act on the same latest
 * week and write the week twice — doubling every KPI and, worse, lifting the
 * n < k department above the anonymity threshold via duplicated rows.
 */
const globalForSim = globalThis as unknown as {
  __kiBarometerSimLock?: Promise<void>;
};

export async function simulateWeek(): Promise<void> {
  const previous = globalForSim.__kiBarometerSimLock ?? Promise.resolve();
  const run = previous.then(doSimulateWeek, doSimulateWeek);
  // The lock itself must never stay rejected, or every later click would fail.
  globalForSim.__kiBarometerSimLock = run.then(
    () => undefined,
    () => undefined,
  );
  try {
    await run;
  } catch (err) {
    console.error("simulateWeek failed:", err);
  }
  revalidatePath("/dashboard", "layout");
}

async function doSimulateWeek(): Promise<void> {
  const store = await getDemoStore();
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
}

const recommendationStatusSchema = z.object({
  orgId: z.string().min(1).max(100),
  ruleKey: z.string().min(1).max(20),
  context: z.string().max(200),
  status: z.enum(["open", "done", "dismissed"]),
});

/** org_admin marks a recommendation card as done/dismissed (flow F7, demo). */
export async function updateRecommendationStatus(
  input: unknown,
): Promise<void> {
  const parsed = recommendationStatusSchema.safeParse(input);
  if (!parsed.success) return;
  const store = await getDemoStore();
  // Server actions are public endpoints: verify org and rule instead of
  // letting the store throw (would 500) or the state map grow unboundedly.
  if (!(await store.getOrganization(parsed.data.orgId))) return;
  const rules = await store.listRules();
  if (!rules.some((r) => r.key === parsed.data.ruleKey)) return;
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
  const store = await getDemoStore();
  await store.setFormOfAddress(DEMO_ORG_ID, parsed.data);
  revalidatePath("/", "layout");
}
