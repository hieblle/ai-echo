# DECISIONS.md — KI-Barometer

Annahmen und Abweichungen von der SPEC werden hier dokumentiert (CLAUDE.md:
„Bei Unklarheit: beste Annahme treffen, in `DECISIONS.md` eintragen,
weiterarbeiten"). Neueste Einträge oben.

---

## Offene Punkte (Stand Phase 4, 2026-09-25)

- [ ] **Supabase-Projekt anlegen und Keys eintragen** (Cloud-Umgebung, Vercel,
      lokal) → Migration einspielen, Integrationstests laufen lassen, Org 0
      anlegen. Anleitung: `docs/SETUP-PHASE4.md`.
- [ ] **Supabase Auth konfigurieren:** Site URL + Redirect URLs auf die
      Vercel-Domain; vor dem Dogfooding mit ≥ 5 Personen einen Custom-SMTP
      hinterlegen (Standardversand hat ein sehr niedriges Stundenlimit).
- [ ] **Phase-4-Akzeptanz nachweisen:** Zwei-Org-Isolationstest gegen die
      echte Datenbank (Integrationssuite) und interner Testlauf mit ≥ 5
      Teilnehmenden über eine Woche (Einladung → Pulse → Aggregation).
- [ ] **Hosting vor Kundenveröffentlichung:** Vercel Pro oder anderer Anbieter
      (D3.1). Bis dahin Vercel Hobby.
- [ ] **E-Mail-Lösung für Massenversand/Skalierung:** Anbieter (Brevo, Resend,
      Postmark, SES, …) und Orchestrierung (App-intern, n8n, Agenten) — D3.2.
      Phase 4 kommt mit Login-Links aus.
- [ ] **Supabase-Tarif:** Free für die Entwicklung; Pro vor dem ersten
      Kundenpiloten (Free pausiert nach Inaktivität, keine Backups).
- [ ] **Externes Testfeedback** (Testpersonen, Merlin-Demo) wird ggf.
      nachgereicht → Fragebogen dann als v1.2 einfrieren.
- [ ] **Betriebsrat-/DSB-Zweiseiter** (Phase 5) muss die ehrliche
      Anonymitätszusage aus D3.3 (4) enthalten.

---

## Phase 4 — Persistenz, Auth & erste echte Testteilnehmer (2026-09-25, in Umsetzung)

Umgesetzt nach SPEC.md §13 (Phase 4) auf Basis der Leitplanken D3.1–D3.3.
Stand: Code vollständig (Schema + RLS, `SupabaseStore`, Magic-Link-Login,
Rollen, Mitglieder-Befragungsfluss mit Zyklen und Teilnahmen, rollenbasiertes
Dashboard, Org-Setup, Einladungen, Cron), Unit-Tests und Schema-Guards grün.
Die Integrationstests gegen Supabase und der interne Testlauf (Org 0) folgen,
sobald das Projekt angelegt ist (`docs/SETUP-PHASE4.md`). Die Demo-Routen
laufen unverändert ohne Infrastruktur weiter.

### D4.1 — Fragebogen und Regeln bleiben im Repo, nicht in der DB
SPEC §5/§6 sehen Tabellen `survey_templates`, `questions` und
`recommendation_rules` vor. Für den Piloten bleiben Fragen (v1.2-Kandidat)
und Regeln versionierte Seeds in `lib/seed/`; der `SupabaseStore` bekommt
sie beim Bau übergeben. Gründe: eine Quelle der Wahrheit, keine Sync-Logik,
jede Änderung läuft durch Review und Tests. Tabellen kommen, sobald
org-spezifische Fragen (Backlog #8) oder Kurs-URLs pro Org gebraucht werden.
`cycle_questions` entfällt ebenfalls: die Org-Ziehung ist deterministisch aus
(Org, Woche) reproduzierbar (D1.x).

### D4.2 — Respondent-Key per HMAC statt Client-Token
SPEC §6 wollte ein Pseudonym-Token im `user_metadata` des Users. Umgesetzt:
`respondent_key = HMAC-SHA256(PSEUDONYM_SECRET, membership_id)`, serverseitig
berechnet, nirgends gespeichert. `respondent_profiles` kennt nur diesen Hash,
`responses` gar keinen Schlüssel (Schema-Test erzwingt das). Ehrliche Zusage:
Eine Verknüpfung Profil ↔ Person braucht Datenbank UND App-Secret;
gegenüber dbrains als Betreiber (hat beides) ist die Unverknüpfbarkeit
organisatorisch (AVV, Vier-Augen-Prinzip), nicht technisch. Eine Rotation des
Secrets verwaist alle Profile (Onboarding wäre neu nötig) — Secret sichern.
SPEC §6 entsprechend korrigiert.

### D4.3 — Mandantentrennung: Server-Schicht zuerst, RLS als zweite Linie
Der `SupabaseStore` läuft mit dem Service-Role-Key (umgeht RLS). Die
Isolation sitzt in `lib/server/auth.ts`: jede Produktroute löst den Viewer
(serverseitig verifizierter JWT) und seine Mitgliedschaft auf; der Store
bekommt nur die `org_id` einer verifizierten Mitgliedschaft. RLS ist trotzdem
auf allen Tabellen aktiv: Mitglieder dürfen per Anon-Key nur ihren
Org-Kontext lesen (Org, Abteilungen, Tools, eigene Mitgliedschaft, Zyklen,
eigene Teilnahmen); `responses`, `respondent_profiles` und
`recommendation_states` haben KEINE Client-Policies, anonyme Clients lesen
gar nichts. Abweichung von D3.3 (2), das Dashboard-Lesezugriffe im
Nutzerkontext vorsah: per RLS lesbare Rohantworten hätten Teamleitungen
Zeilen unterhalb von k über die API zugänglich gemacht — Rohantworten
erreichen nie einen Browser-Client (SPEC §7.2). Der Integrationstest prüft
beides (wird ohne Keys übersprungen).

### D4.4 — Zyklen binden Antworten an ihre Woche
Mitglieder beantworten Pulse nur in einem OFFENEN Zyklus. `created_week` und
der logische `cycle_id` (`weekly-2026-W39`, auch in der DB ein Textschlüssel,
kein FK) sind die Woche des Zyklus, nicht die Wanduhr: alle Mitglieder teilen
eine Org-Ziehung, Dashboard und Report scopen konsistent, ein Zyklus darf
über die Wochengrenze offen bleiben. Onboarding hat keinen Zyklus (aktuelle
Woche). Duplikat-Schutz ist die `participations`-Zeile (`completed_at` auf
die Stunde gerundet); die Profil-Liste `completed_cycles` ist nur noch Demo.
Reihenfolge beim Absenden: Antworten schreiben, dann Teilnahme abschließen —
ein Wettlauf zweier Absendungen ist theoretisch möglich und akzeptiert.

### D4.5 — Rollen-Sicht im Dashboard (SPEC §7.4)
`team_lead`: nur die eigene Abteilung; die komplette Ansicht ist unterdrückt,
wenn die Abteilung im Zeitraum unter k liegt, Wochenwerte werden einzeln
k-geprüft; ROI, Empfehlungen und Freitexte sind Org-Ebene und nicht Teil der
Team-Sicht; die Teilnahmequote ist org-weit (eine Team-Quote bräuchte einen
Personen-Join). `employee`: keine Dashboard-Route, nur Teilnahmequote und
Stimmung org-weit auf `/app` (Transparenz). `org_admin`: alles inkl. Report.
`platform_admin` (dbrains): alle Orgs, aber keine Befragungen ohne eigene
Mitgliedschaft — Admins sind keine Respondenten.

### D4.6 — Bootstrap, Migrationen, Mail, Cron
- **Supabase-Keys:** neues Key-System (`sb_publishable_…` für Browser und
  Nutzersessions, `sb_secret_…` für den Server-Store und Auth-Admin) statt
  der Legacy-JWTs `anon`/`service_role`. Variablen
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`, die alten
  Namen bleiben als Fallback lesbar. `lib/server/env.ts` weist vertauschte
  Keys ab, weil der Publishable-Wert an Browser geht (`/auth/finish`).
  supabase-js ≥ 2.7x sendet beide Formate korrekt (`apikey`-Header, Secret
  nie als Bearer).
- `platform_admin` per `PLATFORM_ADMIN_EMAILS` (statt Tabelle): Bootstrap
  ohne DB-Eingriff, 1–3 dbrains-Adressen; nur diese dürfen sich ohne
  Einladung anmelden (Self-Signup bleibt aus, SPEC §4.1).
- Migrationen: `scripts/db-migrate.mjs` (pg) statt Supabase-CLI, schreibt
  aber in die CLI-Tabelle `supabase_migrations.schema_migrations`, damit
  `supabase db push` später nahtlos übernehmen kann.
- Mail (D3.2): ausschließlich Login-Links über Supabase Auth — Einladung =
  `inviteUserByEmail`, Pulse/Reminder = `signInWithOtp`. Versand hinter dem
  `Mailer`-Interface; `MAIL_PROVIDER=console` nur ohne Supabase sinnvoll.
  Einladungen laufen sequenziell; bei 300+ Adressen (SPEC §16.2) vorher
  Custom-SMTP und Rate-Limits in Supabase prüfen.
- Cron (D3.1): eine tägliche Route entscheidet selbst (Montag → Pulse,
  letzter Werktag → Monat + Führung, immer abgelaufene Zyklen schließen),
  Reminder donnerstags — so reichen zwei Crons auch auf Vercel Hobby.
  Zeiten in UTC (07:00/08:00 ≈ 09:00/10:00 Wien im Sommer).
- Org-Admins können Zyklen manuell öffnen/schließen und Erinnerungen
  auslösen (erster Testlauf, Demo beim Kunden).

### D4.7 — Bewusst nicht in Phase 4
Datenexport/Org-Löschung (Phase 5, DSGVO-Basics), PDF-Report und
Mailversand des Reports (Phase 5), Bounce-Tracking für CSV-Einladungen über
das Ergebnis-Resümee hinaus, Team-Teilnahmequote, Kurs-URLs pro Org.

---

## Phase 3 — Testrunde & GO/NO-GO (2026-09-25)

Interne Testrunde bei dbrains durchgeführt, kein Änderungsbedarf am
Fragebogen gemeldet; externes Feedback (5–10 Testpersonen, Merlin-Demo) wird
nachgereicht, falls es kommt. Bis dahin bleibt Fragebogen v1.1 unverändert
und gilt als v1.2-Kandidat. Deployment läuft als Vercel-Preview auf dem
Arbeitsbranch (`vercel.json` pinnt das Next.js-Preset). **GO für den
Übergang in Phase 4** (Persistenz, Auth, erste echte Testteilnehmer).

### D3.1 — Hosting: Vercel bis zur Kundenveröffentlichung, danach offen
Für Phase 4 und die interne Nutzung (Org 0) bleibt die App auf Vercel
(Hobby). Vor der Veröffentlichung beim ersten Kunden ist zu entscheiden:
**Vercel Pro** (die Hobby-Bedingungen erlauben keine kommerzielle Nutzung;
Pro hebt außerdem die Cron-Beschränkungen auf) **oder ein anderer Anbieter**
(Docker-fähig: Railway, Render, Fly.io, Hetzner + Coolify). Ein eigener
Server ist keine Option (Betriebsaufwand ohne Nutzen). Damit der Wechsel
unter einem Tag bleibt, gelten ab Phase 4 Portabilitätsregeln:
1. Keine Vercel-exklusiven Features (kein Vercel KV/Analytics/Edge-Sonderweg).
2. Cron-Aufgaben (Zyklus öffnen, Reminder, Report) als abgesicherte Route
   Handler unter `/api/cron/*`; der Zeitplan liegt außerhalb der App
   (`vercel.json` heute, jeder Scheduler morgen).
3. `output: "standalone"` in `next.config`, Region `fra1` in `vercel.json`.
4. Secrets ausschließlich in Vercel, `.env.local` und der Cloud-Umgebung —
   nie im Repo.

Bewusste Bindung: **Supabase EU (Frankfurt)** für Auth, RLS und Migrationen.
Darunter liegt normales PostgreSQL (Open Source, `pg_dump`), ein Anbieter-
wechsel dort wäre aber Wochen, nicht Stunden — akzeptiert, wie in SPEC §14
seit Tag 1 vorgesehen.

### D3.2 — E-Mail: Phase 4 nur Login-Links, Massenversand offen
Phase 4 verschickt nur die technisch nötigen Auth-Mails (Magic Link,
Einladung) über den Supabase-eigenen Versand. Der hat ein sehr niedriges
Stundenlimit und eine Supabase-Absenderadresse — für dbrains-intern (Org 0)
ausreichend; falls das Limit beim Dogfooding stört, kann in Supabase Auth ein
beliebiger SMTP-Zugang hinterlegt werden (reine Konfiguration, keine
Codeänderung). Pulse-/Reminder-Mails werden in Phase 4 über denselben Weg
minimal umgesetzt.

Offen bleibt die Lösung für **Massenversand bei Skalierung** — Anbieter
(Brevo/EU, Resend/EU-Region, Postmark, Amazon SES) und Orchestrierung
(App-intern, n8n, Agenten). Unabhängig von der Wahl nötig: verifizierte
Absender-Subdomain (z. B. `barometer.dbrains.academy`) mit SPF/DKIM/DMARC
und ein AVV mit dem Anbieter (verarbeitet Namen und Mailadressen der
Mitarbeitenden). Architekturvorgabe für Phase 4: Versand hinter einem eigenen
Interface (`lib/mail/`, analog zum Store) mit `ConsoleMailer` für Tests und
Entwicklung, damit der Anbieter später ohne Änderung an den Flows
austauschbar ist.

### D3.3 — Leitplanken für Phase 4 (aus der Architektur-Review)
Verifiziert: Domäne pur und getestet; `Store`-Interface vollständig;
Backend-Tausch an genau einer Stelle (`lib/server/store-instance.ts`); alle
Datenzugriffe serverseitig (Server Actions, `dashboard-service.ts`), Roh-
antworten erreichen den Client nie; `submitResponses` nimmt typseitig keine
Personen-Kennung an. Für die Persistenz gilt:
1. **Store-Weiche per Umgebungsvariable:** `memory` für die Demo-Route
   („Woche simulieren" bleibt als Sales-Demo), `supabase` für echte Orgs —
   keine Demo-Daten in der Produktivdatenbank.
2. **RLS statt Vertrauen in Filter:** Dashboard-Lesezugriffe im Nutzerkontext
   (RLS greift); der Service-Role-Key nur für den anonymen Schreibpfad der
   Antworten. Zwei-Org-Isolationstest ist Akzeptanzkriterium (SPEC §13).
3. **Aggregation bleibt vorerst im Server:** `listResponses` bekommt einen
   Wochenfilter (billig, verschiebt das Problem weit); Aggregation in SQL /
   `aggregates`-Tabelle erst bei Enterprise-Skalierung (SPAR/REWE).
4. **Anonymität ehrlich formulieren:** D1.17 vor der Implementierung
   abarbeiten. SPEC §6 („Token liegt nur clientseitig") ist technisch falsch —
   `user_metadata` liegt in `auth.users`. Vollständige Unverknüpfbarkeit
   gegenüber dem DB-Admin ist bei Rotation pro Person nicht erreichbar; die
   vertretbare Zusage lautet: keine Verknüpfung in den Anwendungsdaten, nur
   k-anonymisierte Ausgaben, DB-Zugriff nur bei dbrains unter AVV. Token
   nur gehasht speichern, `question_history` älter als Vorwoche löschen,
   SPEC §6 entsprechend korrigieren.

---

## Phase 2 — Dashboard auf synthetischen Daten (2026-07-15)

Umgesetzt nach SPEC.md §13 (Phase 2). Akzeptanz verifiziert: alle §10-Formeln
unit-getestet (Klassenmitten, Invertierung, NPS, Gap); Abteilung mit n = 4
(Merlin Marketing) erscheint nirgends einzeln; 6 Empfehlungen feuern auf den
Demo-Daten (Merlin: R5 · SPAR: R4+R6 · REWE: R1+R3+R7 — per End-to-End-Test
auf exakt diese Kombination gepinnt); Report-Route druckt sauber (Print-CSS
im Browser verifiziert).

### D2.1 — KPI-Konventionen (lib/domain/kpi.ts)
Respondenten-Proxy für anonyme Zeilen = MAX Antwortzahl eines einzelnen
Fragecodes im Betrachtungsraum (bester Unterschätzer, da jede Person eine
Frage höchstens einmal pro Zyklus beantwortet). Indizes als Mittel der
Frage-Mittelwerte („Mittel aus X und Y", §10), fehlende Seite fällt auf die
andere zurück. ROI konservativ: nur Σ W2.1-Klassenmitten der letzten 4 Wochen,
M1.1-Selbstschätzungen fließen bewusst NICHT ein (§10 „konservativ");
Hochrechnung als Zweitwert über die Ø-Teilnahmequote. M1.3 ist monatlich und
wird beim kombinierten Effizienzindex nicht wochen-gefiltert. Baseline =
Mittel der ersten beiden Pulse-Wochen (der Onboarding-Teil der SPEC-Baseline
hat keine Index-Quellen). Fehlgeformte Antworten werden still ignoriert.

### D2.2 — Dünne-Stichproben-Guard für die Adoption (Verifikations-Fund)
Produkteigenheit: In Wochen, in denen die Rotation W1.1 nicht zieht, stammen
die einzigen W1.1-Antworten von Nicht-Nutzern (Kurz-Pulse, per Definition
„none") — der Wochenwert wäre strukturell verzerrt (Screenshot zeigte 0 %
neben 70 % in der Heatmap). Fix: `WEEKLY_ADOPTION_MIN_SAMPLE = 5` (Stich-
probenboden, KEINE k-Anonymität); Wochen darunter gelten nicht als Evidenz —
Trigger R1 überspringt sie, die Sparkline zeigt eine Lücke, die Kachel nutzt
`pooledAdoption` über 4 Wochen (Baseline: erste 2 Wochen gepoolt).

### D2.3 — Heatmap: k-Qualifikation pro Abteilungs-Woche
Zelle aggregiert nur Wochen, in denen der Abteilungs-Respondenten-Proxy
`meetsKAnonymity(n, k)` erfüllt; keine qualifizierte Woche ⇒ Zelle zeigt
„n < k" statt eines Werts. Org-Gesamtzeile ohne Unterdrückung. Adoption auf
der 0–10-Farbskala als Anteil × 10.

### D2.4 — Trigger-Semantik (lib/domain/triggers.ts)
Alle Schwellen strikt (< bzw. >, Grenzwert feuert nicht). R3 „sinkt 3 Zyklen
in Folge" = 4 Werte mit 3 strikten Rückgängen (Plateau bricht die Serie).
R5-Nutzung = W1.2-„meistgenutzt"-Anteil im Fenster, Daten-Guard: feuert erst
ab 10 W1.2-Antworten; Tool ohne Nennung zählt als 0 %. R6 nur bei positivem
Gap (> +3, Führung optimistischer — §2 P3 rahmt das Risiko so). R1/R7 werten
die letzten zwei Wochen MIT Daten. Kurs-URLs der Regel-Seeds sind Platzhalter
(academy.dbrains.example), bis die echten Deep-Links feststehen.

### D2.5 — Teilnahme als Aggregat-Statistik bis Phase 4
`ParticipationStat` (invited/completed pro Zyklus) statt personenbezogener
`participations`-Zeilen — das Dashboard braucht nur die Quote, und der
Prototyp bleibt frei von Fake-Personendaten. Phase 4 ersetzt das durch das
echte §6-Modell.

### D2.6 — Empfehlungen werden abgeleitet, nur der Status wird gespeichert
Cards entstehen bei jedem Rendern regelbasiert aus den Daten; persistiert
wird ausschließlich die org_admin-Entscheidung (done/dismissed) mit Schlüssel
(rule_key, context) — kein Duplikat-Bookkeeping, Re-Evaluation bleibt Quelle
der Wahrheit.

### D2.7 — Demo-Daten-Generator (lib/seed/demo-data.ts)
Deterministisch (seeded PRNG, Quoten-Zuteilung nach größtem Rest, damit die
Zielwerte exakt halten); Wochen müssen konsekutiv sein (Ausschluss-Kette der
Rotation). Weekly-Codes kommen aus der ECHTEN Rotation inkl. Vorwochen-
Ausschluss; ~10 % Nicht-Nutzer je Org beantworten die Kurzvariante (dadurch
gibt es jede Woche W1.1-Daten). Monats-/Leadership-Zyklen bei
weekIndex % 4 === 3; „Woche simulieren" setzt exakt diese Kadenz fort.
Monats-Respondenten werden als frische Zeilen modelliert (~70 % der
Wochen-Respondenten); der zusätzliche Org-Lead trägt department_id null.
Datei heißt `orgs-demo.ts` (statt `orgs.demo.ts` aus §16.3 — konsistent mit
dem übrigen Namensschema). Eingebaute Auffälligkeiten: Merlin Marketing
Headcount 4 (k-Anonymität), Merlin Copilot bezahlt & <15 % genutzt (R5),
SPAR M5.1↔F6-Gap ≈ 4,3 (R6) + Prompt-Engineering-Wunsch ≈ 49 % (R4), REWE
Adoption < 50 % durchgängig (R1) + W4.2 fällt 4 Wochen strikt (R3) +
Teilnahme zuletzt 2× < 40 % (R7); REWE-Vertrauen bleibt ≥ 5,5 (R2 feuert
bewusst nicht).

### D2.8 — Store-Seeding beim ersten Zugriff, getStore() ist async
Der Singleton generiert beim ersten Zugriff 6 ABGESCHLOSSENE Wochen (bis zur
Vorwoche) für die drei §16.3-Orgs; Musterwerk bleibt leer (interaktive
Survey-Demo). getStore() liefert jetzt ein Promise (memoisiert auf
globalThis), damit das Seeding vor dem ersten Read abgeschlossen ist.

### D2.10 — W1.1 ist Anker jeder Wochen-Ziehung (revidiert D1.3, Review-Fund)
Die adversariale Review wies nach: Bei SPAR zog die Rotation W1.1 im gesamten
Live-Fenster nie — die einzigen W1.1-Antworten kamen von den Nicht-Nutzern
(Kurz-Pulse, per Definition „none"), das Dashboard zeigte 0 % statt ~63 % und
R1 feuerte falsch; der Stichprobenboden aus D2.2 war bei ≥ 50 Respondenten
strukturell wirkungslos. §9 („nie zweimal in Folge") und §10 („Anteil an allen
W1.1-Antworten DER WOCHE" als Leitkennzahl) stehen hier im Konflikt —
aufgelöst zugunsten von §10: `WEEKLY_ANCHOR_CODES = ["W1.1"]` ist Teil JEDER
Ziehung, von Ausschluss und persönlicher Ersetzung ausgenommen (wöchentlich
dieselbe Kernfrage ist gängige Pulse-Praxis). Die No-Repeat-Regel gilt
unverändert für alle übrigen Fragen (60-Wochen-Regressionstest). D2.2 bleibt
als Defense-in-Depth bestehen.

### D2.11 — F5 fließt in den ROI (Review-Fund)
§12: „F5 Ø-Stundensatz Team (fließt in ROI)". Der ROI nutzt jetzt den
Mittelwert der F5-Antworten im Betrachtungsfenster (Fallback:
`hourly_rate_default`); die Quelle wird in Dashboard/Report ausgewiesen.

### D2.12 — Härtungen aus der zweiten Review-Runde
- **simulateWeek serialisiert** (globalThis-Promise-Kette): Parallele Aufrufe
  (Doppelklick) hätten dieselbe Woche doppelt geschrieben — inkl. Aushebelung
  der k-Anonymitäts-Unterdrückung durch duplizierte Zeilen.
- **Report-Baseline = Programm-Baseline** (erste zwei Messwochen der Org),
  nicht die ersten Wochen des Berichtsmonats — sonst vergleicht jeder Report
  ab Monat 2 das Fenster mit sich selbst.
- **Monats-Scoping im Report:** Gap/NPS/Schulungswünsche/AI-Act-„aktuell"
  basieren auf dem jüngsten Monats-/Leadership-Zyklus ≤ Monatsende
  (ausgewiesen); alte Reports ändern sich nicht rückwirkend. O4 bleibt
  bewusst Programm-Baseline. Use-Case-Sektion filtert auf W2.2/M1.4.
- updateRecommendationStatus validiert Org + Regel (öffentlicher Endpoint);
  Heatmap unterscheidet „n < k" von „Keine Daten"; deutsche Dezimal-Kommas in
  Heatmap/Gap; fehlgeschlagenes Seeding wird nicht dauerhaft memoisiert;
  Baseline-Deltas erst ab 3 Wochen Historie (vorher strukturell „flat").
- **Vorperioden-Delta bewusst verschoben:** §10 nennt „gegen Baseline und
  Vorperiode"; die Kacheln zeigen Baseline-Delta + Sparkline (Vorperioden-
  Bewegung visuell). Explizites Vorwochen-Delta: Phase 3/Post-MVP.

### D2.13 — Generator-Rekalibrierung nach der zweiten Review-Runde
Die Trigger-Komposition der Demo-Daten ist jetzt per End-to-End-Test exakt
gepinnt (echte KPI-/Trigger-Pipeline über die generierten Daten) und bleibt
auch nach simulierten Zusatzwochen stabil: Tool-Gewichte deutlich von der
R5-Schwelle entfernt (SPAR DeepL 0,30 · REWE internal_ai 0,28 statt exakt
0,20); M3.2-Nebenthemen pro Zyklus hart < 0,27 gekappt (R4 nur SPAR/Prompt);
alle Trends absolut nach weekIndex verankert statt relativ zum Fensterende
(REWE-Stimmung fällt 0,25/Woche ab 7,0 mit Boden 2,0 → R3 überlebt ~20
simulierte Wochen; Merlin/SPAR-Stimmung pendelt ±0,3 als Anti-R3-Guard);
Nicht-Nutzer als FIXE Zahl je Org-Woche (stabile Quantisierung der
Exakt-Summen-Zuteilung). Freitext-Zeilen (kind "text") tragen department_id
null; Choice-Antworten mit Inline-Text behalten die Abteilung (bewusst — sie
sind Auswahlantworten, keine Freitexte im §7.3-Sinn).

### D2.9 — Dashboard-Darstellung
Viz-Tokens nur für Light Mode (Theme-Toggle existiert noch nicht); Recharts
nur für die Sparklines, Heatmap und Gap-Dumbbells als Server-SVG/HTML ohne
Client-JS; Kategorial-Paar (MA blau / FK grün) und sequentielle Blau-Rampe
aus der validierten Referenzpalette (Validator-Checks bestanden).
Report-Monat = Kalendermonat des Wochen-Donnerstags (ISO 8601).

---

## Phase 1 — Klickbarer Survey-Prototyp (2026-07-15)

Umgesetzt nach SPEC.md §13 (Phase 1). Akzeptanz: Pulse am Handy < 60 Sek
(mobil verifiziert: 5 Fragen, ~10 Interaktionen); Rotation + Conditional Logic
unit-getestet; App läuft ohne Netzwerk-/DB-Zugriff zur Laufzeit.

### D1.1 — Fragetexte wörtlich aus Notion, Format-Annotationen strukturell
Die 42 Fragen stammen wörtlich aus „KI-Barometer – Fragebogen" (Notion, Mai
2026) + F6/F7 aus SPEC §10. Widget-Annotationen der Quelle („(Mehrfachauswahl)",
„Skala 1–10", „____") stehen nicht im `text`, sondern in Struktur
(`type`, `options`). F6/F7 haben in der Quelle keine Skalen-Anker — gesetzt:
F6 „gar nicht klar"/„sehr klar" (spiegelt M5.1), F7 „sehr gering"/„sehr hoch".

### D1.2 — Kombinierte Fragetypen als single_choice mit Options-Erweiterung
„Ja → Welches? ____" (W1.3, W3.2, M3.3) und der M3.3-Skala-Nachklapp sind im
Typenkatalog (§6) nicht als eigener Typ vorgesehen. Modelliert als
`single_choice` mit `Choice.allows_text` bzw. `options.followup_scale` —
kein neuer Fragetyp nötig, Runner rendert inline.

### D1.3 — Weekly-Ziehung: Default 5 Fragen, deterministisch ohne Persistenz
SPEC erlaubt 3–5; Default = 5 (maximale Datendichte, immer noch < 60 Sek).
Ziehung ist deterministisch per seeded PRNG (xmur3 + mulberry32) aus
`orgId|isoWeek` bzw. `respondentKey|isoWeek` — dieselbe Woche liefert dieselbe
Ziehung, ohne dass `cycle_questions` persistiert werden muss (kommt in Phase 4).
Kein Anker: W1.1 ist NICHT in jeder Woche garantiert (Constraint „nicht zweimal
in Folge" schließt das aus); die KPI-Aggregation (Phase 2) rechnet mit den
W1.1-Antworten der Wochen, in denen die Frage gezogen wurde.

### D1.4 — Ersatzfrage: bei fehlendem Kandidaten bleibt die Originalfrage
Kollidiert die Org-Ziehung mit der persönlichen Historie und existiert kein
Ersatz derselben Dimension außerhalb der Historie, bleibt die Originalfrage
(einmalige Wiederholung schlägt schrumpfenden Pulse/verlorene Dimension).

### D1.5 — question_history = letzte ausgespielte Weekly-Ziehung
`{week, codes}` der zuletzt AUSGESPIELTEN Fragen. Nur eine FRÜHERE Woche zählt
als Historie: Wer den Pulse derselben Woche erneut öffnet, bekommt identische
Fragen (kein Ersatz gegen sich selbst).

### D1.6 — tools_used enthält nur Katalog-Tools
O2 „Andere: …" (Freitext) und „Aktuell keine" landen nicht in
`profile.tools_used` — nur Katalogwerte tragen Labels für W1.2/M2.1.
„Aktuell keine" ⇒ `uses_no_tools` ⇒ fixe Kurz-Pulse-Variante W1.1+W4.1+W4.2.

### D1.7 — Demo-Personas: 3 lt. SPEC + 1 Nicht-Nutzer, vor-geseedete Profile
Zusätzlich zur SPEC-Dropdown-Besetzung (Mitarbeiterin Marketing, Teamleiter
Vertrieb, Geschäftsführung) eine vierte Persona „Mitarbeiter IT (ohne
KI-Nutzung)", damit die Kurzvariante demonstrierbar ist. Personas starten mit
`default_tools` im Profil, damit Weekly/Monthly sofort spielbar sind;
Onboarding überschreibt das Profil. Datenschutz-Hinweis (4 Punkte aus der
Notion-Quelle) erscheint vor jeder Befragung, bis das Onboarding abgeschlossen
ist.

### D1.8 — Übersprungene Freitextfragen schreiben keine Response-Zeile
„Überspringen" speichert nichts für diese Frage (sauberer fürs Aggregieren);
Submit bleibt insgesamt atomar (ganz oder gar nicht, §9).

### D1.9 — Synthetische cycle_id in Phase 1
`cycle_id = "<template>-<ISO-Woche>"` (z. B. "weekly-2026-W29"). Echte
`survey_cycles` mit Status/Zeitfenstern kommen mit der Persistenz in Phase 4.
`created_week` bleibt die einzige Zeitangabe einer Antwort (§7).

### D1.10 — MemoryStore-Detailentscheidungen
Sequenzielle Response-IDs (r1, r2, …, deterministisch, kein Math.random);
Profile-Map-Key `org_id + NUL + respondent_key`; `created_week` wird nur gegen
das Format (\d{4}-W\d{2}) validiert; Fragenkatalog global (nicht org-scoped),
wie im Store-Interface definiert.

### D1.11 — Manuelles „Weiter" statt Auto-Advance
Vorhersehbarkeit vor Tap-Ersparnis: ~10 Interaktionen für einen 5-Fragen-Pulse,
mobil verifiziert deutlich unter 60 Sekunden.

### D1.12 — M2.1-Anker („gar nicht nützlich"/„unverzichtbar") entfallen im UI
Der `tool_matrix`-Options-Typ trägt keine Anker-Labels; die Skala 1–10 wird
ohne Anker gerendert. Bei Bedarf in Phase 2/3 als Options-Erweiterung nachrüsten.

### D1.13 — Monthly-Auswahl: 10 von 18 Fragen (Kern + Monats-Rotation)
SPEC §4.1/§8 verlangt 8–12 Fragen pro Monatsbefragung, der Katalog (§12) hat 18.
Auswahlregel: 5 Kernfragen IMMER (M1.1, M1.3 = ROI-Anker; M3.1, M5.1 =
Gap-Paar-Hälften — der Perception Gap braucht beide Seiten monatlich; M6.1 =
NPS) + 5 weitere deterministisch rotierend pro Org und Kalendermonat
(`orgId|YYYY-MM`-Seed). M2.1 entfällt zusätzlich für Tool-lose (Conditional).

### D1.14 — „Nie zweimal in Folge" strukturell statt per Fallback (Review-Fix)
Adversariale Review wies nach: Mit unabhängigen Wochen-Ziehungen brach die
No-Repeat-Regel in ~14 % der Personen-Wochen (Dimension „verstopft"). Fix in
zwei Schichten: (1) Die Org-Ziehung schließt die Ziehung der Vorwoche aus
(deterministisch rekonstruierbar, keine Persistenz nötig; bei Unmachbarkeit
wird der Ausschluss ignoriert statt geworfen). (2) Die persönliche Ersetzung
hat eine zweite Stufe: Gibt es keinen Kandidaten derselben Dimension, die
Dimension bleibt aber durch eine andere gezogene Frage abgedeckt, wird
dimensionsübergreifend ersetzt — die No-Repeat-Regel ist in §9 absolut,
Dimensionsabdeckung die einzige härtere Nebenbedingung. Regressionstest:
60-Wochen-Simulation auf dem echten Pool ohne einen einzigen Repeat.

### D1.15 — Doppel-Submit-Schutz über `completed_cycles` (Review-Fix)
Jede abgeschlossene Befragung wird als Zyklus-ID im Profil vermerkt
(`weekly-2026-W29` …); ein zweiter Submit desselben Zyklus wird abgelehnt,
Onboarding zusätzlich über `onboarding_completed` (einmalig lt. SPEC). Ohne
den Schutz hätte die Phase-2-Aggregation doppelt gezählt. Vorläufer des
Phase-4-`participations`-Konzepts. Demo-Hinweis: Server-Neustart setzt den
In-Memory-Store und damit auch diese Sperren zurück.

### D1.16 — Wissens-Tipps bleiben bewusst außerhalb des Store-Interfaces
Die Review markierte Seed-Direktimporte als Verstoß gegen Architekturregel 2.
Behoben für den Tool-Katalog (wird jetzt aus der O2-Frage des Stores
abgeleitet, `toolCatalogFromPool`). Die Wissens-Tipps bleiben als statischer
UI-Content direkt importiert: Sie sind kein Befragungs-/Auswertungsdatum und
haben keine Phase-4-Entsprechung im Datenmodell. Neu bewerten, falls Tipps
org-konfigurierbar werden.

### D1.17 — Anonymitäts-Vormerkungen für Phase 4 (aus der Review)
Jetzt harmlos (Demo-Daten), vor Phase 4 zwingend zu adressieren:
1. **Response-IDs nicht sequenziell** in der DB (Submission-Gruppen/-Reihenfolge
   rekonstruierbar) — UUIDs, keine `created_at`-Spalte.
2. **`question_history` ist ein potenzieller Fingerprint** (persönliche
   Ersatzfragen ⇒ ggf. einzigartiges Code-Set je Abteilung/Woche). Zudem
   widerspricht SPEC §6 sich selbst: Das Pseudonym-Token in Supabase
   `user_metadata` liegt server-seitig in `auth.users` — die Zuordnung
   Token↔User existiert dann doch. Vor Phase 4: Token nur gehasht speichern,
   SPEC korrigieren, `question_history` älter als Vorwoche löschen.
3. **k „nur erhöhbar"** ist noch nirgends erzwungen — der Phase-4-Settings-Pfad
   muss k < 5 ablehnen.
4. W1.2-/M2.1-Antworten spiegeln `tools_used` (zweiter Join-Kandidat) —
   akzeptiertes Restrisiko unter k-Anonymität, dokumentiert.

---

## Phase 0 — Setup (2026-07-14)

Umgesetzt nach SPEC.md §13 (Phase 0). Akzeptanz: `pnpm dev` läuft ohne externe
Dienste; CI (Typecheck + Unit-Tests) grün.

### D0.1 — Tailwind v3 statt v4
Tailwind **v3.4** gewählt (nicht v4). Grund: stabilste, am besten dokumentierte
Kombination mit shadcn/ui + Next.js 15; v4 (CSS-first-Config) bringt für den
Prototyp keinen Mehrwert, aber Migrationsrisiko. Umstieg auf v4 jederzeit
isoliert möglich.

### D0.2 — Manuelles Scaffolding statt `create-next-app`
Projekt manuell aufgesetzt (Configs, `app/`, `lib/`) statt via `create-next-app`.
Grund: volle Kontrolle über die von CLAUDE.md geforderte Struktur (`lib/domain/`,
`lib/data/store.ts`, Typen mit `org_id`) ohne interaktiven Generator. Ergebnis ist
identisch zu einer App-Router-Standardstruktur.

### D0.3 — shadcn/ui: nur `Button` in Phase 0
Nur die Basis-Utility (`lib/utils.ts` `cn()`), `components.json` und die
`Button`-Komponente angelegt. Weitere Komponenten kommen bedarfsgetrieben pro
Phase via `npx shadcn add`, um kein ungenutztes UI zu horten.

### D0.4 — Domänen-Skelett: nur k-Anonymitäts-Primitive implementiert
Von der Domänenschicht (CLAUDE.md rule 1: `kpi.ts`, `triggers.ts`, `rotation.ts`,
`anonymity.ts`) ist in Phase 0 bewusst nur `anonymity.ts` mit der
foundational `meetsKAnonymity(n, k)`-Primitive + Default `k = 5` implementiert
und unit-getestet — sie ist „kritisch, zuerst lesen" (SPEC.md §7) und liefert
einen echten grünen Test. `kpi.ts`/`triggers.ts`/`rotation.ts` sowie die
vollständige Aggregations-Filterung entstehen in Phase 1/2, um Domänenlogik
nicht verfrüht zu raten.

### D0.5 — `Store`-Interface bewusst minimal
`lib/data/store.ts` fixiert in Phase 0 nur die Naht und den Backend-Diskriminator
(`mode: 'memory' | 'supabase'`). Die konkrete Methodensignatur wird in Phase 1
zusammen mit dem Survey-Runner definiert, wenn die realen Lese-/Schreibbedürfnisse
der UI feststehen — statt sie jetzt zu erraten (CLAUDE.md-Arbeitsweise).

### D0.6 — Git-Autor
Commits werden als `hieblle <leon@dbrains.academy>` erstellt (Vorgabe des
Auftraggebers).

### D0.7 — `tsconfig`: `noUncheckedIndexedAccess` aktiv
Über `strict` hinaus zusätzlich `noUncheckedIndexedAccess: true` gesetzt. Die
kommende Domänenlogik (Rotation, KPI-Klassenmitten) arbeitet stark mit Arrays/
Indizes; die strengere Prüfung fängt dort Off-by-one-/Undefined-Fehler früh ab.

### D0.8 — CI läuft Typecheck + Lint + Test + Build
Über die Akzeptanz (Typecheck + Unit-Tests) hinaus prüft CI zusätzlich `lint`
und `build`, damit ein grüner Lauf auch die Kompilierbarkeit der Next-App
garantiert. Keine Secrets/Env nötig (Prototype-first).
