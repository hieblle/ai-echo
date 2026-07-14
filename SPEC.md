# KI-Barometer — MVP-Spezifikation & Roadmap für Claude Code

**Version:** 1.3 · **Datum:** 14.07.2026
**Basis:** Notion-Konzept „KI-Barometer – Strategisches Konzept" + „KI-Barometer – Fragebogen" (Mai 2026), aktualisiert um Problemanalyse Juli 2026
**Wichtigste Änderung ggü. altem Konzept:** Eigenständige React-Webapp statt WordPress-Plugin. Der PHP/WordPress-Teil des alten Konzepts ist vollständig obsolet.
**Entschieden am 14.07.2026:** Stack = Next.js + Supabase (EU-Region) · Multi-Tenant ab Tag 1 (schlanke Variante, s. Abschnitt 4.1) · Freitext-KI-Auswertung = Post-MVP · Pilot-Sequenz: Merlin Technology → SPAR **oder** REWE (Abschnitt 16) · Sie/Du-Org-Setting im MVP · **Prototype-first:** Phasen 1–3 ohne Datenbank/Auth (Demo-Daten), Supabase erst ab Phase 4

---

## 1. Kontext & Ziel

**Anbieter:** dbrains academy — bietet KI-Kompetenz-E-Learning (u. a. EU-AI-Act-Art.-4-Schulung, 39 €/Person) und KI-Einführungsberatung.

**Produkt:** Das KI-Barometer macht den Erfolg von KI-Einführungen in Unternehmen **messbar, sichtbar und steuerbar** — „Teamecho für KI". Es ist kein reines Umfrage-Tool, sondern der Steuerungs-Hub der KI-Einführungs-Dienstleistung: Baseline vor der Einführung, kontinuierliche Pulse-Messung, Dashboard mit ROI, konkrete Handlungsempfehlungen mit Verknüpfung zur dbrains-Lernplattform.

**Zielgruppe:** DACH-Unternehmen (Fokus KMU/Mittelstand 25–500 MA), die KI eingeführt haben oder einführen und den Nutzen nachweisen müssen.

**Ziel (zweistufig, v1.3):**
1. **Prototyp (Ende Woche 2):** Klickbarer, testbarer Durchstich ohne Datenbank und ohne Auth — Survey-Runner und Dashboard laufen vollständig auf Demo-Daten und sind intern sowie beim Pilotkandidaten vorführbar.
2. **Pilot-Launch (Ende Woche 8):** Nach Validierung (GO in Phase 3) wird die Infrastruktur ergänzt (Supabase, Auth, Einladungen — erst dann werden Testteilnehmer eingeladen). Pilot 1 durchläuft Onboarding + 4 Pulse-Wochen + 1 Monatsbefragung end-to-end inkl. Monatsreport.

---

## 2. Problemanalyse (Stand Mitte 2026) — Warum dieses Produkt jetzt

Die Marktlage hat sich seit dem ursprünglichen Konzept (Mai) messbar verschoben. Fünf Kernprobleme, jeweils mit Konsequenz fürs Produkt:

### P1 — Adoption ist da, Wert nicht (Wertnachweis-Lücke)
41 % der deutschen Unternehmen nutzen KI aktiv (Bitkom/IfM/DIHK 2026, drei unabhängige Quellen), aber 81 % finden ROI-Quantifizierung schwierig und >75 % erzielen keinen messbaren Return (DIHK 2026, n=5.000). 63 % der KMU melden Kostenüberschreitungen, weil harte Erfolgskriterien fehlen. ROI-Messung ist ein Design-Problem: Sie muss VOR dem Projekt definiert werden.
→ **Konsequenz:** Baseline-Messung (Monat 0, vor/zu Beginn der KI-Einführung) ist Kernfeature. Jede Auswertung zeigt Delta zur Baseline. ROI in € ist die Leitkennzahl auf dem Dashboard.

### P2 — Individuelle Gewinne skalieren nicht zur Organisation
Super-User erreichen 5× Produktivität, aber nur ~29 % der Organisationen sehen signifikanten ROI (Writer 2026). MIT „GenAI Divide": >80 % nutzen KI-Tools, die Mehrheit der Piloten bleibt ohne P&L-Effekt. Niemand weiß systematisch, wer die Champions sind und welche Use Cases funktionieren.
→ **Konsequenz:** Das Tool muss funktionierende Use Cases und Power-User-Anteile sichtbar machen (aggregiert, anonym) — nicht nur Durchschnittswerte. Freitextfrage „Bei welcher Aufgabe war KI besonders hilfreich?" wird zur Use-Case-Sammlung fürs Unternehmen.

### P3 — Wahrnehmungslücke Führung ↔ Belegschaft
89 % der Führungskräfte sehen eine KI-Strategie, nur 57 % der Mitarbeitenden; 64 % vs. 33 % bei KI-Kompetenz (Writer-Umfrage). Führung steuert auf Basis falscher Annahmen.
→ **Konsequenz:** Gespiegelte Fragen für Führungskräfte und Mitarbeitende; das Dashboard zeigt den **Perception Gap** explizit. Das ist das Differenzierungsmerkmal ggü. Teamecho (nur Stimmung) und Viva/Copilot-Analytics (nur Nutzung).

