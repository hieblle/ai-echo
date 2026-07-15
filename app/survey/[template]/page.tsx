import { notFound, redirect } from "next/navigation";
import { SurveyRunner } from "@/components/survey/survey-runner";
import { parseIsoWeek } from "@/lib/domain/isoWeek";
import { KNOWLEDGE_TIPS } from "@/lib/seed/tips";
import { getSurveySession, isTemplateKey } from "@/lib/server/survey-service";

// The store is stateful and per-respondent — never cache this route.
export const dynamic = "force-dynamic";

interface SurveyPageProps {
  params: Promise<{ template: string }>;
  searchParams: Promise<{ persona?: string }>;
}

export default async function SurveyPage({
  params,
  searchParams,
}: SurveyPageProps) {
  const { template } = await params;
  const { persona: personaId } = await searchParams;

  if (!isTemplateKey(template)) notFound();
  if (!personaId) redirect("/demo");

  let session;
  try {
    session = await getSurveySession(template, personaId, new Date());
  } catch {
    // Unknown persona or role mismatch — back to the switcher.
    redirect("/demo");
  }

  // Wissens-Tipp der Woche: deterministic per ISO week (SPEC.md §8 F3).
  const { week } = parseIsoWeek(session.isoWeek);
  const tip = KNOWLEDGE_TIPS[week % KNOWLEDGE_TIPS.length];
  const tipText =
    session.org.form_of_address === "sie" ? tip?.text_sie : tip?.text;

  return (
    <SurveyRunner
      template={template}
      personaId={personaId}
      form={session.org.form_of_address}
      questions={session.questions}
      toolChoices={session.toolChoices}
      tip={tipText ?? ""}
      showPrivacyNotice={!session.profile.onboarding_completed}
    />
  );
}
