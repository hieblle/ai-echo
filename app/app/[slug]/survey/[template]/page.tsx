import { notFound, redirect } from "next/navigation";
import { SurveyRunner } from "@/components/survey/survey-runner";
import { parseIsoWeek } from "@/lib/domain/isoWeek";
import { KNOWLEDGE_TIPS } from "@/lib/seed/tips";
import { getOrgAccess, requireViewer } from "@/lib/server/auth";
import { submitMemberSurveyAction } from "@/lib/server/member-actions";
import {
  getMemberSurveySession,
  SurveyAccessError,
} from "@/lib/server/member-survey-service";
import { isTemplateKey } from "@/lib/server/survey-service";
import type { SurveyPayload } from "@/lib/server/survey-submit";

export const dynamic = "force-dynamic";

interface MemberSurveyPageProps {
  params: Promise<{ slug: string; template: string }>;
}

export default async function MemberSurveyPage({ params }: MemberSurveyPageProps) {
  const { slug, template } = await params;
  const viewer = await requireViewer(`/app/${slug}/survey/${template}`);
  if (!isTemplateKey(template)) notFound();

  const access = await getOrgAccess(viewer, slug);
  if (!access) notFound();
  // Platform admins without a membership must not answer as a respondent.
  if (!access.membership) redirect("/app?denied=member");

  let session;
  try {
    session = await getMemberSurveySession(
      access.store,
      access.org,
      access.membership,
      template,
      new Date(),
    );
  } catch (err) {
    if (err instanceof SurveyAccessError) {
      redirect(`/app?survey=${err.reason}`);
    }
    throw err;
  }

  // Wissens-Tipp der Woche: deterministic per ISO week (SPEC.md §8 F3).
  const { week } = parseIsoWeek(session.isoWeek);
  const tip = KNOWLEDGE_TIPS[week % KNOWLEDGE_TIPS.length];
  const tipText =
    session.org.form_of_address === "sie" ? tip?.text_sie : tip?.text;

  async function submit(payload: SurveyPayload) {
    "use server";
    return submitMemberSurveyAction(slug, payload);
  }

  return (
    <SurveyRunner
      template={template}
      form={session.org.form_of_address}
      questions={session.questions}
      toolChoices={session.toolChoices}
      isoWeek={session.isoWeek}
      kAnonymityMin={session.org.k_anonymity_min}
      tip={tipText ?? ""}
      showPrivacyNotice={!session.profile.onboarding_completed}
      backHref="/app"
      onSubmit={submit}
    />
  );
}