### P4 — Adoption wird als Kommunikation behandelt, ist aber Verhaltensänderung
„Bekanntmachen ≠ Befähigen ≠ Einbetten." Nutzungsstatistik ≠ echter Verhaltenswandel; Schulungs-Completion-Rates messen Aktivität, nicht Wirkung. Qualifizierung ist laut Bitkom der Top-Erfolgsfaktor — aber nur, wenn sie am Bedarf ansetzt und Wirkung gemessen wird.
→ **Konsequenz:** Jeder Befund mündet in eine konkrete Maßnahme (Kurs-Empfehlung mit Deep-Link auf dbrains-Lernplattform, Lizenz-Entscheidung, Kommunikationsmaßnahme). Nach absolvierten Kursen wird geprüft, ob sich die Indizes verbessern (Wirkungs-Tracking, MVP: einfacher Vorher/Nachher-Vergleich).

### P5 — Compliance-Druck als Kaufauslöser
Art. 4 EU AI Act verpflichtet seit Feb 2025 zu nachweisbarer KI-Kompetenz; Hochrisiko-Pflichten greifen ab Aug 2026; 77 % nennen Datenschutz als KI-Hürde.
→ **Konsequenz:** (a) EU-Hosting + saubere Anonymisierung sind Kaufvoraussetzung, kein Feature. (b) Neues Feature ggü. altem Konzept: **AI-Act-Kompetenznachweis-Export** (aggregierte Selbsteinschätzung, Schulungsstand, Teilnahmequote) als Teil des Monatsreports — direkter Cross-Sell zum dbrains-E-Learning.

---

## 3. Produkt-These: Die 4 Kern-Outputs des MVP

1. **ROI in € mit Trend** — gesparte Stunden × Stundensatz vs. Lizenzkosten, ab Baseline. Sprache der Geschäftsführung.
2. **Perception Gap** — Delta zwischen Führungs- und Mitarbeitersicht auf gespiegelten Fragen. Alleinstellungsmerkmal.
3. **Maßnahmen statt Reports** — regelbasierte Empfehlungen mit Kurs-Links; jeder Report endet mit konkreten nächsten Schritten.
4. **AI-Act-Kompetenznachweis** — exportierbarer Abschnitt im Monatsreport für HR/Compliance.

---

## 4. MVP-Scope

> **Lesart (v1.3):** 4.1 beschreibt den Endausbau zum Pilot-Launch (Woche 8). Der Prototyp (Phasen 1–3, Abschnitt 13) setzt davon bewusst nur Befragungs-UI, Domänenlogik und Dashboard auf Demo-Daten um — ohne Datenbank, Auth und E-Mail.

### 4.1 Im MVP enthalten

- **Multi-Tenant ab Tag 1 (entschieden)** — Schema, RLS-Policies und Aggregation durchgängig org-scoped. Bewusst schlank: kein Self-Service-Signup, kein Billing, keine Org-Verwaltung durch Kunden — Organisationen legt ausschließlich dbrains als platform_admin an. Mehraufwand ~1–2 Tage in Phase 1; die RLS-Policies werden für die Rollentrennung ohnehin benötigt
- **Rollen:** `platform_admin` (dbrains), `org_admin` (Geschäftsleitung/HR), `team_lead`, `employee`
- **Befragungs-Engine:**
  - Onboarding-Befragung (einmalig, Baseline, ~3 Min)
  - Wöchentlicher Pulse (3–5 Fragen, <60 Sek, Rotation, ≥1 Frage pro Dimension, Conditional Logic auf genutzte Tools)
  - Monatliche Vertiefung (8–12 Fragen, 5–8 Min)
  - Führungskräfte-Pfad (monatlich, inkl. gespiegelter Gap-Fragen)
- **Anonymität by design** (siehe Abschnitt 7) mit k-Anonymität ≥ 5
- **Dashboard (rollenbasiert):** 4 Indizes (Adoption, Effizienz, Vertrauen, Stimmung) mit Trend, ROI-Kachel, Abteilungs-Heatmap, Perception-Gap-Ansicht, Teilnahmequote, Use-Case-Highlights (Freitexte aggregiert)
- **Empfehlungs-Engine:** regelbasiert (Trigger-Tabelle, Abschnitt 11), Empfehlungs-Cards mit Deep-Links auf Kurse
- **E-Mail:** Einladung per Magic Link, Befragungs-Reminder (max. 1 pro Befragung)
- **Monatsreport als PDF** (automatisch generiert, an org_admin per Mail, inkl. AI-Act-Nachweis-Abschnitt)
- **DSGVO-Basics:** Datenschutz-Hinweise vor erster Befragung, Datenexport (JSON/CSV) und Org-Löschung durch platform_admin, EU-Hosting

### 4.2 Explizit NICHT im MVP (→ Post-MVP-Backlog, Abschnitt 15)

- KI-gestützte Freitext-Analyse (Sentiment/Clustering via Claude API)
- API-Integration mit der Lernplattform (MVP: nur Deep-Links; Kurs-Absolvierung wird per Frage M3.3 selbst berichtet)
- MS-Teams-/Slack-Integration, SSO/SAML
- Benchmarks zwischen Unternehmen
- Mehrsprachigkeit (EN) — Deutsch bleibt einzige MVP-Sprache. **Änderung v1.2:** Die Sie/Du-Umschaltung ist jetzt IM MVP (Org-Setting `form_of_address` + `text_sie`-Varianten in den Seeds), da die Enterprise-Piloten (SPAR/REWE) die Sie-Form benötigen
- White-Label, Custom-Branding (MVP: Logo + Primärfarbe pro Org reicht)
- Gamification (Badges etc.) — nur der „Wissens-Tipp" nach jeder Befragung bleibt drin (geringer Aufwand, hoher Effekt auf Teilnahme)
- Natives Mobile-App (MVP: mobile-first responsive Web)

---

## 5. Architektur & Tech-Stack (entschieden am 14.07.2026)

