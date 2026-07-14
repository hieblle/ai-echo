# lib/seed

Repo-local seed data — the prototype runs entirely on this (no database before
Phase 4). The questionnaire is **data, not code** (CLAUDE.md architecture rule 3).

Planned contents (added in their respective phases, SPEC.md §12/§13):

- `questions.ts` — questionnaire v1.1 (Onboarding / Weekly / Monthly / Leadership),
  each with Du- and Sie-variant (`text_sie`). **Phase 1.**
- `orgs.demo.ts` — the three demo orgs A/B/C (Merlin, SPAR, REWE) with
  `is_demo = true` and 6 weeks of generated responses. **Phase 2** (SPEC.md §16.3).
- `recommendation_rules.ts` — trigger rules R1–R7. **Phase 2** (SPEC.md §11).
