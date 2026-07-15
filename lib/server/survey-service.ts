/**
 * Survey composition service (server-only).
 *
 * Composes the pure domain layer (rotation, conditional logic) with the store.
 * This is the ONLY place that decides which questions a respondent sees —
 * the client never assembles question sets (SPEC.md §5 server-first).
 */

import {
  applyConditionalLogic,
  resolveToolChoices,
  shortWeeklyVariant,
} from "@/lib/domain/conditional";
import { getIsoWeek } from "@/lib/domain/isoWeek";
import {
  personalizeWeeklyDraw,
  pickWeeklyQuestions,
} from "@/lib/domain/rotation";
import { DEMO_ORG_ID } from "@/lib/seed/demo-org";
import { QUESTIONS, TOOL_CATALOG } from "@/lib/seed/questions";
import type {
  Choice,
  DemoPersona,
  Organization,
  Question,
  RespondentProfile,
  TemplateKey,
} from "@/lib/types";
import { getStore } from "./store-instance";

export interface SurveySession {
  org: Organization;
  persona: DemoPersona;
  profile: RespondentProfile;
  template: TemplateKey;
  isoWeek: string;
  /** The exact questions this respondent gets, in order. */
  questions: Question[];
  /** Resolved tool rows for tool_matrix questions (empty when none). */
  toolChoices: Choice[];
}

/** Initial profile from persona defaults, so all flows are playable at once. */
export function bootstrapProfile(persona: DemoPersona): RespondentProfile {
  return {
    respondent_key: persona.id,
    org_id: persona.org_id,
    department_id: persona.department_id,
    role_scope: persona.role_scope,
    tools_used: [...persona.default_tools],
    uses_no_tools: persona.default_tools.length === 0,
    ai_experience: null,
    question_history: null,
    onboarding_completed: false,
  };
}

export const TEMPLATE_KEYS: readonly TemplateKey[] = [
  "onboarding",
  "weekly",
  "monthly",
  "leadership",
];

export function isTemplateKey(value: string): value is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(value);
}

/**
 * Build the survey session for a persona: load/bootstrap the profile, apply
 * rotation (weekly) and conditional logic, resolve tool rows.
 */
export async function getSurveySession(
  template: TemplateKey,
  personaId: string,
  now: Date,
): Promise<SurveySession> {
  const store = getStore();

  const org = await store.getOrganization(DEMO_ORG_ID);
  if (!org) throw new Error("demo organization missing");

  const personas = await store.listPersonas(DEMO_ORG_ID);
  const persona = personas.find((p) => p.id === personaId);
  if (!persona) throw new Error(`unknown persona: ${personaId}`);

  if (template === "leadership" && persona.role_scope !== "lead") {
    throw new Error("leadership survey requires a lead role");
  }

  let profile = await store.getProfile(DEMO_ORG_ID, personaId);
  if (!profile) {
    profile = bootstrapProfile(persona);
    await store.saveProfile(profile);
  }

  const isoWeek = getIsoWeek(now);
  const pool = await store.listQuestions(template);

  let questions: Question[];
  if (template === "weekly") {
    if (profile.uses_no_tools) {
      // Non-users get the fixed short pulse — they are a signal, too (SPEC §9).
      questions = shortWeeklyVariant(pool);
    } else {
      const draw = pickWeeklyQuestions({ pool, orgId: org.id, isoWeek });
      // Only a PREVIOUS week's draw counts as history: re-opening the same
      // week's pulse must yield the same questions, not new substitutes.
      const history =
        profile.question_history && profile.question_history.week !== isoWeek
          ? profile.question_history.codes
          : [];
      const personalized = personalizeWeeklyDraw({
        draw,
        pool,
        history,
        respondentKey: personaId,
        isoWeek,
      });
      questions = applyConditionalLogic({
        questions: personalized,
        profile,
        toolCatalog: TOOL_CATALOG,
      });
    }
  } else {
    questions = applyConditionalLogic({
      questions: pool,
      profile,
      toolCatalog: TOOL_CATALOG,
    });
  }

  return {
    org,
    persona,
    profile,
    template,
    isoWeek,
    questions,
    toolChoices: resolveToolChoices(profile, TOOL_CATALOG),
  };
}

/** Lookup helper for validation: a template's question by code. */
export function questionByCode(
  template: TemplateKey,
  code: string,
): Question | undefined {
  return QUESTIONS.find(
    (q) => q.template_key === template && q.code === code && q.active,
  );
}
