# DECISIONS.md — KI-Barometer

Annahmen und Abweichungen von der SPEC werden hier dokumentiert (CLAUDE.md:
„Bei Unklarheit: beste Annahme treffen, in `DECISIONS.md` eintragen,
weiterarbeiten"). Neueste Einträge oben.

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
