/**
 * Survey composition service (server-only).
 *
 * Composes the pure domain layer (rotation, conditional logic) with the store.
 * This is the ONLY place that decides which questions a respondent sees —
 * the client never assembles question sets (SPEC.md §5 server-first).
 * `composeQuestions` is shared by the demo flow (personas) and the member
 * flow (lib/server/member-survey-service.ts).
 */

import type { Store } from "@/lib/data/store";
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
  WEEKLY_ANCHOR_CODES,
} from "@/lib/domain/rotation";
import { DEMO_ORG_ID } from "@/lib/seed/demo-org";
import type {
  Choice,
  DemoPersona,
  Department,
  Organization,
  Question,
  RespondentProfile,
  TemplateKey,
} from "@/lib/types";
import { getDemoStore } from "./store-instance";

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

export interface ComposeInput {
  store: Store;
  org: Organization;
  profile: RespondentProfile;
  template: TemplateKey;
  /** Week the cycle belongs to (org draw + no-repeat rule). */
  isoWeek: string;
  /** Month key for the monthly rotation. */
  monthKey: string;
  /** Stable per-respondent key for personalised substitutes. */
  respondentKey: string;
  /**
   * The org's real departments: replaces the generic O1 catalogue so the
   * onboarding answer maps 1:1 to a department id. Demo orgs pass nothing
   * (their department ids equal the seed's O1 values).
   */
  departments?: Department[];
}

export interface ComposedSurvey {
  questions: Question[];
  toolChoices: Choice[];
}

/** Rotation + conditional logic for one respondent (deterministic). */
export async function composeQuestions(
  input: ComposeInput,
): Promise<ComposedSurvey> {
  const { store, org, profile, template, isoWeek } = input;
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
      // W1.1 is anchored in every draw (lead KPI needs weekly data, D2.10);
      // excluding last week's remaining org draw keeps the other questions
      // disjoint, so the no-repeat rule holds structurally (SPEC §9 b).
      const previousDraw = pickWeeklyQuestions({
        pool,
        orgId: org.id,
        isoWeek: previousIsoWeek(isoWeek),
        anchors: WEEKLY_ANCHOR_CODES,
      });
      const draw = pickWeeklyQuestions({
        pool,
        orgId: org.id,
        isoWeek,
        exclude: previousDraw.map((q) => q.code),
        anchors: WEEKLY_ANCHOR_CODES,
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
        respondentKey: input.respondentKey,
        isoWeek,
        anchors: WEEKLY_ANCHOR_CODES,
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
      month: input.monthKey,
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

  if (template === "onboarding" && input.departments) {
    const departments = input.departments;
    questions = questions.map((q) =>
      q.code === "O1"
        ? {
            ...q,
            options: {
              kind: "choices",
              choices: departments.map((d) => ({ value: d.id, label: d.name })),
            },
          }
        : q,
    );
  }

  return {
    questions,
    toolChoices: resolveToolChoices(profile, toolCatalog),
  };
}

/**
 * Build the demo survey session for a persona: load/bootstrap the profile,
 * apply rotation (weekly/monthly) and conditional logic, resolve tool rows.
 */
export async function getSurveySession(
  template: TemplateKey,
  personaId: string,
  now: Date,
): Promise<SurveySession> {
  const store = await getDemoStore();

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
  const composed = await composeQuestions({
    store,
    org,
    profile,
    template,
    isoWeek,
    monthKey: getMonthKey(now),
    respondentKey: personaId,
  });

  return {
    org,
    persona,
    profile,
    template,
    isoWeek,
    ...composed,
  };
}
