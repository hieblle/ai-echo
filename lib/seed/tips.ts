/**
 * "Wissens-Tipp der Woche" seed entries — shown at the end of every survey as
 * added value (Notion concept / SPEC.md §12). Short, practical AI usage tips;
 * Du-form default with a Sie-form variant (CLAUDE.md rule 3).
 */

export const KNOWLEDGE_TIPS: { id: string; text: string; text_sie: string }[] = [
  {
    id: "tip-context",
    text: "Gib der KI Kontext: Nenne Rolle, Ziel und Zielgruppe deiner Aufgabe. Je konkreter dein Prompt, desto besser das Ergebnis.",
    text_sie:
      "Geben Sie der KI Kontext: Nennen Sie Rolle, Ziel und Zielgruppe Ihrer Aufgabe. Je konkreter Ihr Prompt, desto besser das Ergebnis.",
  },
  {
    id: "tip-validate",
    text: "Prüfe KI-Antworten immer kritisch: Kontrolliere Fakten, Zahlen und Quellen, bevor du sie weiterverwendest. KI klingt auch dann überzeugend, wenn sie falsch liegt.",
    text_sie:
      "Prüfen Sie KI-Antworten immer kritisch: Kontrollieren Sie Fakten, Zahlen und Quellen, bevor Sie sie weiterverwenden. KI klingt auch dann überzeugend, wenn sie falsch liegt.",
  },
  {
    id: "tip-iterate",
    text: "Der erste Entwurf ist selten der beste: Stelle Rückfragen, bitte um Varianten und verfeinere das Ergebnis Schritt für Schritt.",
    text_sie:
      "Der erste Entwurf ist selten der beste: Stellen Sie Rückfragen, bitten Sie um Varianten und verfeinern Sie das Ergebnis Schritt für Schritt.",
  },
  {
    id: "tip-privacy",
    text: "Gib keine personenbezogenen Daten oder Geschäftsgeheimnisse in öffentliche KI-Tools ein. Nutze die in deinem Unternehmen freigegebenen Tools.",
    text_sie:
      "Geben Sie keine personenbezogenen Daten oder Geschäftsgeheimnisse in öffentliche KI-Tools ein. Nutzen Sie die in Ihrem Unternehmen freigegebenen Tools.",
  },
  {
    id: "tip-examples",
    text: "Zeig der KI ein Beispiel des gewünschten Formats: Ein gutes Muster im Prompt spart dir viele Korrekturschleifen.",
    text_sie:
      "Zeigen Sie der KI ein Beispiel des gewünschten Formats: Ein gutes Muster im Prompt spart Ihnen viele Korrekturschleifen.",
  },
  {
    id: "tip-chunking",
    text: "Zerlege große Aufgaben in kleine Schritte: Lass die KI erst gliedern und dann ausformulieren. So behältst du die Kontrolle über das Ergebnis.",
    text_sie:
      "Zerlegen Sie große Aufgaben in kleine Schritte: Lassen Sie die KI erst gliedern und dann ausformulieren. So behalten Sie die Kontrolle über das Ergebnis.",
  },
  {
    id: "tip-role",
    text: "Weise der KI eine Rolle zu, z. B. „Antworte als erfahrene Controllerin“. Das schärft Ton, Perspektive und Fachlichkeit der Antwort.",
    text_sie:
      "Weisen Sie der KI eine Rolle zu, z. B. „Antworte als erfahrene Controllerin“. Das schärft Ton, Perspektive und Fachlichkeit der Antwort.",
  },
  {
    id: "tip-share",
    text: "Teile gute Prompts mit deinem Team: Eine gemeinsame Prompt-Bibliothek macht alle schneller – und ihr lernt voneinander.",
    text_sie:
      "Teilen Sie gute Prompts mit Ihrem Team: Eine gemeinsame Prompt-Bibliothek macht alle schneller – und Sie lernen voneinander.",
  },
];
