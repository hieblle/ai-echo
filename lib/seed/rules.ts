/**
 * Recommendation rule seeds (SPEC.md §11, Regelwerk v1, R1–R7).
 *
 * Rules are DATA, not code (they map to the `recommendation_rules` table and
 * are activatable per org). The evaluation logic lives in
 * `lib/domain/triggers.ts` and only knows the rule KEYS — title, description,
 * action_type and course_url are presentation/config data consumed by the
 * recommendation cards. Course URLs are placeholder deep links onto the
 * dbrains learning platform (SPEC.md §11: "Kurs-URLs konfigurierbar").
 */

import type { RecommendationRule } from "@/lib/types";

export const RECOMMENDATION_RULES: RecommendationRule[] = [
  {
    key: "R1",
    title: "Kurs „KI-Grundlagen“ + Awareness-Kampagne",
    description:
      "Die Adoption-Rate liegt seit zwei Wochen unter 50 % — der Kurs „KI-Grundlagen“ und eine interne Awareness-Kampagne senken die Einstiegshürde.",
    action_type: "course",
    course_url: "https://academy.dbrains.example/kurse/ki-grundlagen",
    active: true,
  },
  {
    key: "R2",
    title: "Kurse „Prompt Engineering“ + „KI-Output validieren“",
    description:
      "Der Vertrauensindex liegt unter 5 — die Kurse „Prompt Engineering“ und „KI-Output validieren“ stärken das Vertrauen in KI-Ergebnisse.",
    action_type: "course",
    course_url: "https://academy.dbrains.example/kurse/prompt-engineering",
    active: true,
  },
  {
    key: "R3",
    title: "Strategie-Call mit dbrains + anonymes Feedback-Format",
    description:
      "Der Stimmungsindex sinkt seit drei Zyklen in Folge — ein Strategie-Call mit dbrains und ein anonymes Feedback-Format decken die Ursachen auf.",
    action_type: "strategy_call",
    course_url: null,
    active: true,
  },
  {
    key: "R4",
    title: "Passenden Kurs zum Schulungswunsch verlinken",
    description:
      "Mehr als 30 % wünschen sich eine Schulung zu einem Thema — verlinke den passenden Kurs aus dem dbrains-Katalog.",
    action_type: "course",
    course_url: "https://academy.dbrains.example/kurse",
    active: true,
  },
  {
    key: "R5",
    title: "Lizenz prüfen: kündigen oder gezielt schulen",
    description:
      "Ein bezahltes Tool wird von weniger als 20 % als meistgenutztes Tool genannt — prüfe die Lizenz: kündigen oder gezielt schulen.",
    action_type: "license_review",
    course_url: null,
    active: true,
  },
  {
    key: "R6",
    title: "Kommunikationsmaßnahme: Strategie-Townhall / FAQ",
    description:
      "Der Perception Gap liegt bei über 3 Punkten auf einem Paar — eine Strategie-Townhall oder ein FAQ gleichen die Wahrnehmung von Führung und Team an.",
    action_type: "communication",
    course_url: null,
    active: true,
  },
  {
    key: "R7",
    title: "Management-Buy-in einholen, Nutzen intern kommunizieren",
    description:
      "Die Teilnahmequote liegt seit zwei Zyklen unter 40 % — hole dir Management-Buy-in und kommuniziere den Nutzen der Befragung intern.",
    action_type: "communication",
    course_url: null,
    active: true,
  },
];
