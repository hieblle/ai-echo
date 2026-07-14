# DECISIONS.md — KI-Barometer

Annahmen und Abweichungen von der SPEC werden hier dokumentiert (CLAUDE.md:
„Bei Unklarheit: beste Annahme treffen, in `DECISIONS.md` eintragen,
weiterarbeiten"). Neueste Einträge oben.

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
