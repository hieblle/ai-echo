# lib/seed

Repo-local seed data — the prototype runs entirely on this (no database before
Phase 4). The questionnaire is **data, not code** (CLAUDE.md architecture rule 3).

Contents:

- `questions.ts` — questionnaire v1.1 (Onboarding / Weekly / Monthly / Leadership),
  42 questions, each with Du- AND Sie-variant (`text_sie`). Texts verbatim from
  the Notion source ("KI-Barometer – Fragebogen", May 2026) plus F6/F7 (SPEC §10).
  Choice values are stable identifiers the Phase-2 KPI formulas rely on.
- `tips.ts` — "Wissens-Tipp der Woche" entries for the thank-you screen.
- `demo-org.ts` — Phase-1 demo tenant (Musterwerk GmbH) with departments and
  the four demo personas for the role switcher.

- `orgs-demo.ts` — the three §16.3 demo orgs (Merlin, SPAR, REWE) with
  departments, headcounts and tool settings (`is_demo = true`).
- `demo-data.ts` — deterministic demo-data generator: 6+ weeks of realistic
  responses with the built-in anomalies SPEC §13 Phase 2 asks for (k-anomaly
  department, unused paid tool, perception gap > 3, declining sentiment, low
  participation). Weekly codes come from the real rotation.
- `rules.ts` — recommendation rules R1–R7 (SPEC.md §11) as data.
