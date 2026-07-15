# DECISIONS.md — KI-Barometer

Annahmen und Abweichungen von der SPEC werden hier dokumentiert (CLAUDE.md:
„Bei Unklarheit: beste Annahme treffen, in `DECISIONS.md` eintragen,
weiterarbeiten"). Neueste Einträge oben.

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