| Ebene | Wahl | Begründung |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Ein Repo, SSR fürs Dashboard, API Routes/Server Actions, schnelle Iteration |
| Datenbank + Auth **(erst ab Phase 4)** | **Supabase, EU-Region (Frankfurt)**: Postgres, Auth (Magic Links), Row Level Security, Storage (PDFs) | DSGVO-freundlich, Auth + RLS out of the box, pg_cron für Zyklen |
| UI | Tailwind CSS + shadcn/ui | Schnell, konsistent, barrierearm |
| Charts | Recharts | Trends, Heatmap, Gauge |
| E-Mail | Resend oder Brevo (EU-Versand prüfen!) | Transaktionsmails: Einladung, Reminder, Report |
| PDF | @react-pdf/renderer serverseitig (Fallback: Playwright-Print einer Report-Route) | Monatsreport |
| Jobs/Cron | Supabase pg_cron oder Vercel Cron | Zyklus-Start, Reminder, Aggregation, Reportlauf |
| Hosting | **Default: Vercel (Region fra1)**; Hetzner + Coolify als späterer Pfad | Schnellster Weg zum Pilot. Hinweis: Vercel/Supabase sind US-Anbieter mit EU-Hosting + AVV — falls Zielkunden „EU-only ohne US-Anbieter" hart fordern, ist Self-Hosting möglich, da Next.js + Supabase portabel sind |
| Tests | Vitest (Unit: KPI-Logik, Rotation, k-Anonymität) + Playwright (Kern-Flows) | KPI- und Anonymitäts-Logik MUSS getestet sein |
| Validierung | Zod (alle API-Inputs, Survey-Antworten) | |

**Grundprinzipien für Claude Code:**
- **Prototype-first:** Phasen 1–3 laufen ohne externe Dienste. Domänenlogik (KPI, Trigger, Rotation, k-Anonymität) als pure functions in `lib/domain/`; Datenzugriff hinter dem Interface `lib/data/store.ts` (Phase 1–3: `MemoryStore` mit Repo-Seeds, Phase 4: `SupabaseStore`).
- Server-first: Aggregationen und k-Anonymitäts-Prüfung laufen ausschließlich serverseitig. Der Client bekommt nie Rohantworten.
- Fragebogen ist Daten, nicht Code: Fragen/Rotation/Trigger liegen als Seed-Daten in der DB, nicht hartkodiert.
- Alles mandantenfähig: Datenmodell und TypeScript-Typen führen `org_id` von Tag 1 mit; RLS erzwingt Isolation ab Phase 4.
- Mobile-first: Der Pulse wird zu 80 % am Handy ausgefüllt.

---

## 6. Datenmodell (Kern-Tabellen)

```
organizations        id, name, slug, logo_url, primary_color, hourly_rate_default,
                     locale ('de'), form_of_address ('du'|'sie'),
                     k_anonymity_min (int, default 5 — nur erhöhbar),
                     is_demo (bool, default false), created_at

departments          id, org_id, name

org_settings_tools   id, org_id, tool_name (enum + custom), monthly_license_cost_eur,
                     active (bool)

memberships          id, org_id, user_id (Supabase auth.users), department_id,
                     role ('platform_admin'|'org_admin'|'team_lead'|'employee'),
                     invited_at, joined_at, status

survey_templates     id, key ('onboarding'|'weekly'|'monthly'|'leadership'), version

questions            id, template_id, code ('W1.1' …), dimension
                     ('adoption'|'efficiency'|'trust'|'sentiment'|'roi'|'tools'|
                      'learning'|'culture'|'strategy'|'nps'|'meta'),
                     type ('single_choice'|'multi_choice'|'scale_1_10'|'scale_minus5_plus5'|
                           'scale_0_10'|'number'|'currency'|'text_optional'|'tool_matrix'),
                     text, text_sie (nullable — Sie-Form-Variante, Fallback: text),
                     options (jsonb), condition (jsonb, z. B. {"requires_tool": true}),
                     is_gap_pair_with (question.code | null), sort_order, active

survey_cycles        id, org_id, template_key, period_start, period_end,
                     status ('scheduled'|'open'|'closed'), reminder_sent_at

cycle_questions      id, cycle_id, question_id      -- die konkret gezogenen Fragen
                                                    -- (bei weekly: Rotationsergebnis pro Org)

participations       id, cycle_id, membership_id, status ('invited'|'completed'|'skipped'),
                     completed_at (auf Stunde gerundet)
                     -- NUR fürs Reminder-/Quoten-Tracking. KEINE Verknüpfung zu responses.

respondent_profiles  id, org_id, pseudonym_token (random, einmalig pro Membership erzeugt,
                     Zuordnung Token↔Membership wird NICHT gespeichert — Token liegt nur
                     client-seitig im Auth-Metadata-Feld des Users),
                     department_id, role_scope ('employee'|'lead'),
                     tools_used (jsonb, aus O2), ai_experience (aus O3),
                     question_history (jsonb: zuletzt gestellte weekly-Fragen für Rotation)

responses            id, org_id, cycle_id, department_id, role_scope,
                     question_code, answer (jsonb), created_week (ISO-Woche, KEIN Timestamp)
                     -- KEIN user_id, KEIN membership_id, KEIN pseudonym_token.

aggregates           id, org_id, cycle_id, department_id (nullable = org-gesamt),
                     metric_key, value (numeric), n (int)
                     -- nur Zeilen mit n >= 5 werden je Abteilung geschrieben (k-Anonymität)

recommendation_rules id, key, trigger (jsonb: metric_key, operator, threshold,
                     window), title, description, action_type
                     ('course'|'strategy_call'|'license_review'|'communication'),
                     course_url (nullable), active

recommendations      id, org_id, cycle_id, rule_key, status ('open'|'done'|'dismissed'),
                     created_at

reports              id, org_id, period (YYYY-MM), pdf_path, sent_at
```

