/**
 * Survey flow for real members (Phase 4, server-only).
 *
 * Differences to the demo flow: the respondent is a membership (keyed via
 * HMAC into `respondent_profiles`), pulses are bound to an OPEN survey cycle
 * of the org, the duplicate guard is the `participations` row, and O1 lists
 * the org's real departments. Everything else — rotation, conditional
 * logic, validation, anonymous rows — is shared.
 */

import type { Store } from "@/lib/data/store";
import { getIsoWeek } from "@/lib/domain/isoWeek";
import type {
  Choice,
  Department,
  Membership,
  Organization,
  Question,
  RespondentProfile,
  SurveyCycle,
  TemplateKey,
} from "@/lib/types";
import { roleScopeOf } from "./auth";
import { respondentKeyFor } from "./respondent-key";
import { composeQuestions, getMonthKey, isTemplateKey } from "./survey-service";
import {
  buildResponseRows,
  checkSubmission,
  GENERIC_SUBMIT_ERROR,
  profileAfterSubmit,
  resolveResponseDepartment,
  surveyPayloadSchema,
  type SubmitSurveyResult,
} from "./survey-submit";

export type SurveyAccessReason =
  | "leadership"
  | "onboarding_required"
  | "no_open_cycle";

export class SurveyAccessError extends Error {
  constructor(readonly reason: SurveyAccessReason) {
    super(`survey access: ${reason}`);
  }
}

export const SURVEY_ACCESS_MESSAGES: Record<SurveyAccessReason, string> = {
  leadership: "Die Führungskräfte-Befragung ist nur für Teamleitung und Geschäftsführung.",
  onboarding_required: "Bitte zuerst die Onboarding-Befragung abschließen.",
  no_open_cycle: "Für diese Befragung ist aktuell kein Zyklus geöffnet.",
};

export interface MemberSurveySession {
  org: Organization;
  membership: Membership;
  profile: RespondentProfile;
  template: TemplateKey;
  /** Week of the open cycle (pulses) or the current week (onboarding). */
  isoWeek: string;
  cycle: SurveyCycle | null;
  departments: Department[];
  questions: Question[];
  toolChoices: Choice[];
}

/** Initial profile for a member: department and scope come from the admin. */
export function bootstrapMemberProfile(
  membership: Membership,
  respondentKey: string,
): RespondentProfile {
  return {
    respondent_key: respondentKey,
    org_id: membership.org_id,
    department_id: membership.department_id,
    role_scope: roleScopeOf(membership.role),
    tools_used: [],
    uses_no_tools: true,
    ai_experience: null,
    question_history: null,
    onboarding_completed: false,
    completed_cycles: [],
  };
}

/** Latest open cycle of a template, or null. */
export async function findOpenCycle(
  store: Store,
  orgId: string,
  template: TemplateKey,
): Promise<SurveyCycle | null> {
  const open = await store.listCycles(orgId, {
    status: "open",
    template_key: template,
  });
  return open[open.length - 1] ?? null;
}

export async function getMemberSurveySession(
  store: Store,
  org: Organization,
  membership: Membership,
  template: TemplateKey,
  now: Date,
): Promise<MemberSurveySession> {
  if (template === "leadership" && roleScopeOf(membership.role) !== "lead") {
    throw new SurveyAccessError("leadership");
  }

  const respondentKey = respondentKeyFor(membership.id);
  let profile = await store.getProfile(org.id, respondentKey);
  if (!profile) {
    profile = bootstrapMemberProfile(membership, respondentKey);
    await store.saveProfile(profile);
  }

  let cycle: SurveyCycle | null = null;
  let isoWeek = getIsoWeek(now);
  if (template !== "onboarding") {
    if (!profile.onboarding_completed) {
      throw new SurveyAccessError("onboarding_required");
    }
    cycle = await findOpenCycle(store, org.id, template);
    if (!cycle) throw new SurveyAccessError("no_open_cycle");
    // All members of a cycle answer the cycle's week: same org draw, and the
    // dashboard/report scope rows by that week.
    isoWeek = cycle.week;
  }

  const departments = await store.listDepartments(org.id);
  const composed = await composeQuestions({
    store,
    org,
    profile,
    template,
    isoWeek,
    monthKey: getMonthKey(now),
    respondentKey,
    departments,
  });

  return {
    org,
    membership,
    profile,
    template,
    isoWeek,
    cycle,
    departments,
    ...composed,
  };
}

/** completed_at is rounded to the hour (SPEC §7.1). */
export function roundToHour(date: Date): string {
  return new Date(Math.floor(date.getTime() / 3_600_000) * 3_600_000).toISOString();
}

export async function submitMemberSurvey(
  store: Store,
  org: Organization,
  membership: Membership,
  input: unknown,
  now: Date,
): Promise<SubmitSurveyResult> {
  const parsed = surveyPayloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const { template, answers } = parsed.data;
  if (!isTemplateKey(template)) {
    return { ok: false, error: "Unbekannter Befragungstyp." };
  }

  try {
    let session: MemberSurveySession;
    try {
      session = await getMemberSurveySession(store, org, membership, template, now);
    } catch (err) {
      if (err instanceof SurveyAccessError) {
        return { ok: false, error: SURVEY_ACCESS_MESSAGES[err.reason] };
      }
      throw err;
    }

    // The runner rendered questions for one cycle week; if the cycle closed
    // and a new one opened meanwhile, the answers no longer fit.
    if (parsed.data.isoWeek !== session.isoWeek) {
      return {
        ok: false,
        error:
          "Der Befragungszyklus hat inzwischen gewechselt. Bitte die Befragung neu starten.",
      };
    }

    if (template === "onboarding" && session.profile.onboarding_completed) {
      return {
        ok: false,
        error: "Die Onboarding-Befragung wurde bereits abgeschlossen.",
      };
    }
    if (session.cycle) {
      const mine = await store.listParticipationsByMembership(membership.id);
      const done = mine.some(
        (p) => p.cycle_id === session.cycle?.id && p.status === "completed",
      );
      if (done) {
        return {
          ok: false,
          error: "Diese Befragung wurde in diesem Zyklus bereits abgeschlossen.",
        };
      }
    }

    const problem = checkSubmission(session.questions, session.toolChoices, answers);
    if (problem) return { ok: false, error: problem };

    const departmentId = resolveResponseDepartment(
      template,
      answers,
      session.departments,
      session.profile.department_id,
    );
    const cycleKey = `${template}-${session.isoWeek}`;

    await store.submitResponses(
      buildResponseRows({
        orgId: org.id,
        cycleId: cycleKey,
        week: session.isoWeek,
        roleScope: session.profile.role_scope,
        departmentId,
        questions: session.questions,
        answers,
      }),
    );

    if (session.cycle) {
      // Participation and responses share only the cycle — never a key.
      await store.completeParticipation(
        session.cycle.id,
        membership.id,
        roundToHour(now),
      );
    }

    await store.saveProfile(
      profileAfterSubmit({
        profile: session.profile,
        template,
        answers,
        servedQuestions: session.questions,
        onboardingPool: await store.listQuestions("onboarding"),
        departmentId,
        week: session.isoWeek,
      }),
    );
    return { ok: true };
  } catch (err) {
    console.error("submitMemberSurvey failed:", err);
    return { ok: false, error: GENERIC_SUBMIT_ERROR };
  }
}
