# CLAUDE.md — KI-Barometer

## Projekt
Webapp „KI-Barometer": macht den Erfolg von KI-Einführungen in Unternehmen messbar (Pulse-Befragungen, Dashboard mit ROI & Perception Gap, Handlungsempfehlungen). Anbieter: dbrains academy.

**Vollständige Spezifikation: `SPEC.md` — vor jeder Arbeit den relevanten Abschnitt lesen.** Annahmen und Abweichungen in `DECISIONS.md` dokumentieren.

## Aktuelle Phase
**Phase 4 (Persistenz, Auth & erste echte Testteilnehmer) — Code umgesetzt, Akzeptanz offen** (SPEC.md Abschnitt 13): Supabase-Projekt anlegen, Migration einspielen, Integrationstests, interner Testlauf mit ≥ 5 Personen als „Org 0". Anleitung: `docs/SETUP-PHASE4.md`. Entscheidungen: `DECISIONS.md` D4.1–D4.7. Diese Zeile beim Phasenwechsel aktualisieren.

## Wichtigste Regeln ab Phase 4
- **Die Demo bleibt infrastrukturfrei:** `/demo`, `/dashboard`, `/report` laufen komplett ohne Datenbank, Auth und Secrets auf dem `MemoryStore` (`getDemoStore()`). Das ist Sales-Demo und Testbasis — nie an Supabase hängen.
- **Das Produkt läuft nur über den Store:** `/login`, `/app`, `/admin`, `/api/cron` nutzen den `SupabaseStore` (Service-Role, server-only, `getAppStore()`) ausschließlich hinter dem `Store`-Interface. Kein Supabase-Zugriff aus UI oder Domäne; Auth-Aufrufe nur in `lib/server/supabase-auth.ts`, `lib/server/auth.ts` und `lib/mail/`.
- **Mandantentrennung sitzt in `lib/server/auth.ts`:** jede Produktroute löst den verifizierten Viewer und seine Mitgliedschaft auf; der Store bekommt nur die `org_id` einer verifizierten Mitgliedschaft. RLS ist die zweite Linie — `responses`, `respondent_profiles`, `recommendation_states` haben bewusst KEINE Client-Policies. Rohantworten verlassen den Server nie.
- **Secrets nur in Umgebungsvariablen** (`.env.example` listet alle), nie im Repo. Ohne Konfiguration zeigen die Produktrouten `/app/setup` statt zu crashen.
- **Kein Vercel-exklusiver Code** (DECISIONS D3.1): Cron = abgesicherte Route Handler, Mail hinter `Mailer`, Build `standalone`.

## Stack
Next.js 15 (App Router) · TypeScript strict · Tailwind + shadcn/ui · Recharts · Vitest + Playwright · Supabase (EU, Frankfurt): Postgres, Auth (Magic Links), RLS.

## Architekturregeln (nicht verhandelbar)
1. **Domänenlogik = pure functions** in `lib/domain/` (`kpi.ts`, `triggers.ts`, `rotation.ts`, `anonymity.ts`) — keine IO, keine Framework-Imports, vollständig unit-getestet. Formeln exakt nach SPEC.md Abschnitt 10/11.
2. **Datenzugriff nur über das Interface** `lib/data/store.ts`. `MemoryStore` (Demo + Tests) und `SupabaseStore` (Produkt) sind austauschbar — UI und Domäne kennen nur das Interface. Schema: `supabase/migrations/`.
3. **Fragebogen ist Daten, nicht Code:** `lib/seed/questions.ts` (Du- und Sie-Variante pflegen, `text_sie`). Nie Fragetexte in Komponenten hartkodieren. Fragen und Regeln bleiben Repo-Seeds (DECISIONS D4.1).
4. **k-Anonymität (n ≥ k, Default 5)** sitzt in der Aggregations-Funktion in `lib/domain/anonymity.ts` und im Dashboard-Service — niemals im Client. Abteilungen unter der Schwelle erscheinen nirgends einzeln; k ist in der DB auf ≥ 5 erzwungen und nur erhöhbar.
5. **Mobile-first:** Der Survey-Runner wird primär am Handy genutzt (eine Frage pro Screen, < 60 Sek pro Pulse).
6. Typen führen `org_id` von Tag 1 mit (Mandantenfähigkeit); Isolation wird ab Phase 4 erzwungen (Server-Schicht + RLS).
7. **Anonymität by construction:** `responses` trägt keinen Personen-/Profil-Schlüssel und keinen Zeitstempel; `participations` (wer) und `responses` (was) teilen nur die Zyklus-Woche. Respondent-Key = HMAC(`PSEUDONYM_SECRET`, membership_id), nie gespeichert (DECISIONS D4.2). Schema-Tests (`lib/data/schema.test.ts`) erzwingen das — nicht aufweichen.

## Arbeitsweise
- Phasen aus SPEC.md Abschnitt 13 strikt in Reihenfolge; am Phasenende Akzeptanzkriterien als Checkliste im PR abhaken.
- Bei Unklarheit: beste Annahme treffen, in `DECISIONS.md` eintragen, weiterarbeiten — nicht blockieren, nicht raten und verschweigen.
- Vor jedem Commit: `pnpm typecheck && pnpm test` grün (Integrationstests laufen nur mit Supabase-Keys und werden sonst übersprungen). Vor dem Push zusätzlich `pnpm build`.
- Kleine, thematisch geschnittene Commits.

## Befehle
`pnpm dev` · `pnpm test` · `pnpm typecheck` · `pnpm lint` · `pnpm build` · `pnpm db:migrate` (braucht `SUPABASE_DB_URL`) · `pnpm e2e`

## Sprache & Ton
UI-Texte: Deutsch, Du-Form als Default (Sie-Form über Org-Setting `form_of_address`). Code, Kommentare, Commit-Messages: Englisch.
