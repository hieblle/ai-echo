"use client";

/**
 * Mobile-first survey runner: one question per screen, progress bar,
 * skippable free-text, all-or-nothing submit at the end (SPEC.md §9).
 * The weekly pulse must be playable in under 60 seconds.
 */

import { Check, Lightbulb, Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/field";
import {
  QuestionInput,
  isAnswerComplete,
} from "@/components/survey/question-input";
import { questionText } from "@/lib/domain/text";
import type {
  SubmitSurveyResult,
  SurveyPayload,
} from "@/lib/server/survey-submit";
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
function privacyPoints(form: FormOfAddress, k: number): string[] {
  const teamSize = `Auswertungen erfolgen nur ab einer Teamgröße von mindestens ${k} Personen.`;
  return form === "sie"
    ? [
        "Ihre Antworten werden anonym ausgewertet.",
        teamSize,
        "Freitext-Antworten werden nicht einzelpersonenbezogen weitergegeben.",
        "Sie können die Teilnahme jederzeit beenden.",
      ]
    : [
        "Deine Antworten werden anonym ausgewertet.",
        teamSize,
        "Freitext-Antworten werden nicht einzelpersonenbezogen weitergegeben.",
        "Du kannst die Teilnahme jederzeit beenden.",
      ];
}

interface SurveyRunnerProps {
  template: TemplateKey;
  form: FormOfAddress;
  questions: Question[];
  toolChoices: Choice[];
  /** ISO week the questions were rendered for (guards week rollover). */
  isoWeek: string;
  /** Org's k-anonymity threshold, shown in the privacy notice. */
  kAnonymityMin: number;
  /** Wissens-Tipp der Woche, already resolved for the org's form of address. */
  tip: string;
  showPrivacyNotice: boolean;
  /** Where "Zurück zur Übersicht" and "Abbrechen" lead. */
  backHref: string;
  /** Server action that stores the answers (demo or member flow). */
  onSubmit: (payload: SurveyPayload) => Promise<SubmitSurveyResult>;
}

export function SurveyRunner({
  template,
  form,
  questions,
  toolChoices,
  isoWeek,
  kAnonymityMin,
  tip,
  showPrivacyNotice,
  backHref,
  onSubmit,
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

  async function handleSubmit(finalAnswers: typeof answers) {
    setSubmitting(true);
    setError(null);
    const payload: SurveyPayload = {
      template,
      isoWeek,
      answers: Object.entries(finalAnswers)
        .filter(
          (entry): entry is [string, AnswerValue] => entry[1] !== undefined,
        )
        .map(([question_code, answer]) => ({ question_code, answer })),
    };
    const result = await onSubmit(payload);
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
      <main className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-xl flex-col justify-center gap-6 px-5 py-10 sm:px-6">
        <div
          aria-hidden
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pill"
        >
          <Check className="h-7 w-7" strokeWidth={2} />
        </div>
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-normal tracking-tight">
            {form === "sie"
              ? "Danke für Ihre Teilnahme!"
              : "Danke für deine Teilnahme!"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {form === "sie"
              ? "Ihre Antworten sind anonym gespeichert."
              : "Deine Antworten sind anonym gespeichert."}
          </p>
        </div>
        {tip && (
          <section className="card-solid p-5">
            <h2 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Lightbulb className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--accent-yellow)" }} aria-hidden />
              Wissens-Tipp der Woche
            </h2>
            <p className="mt-2 text-base leading-relaxed">{tip}</p>
          </section>
        )}
        <Button asChild size="lg">
          <Link href={backHref}>Zurück zur Übersicht</Link>
        </Button>
      </main>
    );
  }

  if (!privacyAccepted) {
    const points = privacyPoints(form, kAnonymityMin);
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-xl flex-col justify-center gap-6 px-5 py-10 sm:px-6">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{TEMPLATE_TITLES[template]}</p>
          <h1 className="text-2xl font-normal tracking-tight">
            {form === "sie" ? "Bevor Sie starten" : "Bevor du startest"}
          </h1>
        </div>
        <ul className="card-solid divide-y divide-border">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-4 px-5 py-4 text-base">
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
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
      <main className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-xl flex-col justify-center gap-4 px-5 py-10 sm:px-6">
        <p className="card-soft p-6 text-center text-sm text-muted-foreground">
          Für diese Befragung stehen aktuell keine Fragen an.
        </p>
        <Button asChild variant="outline">
          <Link href={backHref}>Zurück zur Übersicht</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-xl flex-col px-5 py-4 sm:px-6">
      <header className="mb-6">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{TEMPLATE_TITLES[template]}</span>
          <span>
            Frage {index + 1} von {total}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          className="bar-track"
        >
          <div
            className="bar-fill transition-all"
            style={{ width: `${Math.round(((index + 1) / total) * 100)}%` }}
          />
        </div>
      </header>

      <section className="flex-1">
        <h1 className="mb-5 text-xl font-medium leading-snug">
          {questionText(question, form)}
        </h1>
        {question.type === "text_optional" && (
          <p className="mb-3 text-xs text-muted-foreground">
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
          onChange={(v) => {
            setError(null); // a stale error must not outlive an edit
            setAnswers((prev) => ({ ...prev, [question.code]: v }));
          }}
        />
      </section>

      {error && (
        <div className="mt-4">
          <Notice tone="err">{error}</Notice>
        </div>
      )}

      <footer className="sticky bottom-0 mt-6 flex gap-2 bg-background pb-4 pt-3">
        <Button
          variant="outline"
          size="lg"
          disabled={index === 0 || submitting}
          onClick={() => {
            setError(null);
            setIndex(index - 1);
          }}
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