**Hinweis zur Umsetzung von `respondent_profiles`:** Das Pseudonym-Token wird beim Onboarding erzeugt und im Supabase-`user_metadata` des Users gespeichert (client-verfügbar). Beim Absenden einer Befragung schickt der Client das Token mit; der Server nutzt es NUR, um `tools_used` (Conditional Logic) und `question_history` (Rotation) zu lesen/schreiben — und schreibt die Antworten OHNE Token in `responses`. Die Zuordnung Token↔User existiert nirgends in der DB. Trade-off ist dokumentiert: bei Abteilungen < 5 werden Antworten gar nicht abteilungsscharf ausgewertet (siehe Abschnitt 7).

---

## 7. Anonymitäts-Konzept (kritisch — zuerst lesen, dann bauen)

Glaubwürdige Anonymität entscheidet über die Teilnahmequote. Regeln:

1. **Trennung von Teilnahme und Antwort.** `participations` (wer hat teilgenommen → Reminder, Quote) und `responses` (was wurde geantwortet) sind technisch nicht verknüpfbar. Kein gemeinsamer Schlüssel, keine exakten Timestamps (`responses` speichert nur die ISO-Woche, `participations` rundet auf Stunde).
2. **k-Anonymität ≥ 5, serverseitig erzwungen.** Aggregation pro Abteilung wird nur berechnet und ausgeliefert, wenn n ≥ k Antworten vorliegen (k = `organizations.k_anonymity_min`, Default 5, pro Org nur erhöhbar — z. B. falls ein Betriebsrat eine höhere Schwelle fordert); sonst fließen die Antworten nur in die Org-Gesamtauswertung. Diese Prüfung sitzt in der Aggregations-Schicht (SQL/Server), niemals im Client. Unit-Tests dafür sind Pflicht.
3. **Freitexte:** Werden nur auf Org-Ebene und nur gesammelt (zufällige Reihenfolge, ohne Abteilung/Datum) angezeigt. Offensichtliche Selbst-Identifikation („Ich als einziger Buchhalter…") ist Restrisiko → Hinweistext bei Freitextfeldern: „Bitte keine Angaben, die dich identifizieren."
4. **Rollen-Sicht:** `team_lead` sieht nur das eigene Team (ab n ≥ 5), `org_admin` alles aggregiert, `employee` nur die eigenen Befragungen + öffentliche Org-Kennzahlen (Teilnahmequote, Stimmungsindex gesamt — Transparenz erhöht Vertrauen).
5. **Transparenztext** vor der ersten Befragung (aus dem Notion-Fragebogen übernehmen): anonyme Auswertung, Mindestteamgröße 5, Freitexte nicht personenbezogen, Teilnahme jederzeit beendbar.

---

## 8. Kern-Flows (User Journeys)

- **F1 Org-Setup (platform_admin):** Org anlegen → Abteilungen → KI-Tools + monatliche Lizenzkosten → Standard-Stundensatz → org_admin einladen. Dauer < 10 Min.
- **F2 Mitarbeiter-Onboarding:** org_admin lädt per E-Mail-Liste/CSV ein → Magic Link → Datenschutz-Hinweis → Onboarding-Befragung O1–O5 (Baseline) → fertig. Kein Passwort.
- **F3 Wöchentlicher Pulse:** Cron öffnet Zyklus Mo 09:00 → E-Mail mit Magic Link → 3–5 Fragen, mobile-first, eine Frage pro Screen, < 60 Sek → Danke-Screen mit „Wissens-Tipp der Woche". Do 10:00 ein Reminder an `participations.status = 'invited'`.
- **F4 Monatliche Vertiefung:** letzter Arbeitstag des Monats, analog F3 (5–8 Min). Führungskräfte (`team_lead`, `org_admin`) erhalten zusätzlich den Leadership-Fragenblock F1–F7.
- **F5 Dashboard:** org_admin/team_lead sehen: 4 Index-Kacheln mit Trend (12 Wochen), ROI-Kachel, Heatmap Abteilungen × Dimensionen, Perception-Gap-Sektion, Teilnahmequote, Empfehlungs-Cards, Use-Case-Highlights.
- **F6 Monatsreport:** Cron am 1. des Folgemonats → PDF generieren → an org_admin mailen → im Dashboard-Archiv ablegen. Enthält: Kennzahlen + Trend, Gap-Analyse, Top-Use-Cases, Empfehlungen, AI-Act-Nachweis-Abschnitt.
- **F7 Empfehlung → Aktion:** org_admin öffnet Empfehlungs-Card → Deep-Link auf Kurs der Lernplattform → markiert als „erledigt"/„verworfen".

---

## 9. Befragungs-Engine — Spezifikation

**Fragetypen:** `single_choice`, `multi_choice`, `scale_1_10`, `scale_0_10` (NPS), `scale_minus5_plus5`, `number`, `currency`, `text_optional`, `tool_matrix` (pro genutztem Tool: Nützlichkeit 1–10 + Nutzungen/Woche).

**Rotation (weekly):** Pro Org und Woche werden 3–5 Fragen aus dem Weekly-Pool gezogen mit Constraints: (a) mindestens 1 Frage pro Dimension Adoption/Effizienz/Vertrauen/Stimmung wenn 4+ Fragen, (b) pro Person keine Frage zweimal in Folge → Abgleich gegen `respondent_profiles.question_history` beim Ausliefern; wenn die Org-Ziehung für eine Person kollidiert, wird individuell eine Ersatzfrage derselben Dimension gezogen.

**Conditional Logic:** Fragen mit `condition.requires_tool = true` (z. B. W1.2) zeigen nur Tools aus `respondent_profiles.tools_used`. Wer bei O2 „Aktuell keine" wählt, bekommt eine verkürzte Pulse-Variante (W1.1 + W4.1 + W4.2) — auch Nicht-Nutzer sind ein wichtiges Signal.

**UX-Regeln:** Eine Frage pro Screen, große Touch-Targets, Fortschrittsbalken, jede Freitextfrage überspringbar, Abbruch speichert nichts Halbes (ganz oder gar nicht — vereinfacht Anonymität und Auswertung).

---

## 10. KPI-Berechnungslogik (v1, präzisiert ggü. Notion)

| Kennzahl | Berechnung | Quelle |
|---|---|---|
| Adoption-Rate | Anteil Antworten mit Nutzung ≥ „1–2 mal" an allen W1.1-Antworten der Woche | W1.1 |
| Power-User-Anteil | Anteil „Täglich" + „Mehrmals täglich" | W1.1 |
| Eingesparte Stunden/Monat | Summe der Klassenmitten aus W2.1 (0; 0,5; 2; 4; 7,5; 12) hochgerechnet auf Nichtteilnehmer via Teilnahmequote — konservativ: nur Summe der Antworten, Hochrechnung als Zweitwert ausweisen | W2.1, M1.1 |
| **Netto-Ersparnis €/Monat** | (Eingesparte Stunden × Stundensatz) − Σ Lizenzkosten | W2.1 × org_settings |
| **ROI-Multiple** | (Eingesparte Stunden × Stundensatz) ÷ Σ Lizenzkosten | dito |
| Effizienzindex (0–10) | Mittel aus W2.3 und normiertem M1.3 ((x+5)/10×10) | W2.3, M1.3 |
| Vertrauensindex (0–10) | Mittel aus W3.3 und invertiertem W3.1 (Nie=10, Selten=7,5, Manchmal=5, Oft=2,5, Fast immer=0) | W3.1, W3.3 |
| Stimmungsindex (0–10) | Mittel aus W4.2 und gemapptem W4.1 (10/7,5/5/2,5/0) | W4.1, W4.2 |
| NPS | %Promotoren (9–10) − %Detraktoren (0–6) | M6.1 |
| Teilnahmequote | completed ÷ invited pro Zyklus | participations |
| **Perception Gap** | Delta der gespiegelten Paare (s. u.), positiv = Führung optimistischer | M/F-Paare |

**Gespiegelte Gap-Paare (Leadership-Fragen F6/F7 sind NEU, v1.1 des Fragebogens):**
1. Strategie-Klarheit: M5.1 (MA) ↔ **F6** „Wie klar ist eure KI-Strategie aus deiner Sicht im Unternehmen kommuniziert?" (Skala 1–10)
2. Kompetenz: M3.1 (MA-Selbsteinschätzung) ↔ **F7** „Wie schätzt du die KI-Kompetenz deines Teams insgesamt ein?" (Skala 1–10)
3. Nutzen: Effizienzindex (MA) ↔ F2 (FK-Nutzeneinschätzung)

Baseline = Werte der Onboarding-Kohorte + erste 2 Pulse-Wochen; alle Trends werden gegen Baseline und Vorperiode ausgewiesen.

---

## 11. Empfehlungs-Trigger (Regelwerk v1)

| # | Trigger | Empfehlung | action_type |
|---|---|---|---|
| R1 | Adoption-Rate < 50 % (2 Wochen) | Kurs „KI-Grundlagen" + Awareness-Kampagne | course |
| R2 | Vertrauensindex < 5 | Kurse „Prompt Engineering" + „KI-Output validieren" | course |
| R3 | Stimmungsindex sinkt 3 Zyklen in Folge | Strategie-Call mit dbrains + anonymes Feedback-Format | strategy_call |
| R4 | Schulungswunsch-Thema X > 30 % (M3.2) | Passenden Kurs zu X verlinken | course |
| R5 | Tool mit Lizenzkosten > 0 und Nutzung < 20 % | Lizenz prüfen: kündigen oder gezielt schulen | license_review |
| R6 | Perception Gap > 3 Punkte auf einem Paar | Kommunikationsmaßnahme: Strategie-Townhall / FAQ | communication |
| R7 | Teilnahmequote < 40 % (2 Zyklen) | Management-Buy-in einholen, Nutzen intern kommunizieren | communication |

Regeln liegen als Seed-Daten in `recommendation_rules` und sind pro Org aktivierbar. Kurs-URLs konfigurierbar (Deep-Links auf dbrains-Lernplattform).

---

## 12. Seed-Daten: Fragebogen v1.1

Quelle: Notion „KI-Barometer – Fragebogen" (Mai 2026) — Fragen unverändert übernehmen, plus F6/F7 (neu). Als JSON-Seeds anlegen. Kurzreferenz:

**Onboarding (O):** O1 Abteilung (single_choice) · O2 genutzte KI-Tools (multi_choice inkl. „Aktuell keine") · O3 Nutzungsdauer (single_choice) · O4 KI-Wissen (scale_1_10) · O5 Haupt-Anwendungsfälle (multi_choice)

**Weekly-Pool (W):** W1.1 Nutzungshäufigkeit · W1.2 meistgenutztes Tool (conditional) · W1.3 Neues ausprobiert (single + text) · W2.1 gesparte Stunden (Klassen) · W2.2 hilfreichste Aufgabe (text_optional) · W2.3 Output-Qualität (scale_1_10) · W3.1 Nacharbeit (single_choice) · W3.2 Fehlerhafte Antwort erlebt (single + text) · W3.3 Sicherheit im Umgang (scale_1_10) · W4.1 Entlastung/Belastung (single_choice, 5 Stufen) · W4.2 Stimmung zu KI (scale_1_10) · W4.3 Störfaktor der Woche (text_optional)

**Monthly (M):** M1.1 gesparte Stunden gesamt (number) · M1.2 „ohne KI nicht mehr in gleicher Zeit" (text) · M1.3 Produktivitätsveränderung (scale_minus5_plus5) · M1.4 Aha-Erlebnis (text) · M2.1 Tool-Bewertung (tool_matrix) · M2.2 fehlendes Tool (text) · M2.3 ungenutztes Tool + warum (text) · M3.1 Sicherheit gesamt (scale_1_10) · M3.2 Schulungswünsche (multi_choice) · M3.3 Kurs absolviert + Nutzen (single + scale) · M4.1 Team-Offenheit (scale_1_10) · M4.2 Austausch im Team (single_choice) · M4.3 Sorgen (text_optional) · M4.4 Chancen (text_optional) · M5.1 klare KI-Strategie erkennbar (scale_1_10) · M5.2 Infos/Schulungen ausreichend (scale_1_10) · M5.3 „eine Sache ändern" (text_optional) · M6.1 Tool-NPS (scale_0_10)

**Leadership (F, monatlich, nur team_lead/org_admin):** F1 KI-Lizenzbudget Monat (currency) · F2 Nutzen der Investition (scale_1_10) · F3 messbare Erfolge (text) · F4 Hindernisse im Team (text) · F5 Ø-Stundensatz Team (currency, fließt in ROI) · **F6 Strategie-Kommunikation (scale_1_10, NEU)** · **F7 Team-Kompetenz-Einschätzung (scale_1_10, NEU)**

---

## 13. Umsetzungs-Roadmap für Claude Code — Prototype-first (v1.3)

> **Leitprinzip:** Erst ein klickbarer, testbarer Prototyp auf Demo-Daten — Infrastruktur (Datenbank, Auth, E-Mail) kommt erst, wenn Produkt und Fragebogen validiert sind. Damit beim Umstieg nichts weggeworfen wird, gelten zwei Architekturregeln ab Tag 1:
> 1. **Domänenlogik als pure functions** in `lib/domain/` (KPI-Berechnung, Trigger-Engine, Fragen-Rotation, k-Anonymität) — ohne IO, vollständig mit Vitest getestet. Diese Schicht überlebt alle Phasen unverändert.
> 2. **Datenzugriff hinter einem Interface** (`lib/data/store.ts`): Phasen 1–3 nutzen einen `MemoryStore` (In-Memory + Seeds aus dem Repo), Phase 4 ergänzt den `SupabaseStore`. UI und Domäne kennen nur das Interface.
>
> Arbeitsweise: Jede Phase als eigener Branch/PR-Satz; Akzeptanzkriterien am Ende abhaken; Annahmen in `DECISIONS.md` dokumentieren statt raten.

### Phase 0 — Setup (½ Tag)
Next.js 15 + TypeScript (strict) + Tailwind + shadcn/ui · Vitest (+ Playwright vorbereitet) · KEIN Supabase, keine Secrets/Env nötig · `SPEC.md`, `CLAUDE.md`, `DECISIONS.md` im Repo-Root.
**Akzeptanz:** `pnpm dev` läuft ohne externe Dienste; CI (Typecheck + Unit-Tests) grün.

### Phase 1 — Klickbarer Survey-Prototyp (Woche 1) — ohne Datenbank
Fragebogen v1.1 (Abschnitt 12) als TypeScript-Seeds in `lib/seed/questions.ts` (Du- UND Sie-Variante) · Survey-Runner mobile-first (eine Frage pro Screen, Fortschritt, Freitext überspringbar, < 60 Sek) · alle vier Flows: Onboarding, Weekly (Rotation + Conditional Logic aus `lib/domain/`), Monthly, Leadership · **Demo-Modus statt Login:** Rollen-/Personen-Umschalter in der UI (Dropdown „Ansicht als: Mitarbeiterin Marketing · Teamleiter Vertrieb · Geschäftsführung") · Antworten landen im `MemoryStore`.
**Akzeptanz:** Pulse am Handy in < 60 Sek durchspielbar; Rotation-Constraints und Conditional Logic per Unit-Test belegt; App läuft komplett ohne Netzwerk-/DB-Zugriff.

### Phase 2 — Dashboard auf synthetischen Daten (Woche 2)
Demo-Daten-Generator: 6 Wochen realistische Antworten für die 3 Seed-Orgs (Abschnitt 16.3) — mit eingebauten Auffälligkeiten, damit jede Dashboard-Sektion etwas zeigt (eine Abteilung mit n = 4 → k-Anonymität sichtbar; ein bezahltes Tool ungenutzt → Trigger R5; Gap > 3 Punkte → Trigger R6) · KPI-Engine (Abschnitt 10) und Trigger-Engine (Abschnitt 11) als pure functions inkl. Tests · Dashboard: 4 Index-Kacheln mit Trend, ROI-Kachel, Heatmap, Perception Gap, Teilnahmequote, Empfehlungs-Cards, Freitext-Highlights · Monatsreport als **druckbare Route** (`/report/[org]/[monat]`, Browser-Print — noch kein PDF-Generator) · Demo-Steuerung: Button **„Woche simulieren"** erzeugt live die nächste Datenwoche.
**Akzeptanz:** Alle KPI-Formeln aus Abschnitt 10 unit-getestet (Klassenmitten, Invertierung, NPS, Gap); Abteilung mit n = 4 erscheint nirgends einzeln; mindestens 2 Empfehlungen werden ausgelöst; Report-Route druckt sauber.

### Phase 3 — Testrunde & GO/NO-GO (Woche 3)
Deployment als Vercel-Preview (keine Secrets nötig) · interne Testrunde bei dbrains · Demo beim Pilotkandidaten (Merlin) · Fragebogen-Validierung mit 5–10 Testpersonen (Verständlichkeit, Dauer, fehlende/überflüssige Fragen — wie im Notion-Konzept vorgesehen) · UX-/Wording-Iteration.
**Akzeptanz:** Feedback + Änderungen in `DECISIONS.md` dokumentiert; Fragebogen als v1.2 eingefroren; GO/NO-GO für den Infrastruktur-Ausbau liegt vor.

### Phase 4 — Persistenz, Auth & erste echte Testteilnehmer (Woche 4–6)
**Jetzt erst:** Supabase EU anbinden · Migrationen für das Datenmodell (Abschnitt 6) + RLS-Policies · `SupabaseStore` implementiert das Store-Interface — UI und Domäne bleiben unverändert · Magic-Link-Auth + Rollen · Org-Setup-Admin (Flow F1) · Einladungs-Flow (CSV → Mails) · Anonymitätskonzept (Abschnitt 7) vollständig: Trennung participations/responses, Pseudonym-Token · Zyklen-Cron + Reminder · **erste echte Testteilnehmer: dbrains-intern als „Org 0"** (Dogfooding vor dem Piloten).
**Akzeptanz:** Zwei Orgs strikt isoliert (RLS-Test); `responses` nachweislich ohne User-Verknüpfung (Test); interner Testlauf mit ≥ 5 echten Teilnehmenden über eine Woche erfolgreich (Einladung → Pulse → Aggregation).

### Phase 5 — Pilot-Hardening (Woche 6–8)
PDF-Monatsreport ersetzt die Print-Route (+ Mailversand + Archiv) · DSGVO: Datenexport, Org-Löschung, Hinweisseiten · **Betriebsrat-/DSB-Zweiseiter** (Abschnitt 7 als 2-Seiten-PDF) · Rate-Limiting, Error-Monitoring (Sentry EU), Backups · Playwright-E2E für die Flows F1–F7 · Pilot-Runbook (Org anlegen → Kickoff → Woche-1-Betreuung).
**Akzeptanz:** E2E grün; Lighthouse mobil > 90 für den Survey-Runner; Runbook getestet; Pilot 1 (Merlin) kann ohne Entwickler-Eingriff starten.

**Meilensteine:** Ende Woche 2 = vorführbarer Prototyp · Ende Woche 3 = validiert + GO · Ende Woche 8 = Pilot 1 live.

---

## 14. Entscheidungslog & verbleibende offene Punkte

**Entschieden (14.07.2026):**
- Stack: Next.js 15 + Supabase EU (Hosting-Default Vercel fra1)
- Multi-Tenant ab Tag 1, schlanke Variante (kein Self-Service, kein Billing)
- Freitext-KI-Auswertung (Claude API): Post-MVP — MVP zeigt Freitexte roh auf Org-Ebene
- Pilot-Kandidaten: Merlin Technology (Pilot 1), SPAR Österreich ODER REWE (Pilot 2, Enterprise) — Sequenz & Profile in Abschnitt 16
- Sie/Du als Org-Setting im MVP (`form_of_address` + `text_sie`-Varianten)
- **Prototype-first-Roadmap (v1.3):** Phasen 1–3 = klickbarer Prototyp auf Demo-Daten ohne Datenbank/Auth/E-Mail; Supabase, Einladungen & echte Testteilnehmer ab Phase 4

**Noch offen (blockiert Phase 0 nicht; bis Ende Phase 1 klären):**
1. **Pilot-Bestätigung:** Kontaktstatus je Kandidat (Bestandskunde? Ansprechpartner? Scope-Zusage?) — und die Wahl SPAR vs. REWE für Pilot 2 (nicht beide parallel, s. 16.1).
2. E-Mail-Provider mit EU-Versand (Resend vs. Brevo vs. Scaleway TEM).
3. Domain/Branding (z. B. barometer.dbrains.ai?).
4. Hosting-Feinentscheidung nur falls „EU-only ohne US-Anbieter" hart gefordert wird (bei SPAR/REWE-Einkauf aktiv abfragen) → dann Hetzner + Coolify statt Vercel; Architektur bleibt identisch.

---

## 15. Post-MVP-Backlog (aus altem Konzept übernommen + neu priorisiert)

1. **Claude-API-Auswertung der Freitexte** (Themen-Clustering, Sentiment, automatische Use-Case-Bibliothek) — höchster Hebel nach MVP
2. **Lernplattform-API-Integration** (Kurs-Absolvierung automatisch tracken → echtes Wirkungs-Tracking Kurs → KPI)
3. AI-Act-Nachweis als eigenständiger, revisionssicherer Export (nicht nur Report-Abschnitt)
4. Mehrsprachigkeit (EN), Sie-Form vollständig
5. MS-Teams-/Slack-Befragung (Pulse direkt im Chat-Tool — großer Teilnahme-Hebel)
6. Benchmarks (anonymer Branchen-/Größenvergleich — erst ab ~10 Kunden sinnvoll)
7. SSO/SAML für Enterprise, White-Label für Partner
8. Individuelle Zusatzfragen pro Org (Fragen-Editor für org_admin)
9. Gamification (Badges, Team-Score)
10. **Deskless-Zugang** (QR-Code-/Kiosk-Token-Befragung ohne individuelle E-Mail) — Voraussetzung für Filial-/Produktions-Rollout bei Handel & Fertigung (SPAR/REWE-Filialen, Merlin-Produktion & Außendienst)

---

## 16. Pilotstrategie & Seed-Profile (Stand 14.07.2026)

### 16.1 Kandidaten & Sequenz

**Pilot 1 — Merlin Technology GmbH (Tumeltsham, OÖ):** Familiengeführter Hersteller für Luftbefeuchtung, adiabate Kühlung, Staubbindung und Messtechnik (gegründet 1995, ~80 % Exportquote in 80+ Länder, Referenzen u. a. IKEA, BMW, Canon; M365-Umgebung vorhanden). Klassischer produzierender Mittelstand — exakt die Kernzielgruppe aus Abschnitt 2. Kurze Entscheidungswege → End-to-End-Validierung direkt nach MVP-Fertigstellung (Woche 8). **Pilot-Scope:** Büro-/Wissensarbeitsplätze (Vertrieb/Export, Technik/Entwicklung, Marketing, Verwaltung, Service-Innendienst); Produktion & Außendienst-Techniker erst mit Deskless-Zugang (Backlog #10). Betriebsrats-Abstimmung auch hier prüfen, aber deutlich schlanker als im Konzern.

**Pilot 2 — SPAR Österreich ODER REWE (Zentralbereich):** Enterprise-Pilot mit hohem Referenzwert. Scope strikt auf einen Zentralbereich begrenzen (z. B. Einkauf/Category Management, Marketing, HR, IT — 100–300 MA), **KEINE Filialen im MVP** (Filialpersonal hat i. d. R. keine individuelle Firmen-E-Mail). Vorlauf parallel ab ~Woche 4 starten: Betriebsrat (Mitarbeiterbefragungen sind mitbestimmungspflichtig → Betriebsvereinbarung), Konzern-Datenschutz (AVV, TOMs), Einkaufsprozess.

**Wichtig:** SPAR und REWE sind direkte Wettbewerber im österreichischen Lebensmittelhandel. Nicht beide parallel pilotieren — einen wählen (wärmster Kontakt entscheidet), der andere wird Kunde nach Launch. Vertraulichkeit und „keine Cross-Benchmarks" vertraglich zusichern.

### 16.2 Enterprise-Anforderungen, die das MVP jetzt abdeckt

- Sie-Form via `org.form_of_address` (entschieden, s. Abschnitt 14)
- k-Anonymität pro Org konfigurierbar (Default 5, nur erhöhbar) — falls der Betriebsrat eine höhere Schwelle fordert
- Betriebsrat-/DSB-Zweiseiter aus Abschnitt 7 (Phase-5-Deliverable) — zentrale Freigabe- und Vertriebsunterlage
- CSV-Einladung muss Listen mit 300+ Adressen sauber verarbeiten (Duplikate, Bounces, Statusliste)

### 16.3 Seed-Profile (Platzhalterwerte — vor Pilotstart mit dem Kunden verifizieren!)

**Org A — Merlin Technology** (`form_of_address`: 'sie' als sichere Annahme, ggf. auf 'du' umstellen)
- Abteilungen (grob schneiden, damit k ≥ 5 pro Abteilung hält): Vertrieb & Export · Technik & Entwicklung · Verwaltung & Finanzen · Marketing · Service-Innendienst
- Tools: Microsoft Copilot 365, ChatGPT, DeepL (Export in 80+ Länder → Übersetzungen als naheliegender Top-Use-Case)
- hourly_rate_default: 65 €
- Erwartete Use-Case-Schwerpunkte: mehrsprachige Angebots-/Exportkorrespondenz, technische Doku, Service-Berichte

**Org B — SPAR Österreich, Scope „Zentrale"** (`form_of_address`: 'sie')
- Abteilungen: Einkauf/Category Management · Marketing · IT/Digital · HR · Finanzen/Controlling · Logistikplanung
- Tools: Microsoft Copilot 365, ChatGPT (Team/Enterprise), DeepL
- hourly_rate_default: 50 € (F5 überschreibt pro Team)
- Erwartete Use-Case-Schwerpunkte: Lieferantenkorrespondenz, Sortiments-/Marktanalysen, Content-/Aktionstexte, Stellenanzeigen (hohe Fluktuation im Handel)

**Org C — REWE, Scope Zentralbereich** (`form_of_address`: 'sie')
- Abteilungen: Einkauf · Marketing · IT · HR · Controlling · Supply-Chain-Planung
- Tools: Microsoft Copilot 365, ChatGPT, ggf. interne KI-Lösung
- hourly_rate_default: 50 €

Alle drei Profile als `seed/orgs.demo.ts` mit `is_demo = true` anlegen — inklusive generierter Demo-Antworten über 6 Wochen, damit Dashboard, Gap-Ansicht, Empfehlungs-Trigger und Monatsreport vor dem echten Piloten realistisch getestet werden können.

---

## Anhang: Referenzen

- Notion: „Produkt: KI Barometer" (Hauptseite, Notizen Juli 2026)
- Notion: „KI-Barometer – Strategisches Konzept" (Mai 2026 — Geschäftsmodell/Preise dort weiterhin gültig)
- Notion: „KI-Barometer – Fragebogen" (Mai 2026 — Fragen-Volltexte für Seeds)
- Problemanalyse-Quellen (Juli 2026): DIHK-Digitalisierungsumfrage 2026 (n=5.000), Bitkom/IfM 2026 (41 % Adoption), MIT NANDA „GenAI Divide", Writer „Enterprise AI Adoption 2026" (Perception Gap, 29 % ROI), Blu Interface „KI-Adoption" (Bekanntmachen/Befähigen/Einbetten)
