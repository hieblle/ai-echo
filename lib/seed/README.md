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

Planned (added in their respective phases, SPEC.md §12/§13):

- `orgs.demo.ts` — the three demo orgs A/B/C (Merlin, SPAR, REWE) with
  `is_demo = true` and 6 weeks of generated responses. **Phase 2** (SPEC.md §16.3).
- `recommendation_rules.ts` — trigger rules R1–R7. **Phase 2** (SPEC.md §11).
