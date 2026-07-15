"use client";

/**
 * Mobile-first survey runner: one question per screen, progress bar,
 * skippable free-text, all-or-nothing submit at the end (SPEC.md §9).
 * The weekly pulse must be playable in under 60 seconds.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { submitSurvey } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  QuestionInput,
  isAnswerComplete,
} from "@/components/survey/question-input";
import { questionText } from "@/lib/domain/text";
import type {
  AnswerValue,
  Choice,
  FormOfAddress,
  Question,
  TemplateKey,
} from "@/lib/types";

const TEMPLATE_TITLES: Record<TemplateKey, string> = {
  onboarding: "Onboarding-Befragung",
  weekly: "Wöchentlicher Pulse",
  monthly: "Monatliche Vertiefung",
  leadership: "Führungskräfte-Befragung",
};

/** Privacy notice shown before the first survey (texts from the Notion questionnaire, SPEC.md §7). */
const PRIVACY_POINTS_DU = [
  "Deine Antworten werden anonym ausgewertet.",
  "Auswertungen erfolgen nur ab einer Teamgröße von mindestens 5 Personen.",
  "Freitext-Antworten werden nicht einzelpersonenbezogen weitergegeben.",
  "Du kannst die Teilnahme jederzeit beenden.",
];
const PRIVACY_POINTS_SIE = [
  "Ihre Antworten werden anonym ausgewertet.",
  "Auswertungen erfolgen nur ab einer Teamgröße von mindestens 5 Personen.",
  "Freitext-Antworten werden nicht einzelpersonenbezogen weitergegeben.",
  "Sie können die Teilnahme jederzeit beenden.",
];

interface SurveyRunnerProps {
  template: TemplateKey;
  personaId: string;
  form: FormOfAddress;
  questions: Question[];
  toolChoices: Choice[];
  /** Wissens-Tipp der Woche, already resolved for the org's form of address. */
  tip: string;
  showPrivacyNotice: boolean;
}

export function SurveyRunner({
  template,
  personaId,
  form,
  questions,
  toolChoices,
  tip,
  showPrivacyNotice,
}: SurveyRunnerProps) {
  const [privacyAccepted, setPrivacyAccepted] = useState(!showPrivacyNotice);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<
    Record<string, AnswerValue | undefined>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = questions[index];
  const total = questions.length;
  const isLast = index === total - 1;
  const value = question ? answers[question.code] : undefined;
  const complete = question
    ? isAnswerComplete(question, value, toolChoices)
    : false;
  const skippable = question?.type === "text_optional";

  const backHref = useMemo(
    () => `/demo?persona=${encodeURIComponent(personaId)}`,
    [personaId],
  );

  async function handleSubmit(finalAnswers: typeof answers) {
    setSubmitting(true);
    setError(null);
    const payload = {
      template,
      personaId,
      answers: Object.entries(finalAnswers)
        .filter(
          (entry): entry is [string, AnswerValue] => entry[1] !== undefined,
        )
        .map(([question_code, answer]) => ({ question_code, answer })),
    };
    const result = await submitSurvey(payload);
    setSubmitting(false);
    if (result.ok) {
      setDone(true);
    } else {
      setError(result.error);
    }
  }

  function advance(withValue: AnswerValue | undefined) {
    if (!question) return;
    const next = { ...answers, [question.code]: withValue };
    setAnswers(next);
    if (isLast) {
      void handleSubmit(next);
    } else {
      setIndex(index + 1);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-10">
        <div
          aria-hidden
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-3xl text-primary-foreground"
        >
          ✓
        </div>
        <h1 className="text-center text-2xl font-bold">
          {form === "sie"
            ? "Danke für Ihre Teilnahme!"
            : "Danke für deine Teilnahme!"}
        </h1>
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            💡 Wissens-Tipp der Woche
          </h2>
          <p className="mt-2 text-base">{tip}</p>
        </section>
        <Button asChild size="lg">
          <Link href={backHref}>Zurück zur Übersicht</Link>
        </Button>
      </main>
    );
  }

  if (!privacyAccepted) {
    const points = form === "sie" ? PRIVACY_POINTS_SIE : PRIVACY_POINTS_DU;
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-10">
        <h1 className="text-2xl font-bold">
          {form === "sie" ? "Bevor Sie starten" : "Bevor du startest"}
        </h1>
        <ul className="space-y-3">
          {points.map((p) => (
            <li key={p} className="flex gap-3 rounded-lg border p-4 text-base">
              <span aria-hidden>🔒</span>
              {p}
            </li>
          ))}
        </ul>
        <Button size="lg" onClick={() => setPrivacyAccepted(true)}>
          Verstanden, los geht’s
        </Button>
        <Link
          href={backHref}
          className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Abbrechen
        </Link>
      </main>
    );
  }

  if (!question) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6 py-10">
        <p className="text-center text-muted-foreground">
          Für diese Befragung stehen aktuell keine Fragen an.
        </p>
        <Button asChild variant="outline">
          <Link href={backHref}>Zurück zur Übersicht</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-6 py-6">
      <header className="mb-6">
        <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>{TEMPLATE_TITLES[template]}</span>
          <span>
            Frage {index + 1} / {total}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={index}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.round((index / total) * 100)}%` }}
          />
        </div>
      </header>

      <section className="flex-1">
        <h1 className="mb-5 text-xl font-semibold leading-snug">
          {questionText(question, form)}
        </h1>
        {question.type === "text_optional" && (
          <p className="mb-3 text-sm text-muted-foreground">
            {form === "sie"
              ? "Bitte keine Angaben, die Sie identifizieren."
              : "Bitte keine Angaben, die dich identifizieren."}
          </p>
        )}
        <QuestionInput
          question={question}
          form={form}
          toolChoices={toolChoices}
          value={value}
          onChange={(v) =>
            setAnswers((prev) => ({ ...prev, [question.code]: v }))
          }
        />
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <footer className="sticky bottom-0 mt-6 flex gap-3 bg-background pb-4 pt-2">
        <Button
          variant="outline"
          size="lg"
          disabled={index === 0 || submitting}
          onClick={() => setIndex(index - 1)}
        >
          Zurück
        </Button>
        {skippable && (
          <Button
            variant="ghost"
            size="lg"
            disabled={submitting}
            onClick={() => advance(undefined)}
          >
            Überspringen
          </Button>
        )}
        <Button
          size="lg"
          className="flex-1"
          disabled={!complete || submitting}
          onClick={() => advance(value)}
        >
          {submitting ? "Wird gesendet…" : isLast ? "Absenden" : "Weiter"}
        </Button>
      </footer>
    </main>
  );
}
