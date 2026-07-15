# CLAUDE.md — KI-Barometer

## Projekt
Webapp „KI-Barometer": macht den Erfolg von KI-Einführungen in Unternehmen messbar (Pulse-Befragungen, Dashboard mit ROI & Perception Gap, Handlungsempfehlungen). Anbieter: dbrains academy.

**Vollständige Spezifikation: `SPEC.md` — vor jeder Arbeit den relevanten Abschnitt lesen.** Annahmen und Abweichungen in `DECISIONS.md` dokumentieren (anlegen, falls nicht vorhanden).

## Aktuelle Phase
**Phase 2 abgeschlossen → als Nächstes Phase 3 (Testrunde & GO/NO-GO)** (SPEC.md Abschnitt 13). Diese Zeile beim Phasenwechsel aktualisieren.

## Wichtigste Regel: Prototype-first
**Bis einschließlich Phase 3 gibt es KEINE Datenbank, KEIN Auth, KEINE E-Mails, KEINE Secrets.**
Der Prototyp läuft vollständig auf Demo-Daten aus dem Repo. Wer vor Phase 4 Supabase-Code, Login-Flows oder Env-Variablen einführt, ist auf dem falschen Weg — stoppen und SPEC.md Abschnitt 13 lesen. Testteilnehmer werden erst in Phase 4 eingeladen.

## Stack
Next.js 15 (App Router) · TypeScript strict · Tailwind + shadcn/ui · Recharts · Vitest + Playwright. Supabase (EU) erst ab Phase 4.

## Architekturregeln (nicht verhandelbar)
1. **Domänenlogik = pure functions** in `lib/domain/` (`kpi.ts`, `triggers.ts`, `rotation.ts`, `anonymity.ts`) — keine IO, keine Framework-Imports, vollständig unit-getestet. Formeln exakt nach SPEC.md Abschnitt 10/11.
2. **Datenzugriff nur über das Interface** `lib/data/store.ts`. Phase 1–3: `MemoryStore` (Seeds aus `lib/seed/`). Phase 4: `SupabaseStore` — UI und Domäne bleiben unverändert.
3. **Fragebogen ist Daten, nicht Code:** `lib/seed/questions.ts` (Du- und Sie-Variante pflegen, `text_sie`). Nie Fragetexte in Komponenten hartkodieren.
4. **k-Anonymität (n ≥ k, Default 5)** sitzt in der Aggregations-Funktion in `lib/domain/anonymity.ts` — niemals im Client. Abteilungen unter der Schwelle erscheinen nirgends einzeln.
5. **Mobile-first:** Der Survey-Runner wird primär am Handy genutzt (eine Frage pro Screen, < 60 Sek pro Pulse).
6. Typen führen `org_id` von Tag 1 mit (Mandantenfähigkeit), auch wenn Isolation erst ab Phase 4 erzwungen wird.

## Arbeitsweise
- Phasen aus SPEC.md Abschnitt 13 strikt in Reihenfolge; am Phasenende Akzeptanzkriterien als Checkliste im PR abhaken.
- Bei Unklarheit: beste Annahme treffen, in `DECISIONS.md` eintragen, weiterarbeiten — nicht blockieren, nicht raten und verschweigen.
- Vor jedem Commit: `pnpm typecheck && pnpm test` grün.
- Kleine, thematisch geschnittene Commits.

## Befehle
`pnpm dev` · `pnpm test` · `pnpm typecheck` · `pnpm e2e` (ab Phase 2)

## Sprache & Ton
UI-Texte: Deutsch, Du-Form als Default (Sie-Form über Org-Setting `form_of_address`). Code, Kommentare, Commit-Messages: Englisch.
