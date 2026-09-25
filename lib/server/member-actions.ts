"use server";

/**
 * Server actions of the product routes (real members).
 * Every action re-verifies the caller and their org access; the store only
 * ever sees the org id of a verified membership (DECISIONS D4.3).
 */

import { revalidatePath } from "next/cache";
import { getOrgAccess, getViewer } from "./auth";
import { submitMemberSurvey } from "./member-survey-service";
import type { SubmitSurveyResult } from "./survey-submit";

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
