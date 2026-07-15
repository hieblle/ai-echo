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
  toolCatalogFromPool,
} from "@/lib/domain/conditional";
import { getIsoWeek, previousIsoWeek } from "@/lib/domain/isoWeek";
import {
  personalizeWeeklyDraw,
  pickMonthlyQuestions,
  pickWeeklyQuestions,
} from "@/lib/domain/rotation";
import { DEMO_ORG_ID } from "@/lib/seed/demo-org";
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
    completed_cycles: [],
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

/** Calendar month key for the monthly cycle, e.g. "2026-07" (UTC-based). */
export function getMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Build the survey session for a persona: load/bootstrap the profile, apply
 * rotation (weekly/monthly) and conditional logic, resolve tool rows.
 */
export async function getSurveySession(
  template: TemplateKey,
  personaId: string,
  now: Date,
): Promise<SurveySession> {
  const store = await getStore();

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
  // Data access stays behind the Store interface (CLAUDE.md rule 2): the tool
  // catalog is derived from the stored O2 question, not from seed imports.
  const toolCatalog = toolCatalogFromPool(
    await store.listQuestions("onboarding"),
  );

  let questions: Question[];
  if (template === "weekly") {
    if (profile.uses_no_tools) {
      // Non-users get the fixed short pulse — they are a signal, too (SPEC §9).
      questions = shortWeeklyVariant(pool);
    } else {
      // Excluding last week's org draw makes consecutive draws disjoint, so
      // the per-person no-repeat rule holds structurally (SPEC §9 b).
      const previousDraw = pickWeeklyQuestions({
        pool,
        orgId: org.id,
        isoWeek: previousIsoWeek(isoWeek),
      });
      const draw = pickWeeklyQuestions({
        pool,
        orgId: org.id,
        isoWeek,
        exclude: previousDraw.map((q) => q.code),
      });
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
        toolCatalog,
      });
    }
  } else if (template === "monthly") {
    // 8–12 of the 18 monthly questions: fixed core + monthly rotation
    // (SPEC §4.1/§8; selection documented in DECISIONS.md D1.13).
    const selection = pickMonthlyQuestions({
      pool,
      orgId: org.id,
      month: getMonthKey(now),
    });
    questions = applyConditionalLogic({
      questions: selection,
      profile,
      toolCatalog,
    });
  } else {
    questions = applyConditionalLogic({
      questions: pool,
      profile,
      toolCatalog,
    });
  }

  return {
    org,
    persona,
    profile,
    template,
    isoWeek,
    questions,
    toolChoices: resolveToolChoices(profile, toolCatalog),
  };
}
