"use server";

/**
 * Server actions of the product routes (real members).
 * Every action re-verifies the caller and their org access; the store only
 * ever sees the org id of a verified membership (DECISIONS D4.3).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canAdminOrg, getOrgAccess, getViewer } from "./auth";
import { submitMemberSurvey } from "./member-survey-service";
import type { SubmitSurveyResult } from "./survey-submit";

const recommendationStatusSchema = z.object({
  ruleKey: z.string().min(1).max(20),
  context: z.string().max(200),
  status: z.enum(["open", "done", "dismissed"]),
});

/** org_admin marks a recommendation card as done/dismissed (flow F7). */
export async function updateMemberRecommendationStatusAction(
  slug: string,
  input: unknown,
): Promise<void> {
  const parsed = recommendationStatusSchema.safeParse(input);
  if (!parsed.success) return;
  const viewer = await getViewer();
  if (!viewer) return;
  const access = await getOrgAccess(viewer, slug);
  if (!access || !canAdminOrg(access.role)) return;
  const rules = await access.store.listRules();
  if (!rules.some((r) => r.key === parsed.data.ruleKey)) return;
  await access.store.setRecommendationState({
    org_id: access.org.id,
    rule_key: parsed.data.ruleKey,
    context: parsed.data.context,
    status: parsed.data.status,
  });
  revalidatePath(`/app/${slug}/dashboard`);
}

export async function submitMemberSurveyAction(
  slug: string,
  input: unknown,
): Promise<SubmitSurveyResult> {
  const viewer = await getViewer();
  if (!viewer) {
    return { ok: false, error: "Die Anmeldung ist abgelaufen. Bitte neu anmelden." };
  }
  const access = await getOrgAccess(viewer, slug);
  if (!access?.membership) {
    return { ok: false, error: "Kein Zugang zu dieser Organisation." };
  }
  const result = await submitMemberSurvey(
    access.store,
    access.org,
    access.membership,
    input,
    new Date(),
  );
  if (result.ok) revalidatePath("/app");
  return result;
}
