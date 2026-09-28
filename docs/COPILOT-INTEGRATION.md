# Microsoft 365 Copilot — Nutzungsdaten in das KI-Barometer holen

Status: **Recherche und Vorschlag, Stand 2026-09-28, noch nicht entschieden.**
Zielgruppe: dbrains (Leon). Entscheidungen daraus kommen nach `DECISIONS.md`.

## Kurzfassung

- Microsoft liefert für **lizenzierte** Copilot-Nutzer belastbare Nutzungsdaten:
  wer Copilot in welcher App zuletzt genutzt hat, wie viele Prompts, wie
  viele aktive Tage, plus Summen (lizenziert vs. aktiv je App). Das gibt es
  als **CSV-Export im Admin Center** und als **Graph-API** (`/copilot/reports/…`,
  GA in v1.0, Berechtigung `Reports.Read.All`, auch unbeaufsichtigt als
  Anwendungsberechtigung).
- Ab **50 Copilot-Lizenzen** gibt es zusätzlich das **Copilot Dashboard**
  (Viva Insights) mit Microsofts eigener Schätzung „Copilot assisted hours"
  und einem Gruppen-Export — aber ohne öffentliche API.
- Die Daten sind **personenbezogen** (ein Datensatz pro Nutzer). Standard-
  mäßig sind Namen in den Berichten **verschleiert** (Hash statt UPN); das
  passt zu unserem Anonymitätsversprechen und ist die Basis der Strategie:
  **wir speichern nie Nutzerzeilen, nur Wochen-Aggregate pro Organisation.**
- Empfohlene Reihenfolge: **Stufe 1 CSV-Import** (schnell, jeder Kunde),
  **Stufe 2 Graph-Anbindung** (automatisch, ein Consent-Klick beim Kunden),
  **Stufe 3 Copilot-Dashboard-Export** (Belege für die ROI-Stunden).
- In der Plattform: eigene Seite **„Copilot-Nutzung"** (`/app/<org>/copilot`),
  Abschnitt „7 Integrationen" in der Verwaltung, Wochen-Snapshots im Store,
  reine Domänenfunktionen fürs Parsen und Aggregieren, Demo-Daten für Merlin.

---

## 1. Was Microsoft liefert

### 1.1 Microsoft 365 Copilot usage report (Admin Center)

Microsoft 365 Admin Center → Reports → Usage → Microsoft 365 Copilot.
Zeiträume 7 / 28 (früher 30) / 90 / 180 Tage, Export als CSV.

| Kennzahl | Definition (Microsoft) |
| --- | --- |
| Enabled users | Nutzer mit Copilot-Lizenz im Zeitraum |
| Active users | Nutzer, die eine **bewusste** Copilot-Aktion ausgelöst haben (Prompt abgeschickt o. Ä.); reines Öffnen zählt nicht |
| Active users rate | aktiv ÷ lizenziert |
| Adoption by app | aktive Nutzer je App: Teams, Word, Excel, PowerPoint, Outlook, OneNote, Loop, Copilot Chat (work/web), Microsoft 365 Copilot-App, Edge, Agents |
| Total prompts submitted, Ø prompts per user | Prompts in Copilot Chat |
| User activity table | **pro Nutzer:** Prompts, aktive Tage, letztes Aktivitätsdatum je App |

Daten liegen ca. **48–72 Stunden** nach dem Tag vor (UTC). Für Nutzer
**ohne** Lizenz gibt es einen eigenen „Copilot Chat usage report" (aktive
Nutzer, Prompts) — nur im Admin Center, (noch) nicht per API. Agents
(Copilot Studio) haben einen eigenen Bericht.

### 1.2 Microsoft Graph — Copilot usage reports API (GA)

Neuer Pfad `https://graph.microsoft.com/v1.0/copilot/reports/…`
(die alten `/reports/getMicrosoft365Copilot…`-Endpunkte in Beta sind
abgelöst). Berechtigung **`Reports.Read.All`**, delegiert **oder als
Anwendungsberechtigung** (Client Credentials, kein angemeldeter Nutzer
nötig). v1.0 liefert CSV (302 auf eine vorautorisierte Download-URL),
Beta liefert JSON.

| Endpunkt | Inhalt |
| --- | --- |
| `getMicrosoft365CopilotUserCountSummary(period, version)` | Summen: lizenziert / aktiv je App, v2 zusätzlich Edge, M365-Copilot-App, Chat work/web, Prompts gesamt und Ø |
| `getMicrosoft365CopilotUserCountTrend(period, version)` | dasselbe **pro Tag** |
| `getMicrosoft365CopilotUsageUserDetail(period, version)` | **pro Nutzer:** UPN, Anzeigename, letztes Aktivitätsdatum gesamt und je App; v2 zusätzlich *Prompts submitted (all apps / Chat work / Chat web)*, *Active Usage Days*, Edge, Agents |

Perioden: v1 `D7 D30 D90 D180 ALL`, v2 `D7 D28 D90 D180 ALL`. **Nur
lizenzierte Nutzer.** Rollend, kein Archiv über 180 Tage hinaus — was wir
langfristig sehen wollen, müssen wir selbst wöchentlich sichern.

### 1.3 Namensverschleierung (wichtig für uns)

Seit 2021 ist in jedem Tenant standardmäßig **„Display concealed user,
group, and site names in all reports"** aktiv. Dann liefern Admin Center
**und** Graph statt `anna@firma.at` einen stabilen Hash
(`DC8C64D6EC3A…`). Steuerbar über Org settings → Reports oder Graph
`admin/reportSettings.displayConcealedNames` (`ReportSettings.ReadWrite.All`).

Folge: Mit verschleierten Namen können wir **Nutzer zählen, aber nicht
Abteilungen zuordnen** (der Bericht enthält keine Abteilung; die Zuordnung
ginge nur über UPN → Mitgliedschaft). Für Stufe 1–3 reicht Org-Ebene.

### 1.4 Copilot Dashboard / Copilot Analytics (Viva Insights)

- Voraussetzung: **≥ 50 Copilot-Lizenzen** (oder 50 Viva-Insights-Lizenzen);
  Viva Insights ist seit 2025 in der Copilot-Lizenz enthalten. Zugriff:
  Global Admin, Führungskräfte laut Entra, Insights-Admin/-Analyst,
  Delegierte.
- Bereiche: **Readiness** (Lizenzen, Bereitschaft), **Adoption** (aktive
  Nutzer, Aktionen je App, Nutzungsintensität), **Impact** (u. a.
  **„Copilot assisted hours"** = Microsofts Schätzung: Aktionen × Multipli-
  katoren aus Microsoft-Studien, „How do we estimate this?" zeigt die
  Rechnung), **Sentiment** (nur mit Viva Pulse).
- Datenschutz: **Mindestgruppengröße** für Gruppenwerte, Standard 10,
  auf 5 absenkbar; Tenant-Aggregate ohne Schwelle.
- **Export:** CSV mit Wochenwerten für 6 Monate oder Tageswerten für
  28 Tage, inkl. Nutzungsintensität und Copilot Chat ohne Lizenz —
  nur für Nutzer mit unternehmensweitem Dashboard-Zugriff. **Keine
  öffentliche API.** Analysten können in „Advanced insights" Personen-
  abfragen mit Copilot-Metriken bauen (Power-BI-Vorlagen); das ist
  personenbezogen und für uns nicht nötig.

### 1.5 Nicht geeignet: Purview-Audit-Log

`CopilotInteraction`-Ereignisse enthalten jede einzelne Interaktion pro
Person. Das ist Überwachungsniveau, bringt für unsere Kennzahlen nichts
über 1.2 hinaus und wäre gegenüber Belegschaft und Betriebsrat schwer zu
rechtfertigen. **Bewusst nicht verwenden.**

---

## 2. Rahmen: Anonymität und Recht

- **Unser Versprechen** (SPEC §7): keine Einzelauswertung, k ≥ 5, keine
  Rohdaten mit Personenbezug beim Anbieter. Copilot-Daten dürfen das nicht
  aufweichen. Regel: **Aggregation beim Import, Rohzeilen werden nie
  gespeichert** — weder Datei noch API-Antwort. Gespeichert wird ein
  Wochen-Snapshot pro Organisation mit Zählwerten.
- **Österreich:** Systeme, die Arbeitnehmerdaten automationsunterstützt
  verarbeiten, brauchen nach **§ 96a ArbVG** eine Betriebsvereinbarung;
  Kontrollmaßnahmen, die die Menschenwürde berühren, sind nach **§ 96
  Abs. 1 Z 3 ArbVG** zustimmungspflichtig. Der Betriebsrat hat nach
  **§ 91 Abs. 2 ArbVG** Auskunftsrecht, welche Daten erfasst und wie sie
  ausgewertet werden. Viele Kunden haben bereits eine BV zu Microsoft 365;
  ob sie Copilot-Nutzungsberichte abdeckt, ist im Einzelfall zu prüfen —
  das ist Aufgabe des Kunden, wir liefern die Beschreibung (Zweck, Daten,
  Aggregation, Löschung). Kein Rechtsrat, aber ein klarer Standardtext
  gehört in `docs/ADMIN-HANDBUCH.md` Abschnitt 5.
- **DSGVO:** Zweckbindung (Erfolgsmessung der KI-Einführung, nicht
  Leistungskontrolle), Verarbeitungsverzeichnis beim Kunden ergänzen, AVV
  mit dbrains besteht für die Plattform, Transparenzinfo an Mitarbeitende
  (wir zeigen auf `/app` ohnehin die anonymen Gesamtwerte).
- Praktische Konsequenz: **Namensverschleierung beim Kunden eingeschaltet
  lassen** (Standard) und das im Verbindungsstatus anzeigen. Eine
  Abteilungs-Auswertung (braucht Klarnamen zum Zeitpunkt des Imports)
  nur als spätere Option mit ausdrücklicher BV und k ≥ 5 wie in der Heatmap.

---

## 3. Strategie in drei Stufen

### Stufe 1 — CSV-Import (jeder Kunde, kein IT-Projekt)

1. Org-Admin exportiert im Admin Center den Copilot usage report
   (Zeitraum 28 Tage) — Summenblatt und Nutzertabelle, Namen verschleiert.
2. Lädt die Datei in der Verwaltung unter **„7 Integrationen"** hoch.
3. Server parst, aggregiert sofort zu einem Wochen-Snapshot (Kalenderwoche
   des *Report Refresh Date*), speichert nur Zählwerte, verwirft die Datei.
4. Seite **„Copilot-Nutzung"** zeigt den Snapshot und die Historie.

Warum zuerst: funktioniert bei jedem Kunden, ohne Entra-App, ohne Global
Admin; ist zugleich der Fallback, wenn die API mal fehlt; das Domänen-
modell (Parser, Aggregation, Seite) ist dasselbe wie in Stufe 2.

### Stufe 2 — Graph-Anbindung (automatisch, wöchentlich)

- dbrains registriert **eine mandantenfähige Entra-App** „KI-Barometer
  Connector" (Anwendungsberechtigung `Reports.Read.All`; optional
  `ReportSettings.Read.All`, um die Verschleierung zu prüfen; Publisher-
  Verifizierung empfohlen, sonst Warnhinweis beim Consent).
- Der Kunden-Admin klickt in der Verwaltung auf „Microsoft 365 verbinden"
  → Admin-Consent-URL (`login.microsoftonline.com/organizations/
  adminconsent?client_id=…&redirect_uri=…&state=<org>`) → Rückruf speichert
  die **Tenant-ID** bei der Organisation. Secret der App liegt nur in
  unseren Umgebungsvariablen (`M365_CLIENT_ID`, `M365_CLIENT_SECRET` bzw.
  Zertifikat) — keine Kundengeheimnisse in der Datenbank.
- Cron `/api/cron/copilot-sync` (Mittwoch früh, nach der 72-h-Latenz):
  Token per Client Credentials für den Tenant, `UserCountSummary(D7,v2)`
  + `UserCountTrend(D28,v2)` + `UserDetail(D28,v2)` abrufen, im Speicher
  aggregieren, Snapshot upserten, nichts Rohes persistieren. Fehler →
  Status „Fehler" mit Zeitpunkt in der Verwaltung, Mail an dbrains.
- Fallback pro Kunde: wenn der Kunde keine mandantenfähige App zulässt,
  eigene App-Registrierung im Kunden-Tenant; dann Client-ID/Secret pro Org
  verschlüsselt speichern (AES-GCM mit `INTEGRATION_SECRET`). Erst bauen,
  wenn ein Kunde das verlangt.

### Stufe 3 — Copilot-Dashboard-Export (Belege für den ROI)

- Nur Kunden mit ≥ 50 Lizenzen. Der Dashboard-Nutzer exportiert die
  Wochen-CSV (6 Monate) und lädt sie hoch; wir übernehmen **Tenant-
  Aggregate**: Copilot assisted hours, Aktionen je App, Nutzungsintensität,
  Copilot Chat ohne Lizenz. Gruppenzeilen ignorieren wir (Mindestgruppen-
  größe ist ohnehin Microsofts Sache).
- Nutzen: zweite, unabhängige Schätzung der gesparten Stunden neben
  unserer Selbsteinschätzung (W2.1) — genau der Merklisten-Punkt
  „Belastbarkeit der gesparten Stunden". Die Seite zeigt beide Zahlen
  nebeneinander, mit Erklärung, wie sie zustande kommen; keine stille
  Verrechnung.

---

## 4. Integration in die Plattform

### 4.1 Datenmodell (Migration `…_copilot_usage.sql`)

`org_integrations` — eine Zeile je Org und Anbieter
`org_id · provider ('m365') · tenant_id · status (pending|connected|error)
· names_concealed (bool|null) · consented_at · last_sync_at · last_error`.
RLS: nur Service-Role, keine Client-Policies (wie `responses`).

`copilot_usage_snapshots` — ein Wochenwert je Org und Quelle
`org_id · week (ISO) · source ('csv'|'graph'|'viva') · period_days (7|28)
· report_refresh_date · enabled_users · active_users · active_by_app (jsonb:
teams, word, excel, powerpoint, outlook, onenote, loop, chat_work, chat_web,
m365_app, edge, agents) · prompts_total · prompts_per_active_user
· active_days_buckets (jsonb: „1–2", „3–5", „6–10", „11+" Nutzer)
· assisted_hours (numeric|null, nur viva) · imported_at`
Unique `(org_id, week, source, period_days)`. **Keine Spalte mit UPN, Hash
oder Namen** — Schema-Test in `lib/data/schema.test.ts` erzwingt das,
analog zu `responses`.

### 4.2 Domäne (`lib/domain/copilot.ts`, pure, unit-getestet)

- `parseCopilotUserDetailCsv(text)` / `parseCopilotSummaryCsv(text)`:
  tolerant gegenüber v1/v2-Spalten, deutschen und englischen Headern des
  Admin-Center-Exports, BOM, Semikolon; unbekannte Spalten ignorieren.
- `aggregateSnapshot(rows, refreshDate)` → Snapshot ohne Personenbezug.
- Kennzahlen: `activeRate`, `licenseUtilization` (lizenziert − aktiv,
  × Lizenzpreis/Kopf = **ungenutzte Lizenzkosten**), `usageVsSurvey`
  (Adoption laut Pulse W1.1 gegen aktiv laut Microsoft), `intensity`
  (Ø aktive Tage, Prompts je aktivem Nutzer).
- Trigger: **R5** („bezahltes Tool < 20 % genutzt") bekommt eine zweite
  Datenquelle — liegt ein Snapshot vor, gilt die Microsoft-Aktivrate
  statt der Befragungsquote für `copilot365`; Regeltext nennt die Quelle.
- Fixtures: zwei anonymisierte Beispiel-CSVs (v1, v2, verschleierte Namen)
  unter `lib/domain/__fixtures__/`.

### 4.3 Store

`Store`-Interface: `getIntegration(orgId, provider)`, `upsertIntegration`,
`listCopilotSnapshots(orgId, {weeks?})`, `upsertCopilotSnapshot`.
`MemoryStore` (Demo, Tests) und `SupabaseStore` (Produkt), wie gehabt.

### 4.4 Seite `/app/<org>/copilot` — „Copilot-Nutzung"

Sichtbar für Rollen mit Dashboard (Teamleitung sieht Org-Werte, weil es
keine Teamwerte gibt — Hinweis dazu). Navigationspunkt „Copilot" in der
Seitenleiste (Icon `Bot`), Design D.

1. **Kopf:** Org, Datenstand („Microsoft-Bericht vom …, 28 Tage"), Quelle
   als Pille (CSV-Import / automatisch / Copilot Dashboard), Link zur
   Verwaltung.
2. **Kacheln:** Lizenzen · Aktive Nutzer (Quote, Δ zur Vorwoche) · Prompts
   je aktivem Nutzer · Ø aktive Tage von 28.
3. **Nutzung je App:** Hairline-Balken (aktiv je App ÷ lizenziert), sortiert.
4. **Verlauf:** Sparkline der Aktivquote über die gespeicherten Wochen.
5. **Befragung vs. Telemetrie:** Dumbbell wie beim Perception Gap —
   „Nutzt KI mindestens wöchentlich" (Pulse) gegen „aktiv laut Microsoft";
   Text erklärt, warum die Zahlen abweichen dürfen (Pulse zählt alle Tools,
   Microsoft nur Copilot; Selbstauskunft vs. Messung).
6. **Lizenzcheck:** ungenutzte Lizenzen × Lizenzpreis pro Kopf (aus den
   Tool-Einstellungen) = „ungenutzte Lizenzkosten pro Monat"; Verweis auf R5.
7. **Stunden-Beleg** (nur mit Stufe 3): Microsofts assisted hours neben
   unseren gemeldeten Stunden (W2.1), beide mit Herleitung.
8. **Leerzustand:** erklärt die zwei Wege (CSV hochladen / Microsoft 365
   verbinden) mit Buttons in die Verwaltung.

Monatsreport: eigener Abschnitt „6. Copilot-Nutzung (Telemetrie)" mit den
Kacheln und dem Lizenzcheck, wenn Daten vorliegen.

### 4.5 Verwaltung — Abschnitt „7 Integrationen"

- Karte **Microsoft 365 Copilot**: Status (nicht verbunden / verbunden seit
  … / Fehler), Button „Microsoft 365 verbinden" (Stufe 2), Hinweis zur
  Namensverschleierung mit Ampel, „Jetzt synchronisieren".
- Formular **CSV hochladen** (Stufe 1 und 3): Datei wählen, Zeitraum, Quelle
  (Admin Center / Copilot Dashboard); Ergebnis-Notice „Woche 2026-W39:
  312 lizenziert, 187 aktiv (60 %) übernommen — Datei verworfen".
- Status-Kachel oben: „Copilot-Daten · Stand KW …" mit Warnpunkt, wenn
  älter als zwei Wochen.

### 4.6 Cron, Mail, Demo, Docs

- `app/api/cron/copilot-sync/route.ts` (abgesichert wie die anderen,
  `CRON_SECRET`), Eintrag in `vercel.json` (Mittwoch 06:00 UTC).
- Mailer: Fehlermail an dbrains bei drei Fehlschlägen in Folge.
- Demo: deterministische Snapshots für Merlin (6 Wochen, Aktivquote
  55 → 68 %) in `lib/seed/demo-data.ts`, damit die Seite in der Sales-Demo
  gefüllt ist; Musterwerk leer (Leerzustand zeigen).
- Docs: SPEC §8 neuer Flow F8 „Copilot-Telemetrie", §6 Datenmodell,
  ADMIN-HANDBUCH (Einrichtung beim Kunden: Export-Klickweg, Consent, BV-
  Hinweis), DECISIONS D5.x, TESTLEITFADEN (Import mit Fixture-CSV).

---

## 5. Aufwand und Reihenfolge

| Stufe | Inhalt | Aufwand (grob) |
| --- | --- | --- |
| 1 | Domäne + Tests, Migration, Store, Upload in der Verwaltung, Seite, Demo-Seed, Docs | 3–4 Tage |
| 2 | Entra-App bei dbrains, Consent-Flow, Cron-Sync, Statusanzeige, Fehlermail | 2–3 Tage + Kunden-Consent |
| 3 | Parser für den Dashboard-Export, Stunden-Beleg auf Seite und Report | 1–2 Tage |

Reihenfolge wie nummeriert. Stufe 1 lässt sich sofort beginnen; Stufe 2
braucht vorher einen Microsoft-Tenant bei dbrains mit Rechten zur
App-Registrierung.

## 6. Risiken und Grenzen

- **Nur lizenzierte Nutzer.** Copilot Chat ohne Lizenz taucht in der API
  nicht auf; wer dort startet, fehlt in der Aktivquote. Später: eigener
  Admin-Center-Bericht als CSV (Stufe 1-Parser erweitern).
- **Keine Abteilungen** bei verschleierten Namen (bewusst, siehe 2).
- **Latenz 48–72 h** und **rollende 180 Tage**: wir speichern wöchentlich,
  sonst geht Historie verloren.
- **Formatänderungen:** Microsoft hat 2026 von D30 auf D28 umgestellt und
  Spalten ergänzt (v2). Parser tolerant, Spaltennamen als Tabelle im Code,
  Fixture-Tests pro Version.
- **Consent-Hürde:** Stufe 2 braucht einen Global Admin beim Kunden; ohne
  Publisher-Verifizierung erscheint eine Warnung. Stufe 1 bleibt immer
  möglich.
- **Interpretation:** „aktiv" heißt eine Aktion im Zeitraum — kein Maß für
  Nutzen. Die Seite formuliert das ausdrücklich; Nutzen und Stimmung
  bleiben Sache der Befragung.

## 7. Offene Fragen (vor Stufe 1 klären)

1. Beim ersten Kunden: Wie viele Copilot-Lizenzen (≥ 50 → Dashboard)?
   Ist die Namensverschleierung aktiv? Gibt es eine BV zu Microsoft 365,
   und deckt sie Nutzungsberichte ab?
2. Hat dbrains einen Entra-Tenant, in dem wir eine mandantenfähige App
   registrieren dürfen (Stufe 2)? Publisher-Verifizierung (MPN-ID) vorhanden?
3. Sollen Teamleitungen die Org-Werte der Copilot-Seite sehen oder nur
   Org-Admins?
4. Soll R5 bei vorhandener Telemetrie die Befragungsquote ersetzen oder
   beide Werte zeigen und den strengeren nehmen?

## Quellen

- Copilot usage reports API (GA, `/copilot/reports/…`):
  https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/admin-settings/reports/copilotreportroot-getmicrosoft365copilotusageuserdetail
  sowie `…usercountsummary` und `…usercounttrend`
- Admin-Center-Bericht: https://learn.microsoft.com/en-us/microsoft-365/admin/activity-reports/microsoft-365-copilot-usage
- Copilot Chat (ohne Lizenz): https://learn.microsoft.com/en-us/microsoft-365/admin/activity-reports/microsoft-copilot-usage
- Agents-Bericht: https://learn.microsoft.com/en-us/microsoft-365/admin/activity-reports/microsoft-365-copilot-agents
- Message Center MC1423101 (28-Tage-Fenster, 48 h Refresh, Prompt-/Aktivtage-Metriken in Graph): https://mc.merill.net/message/MC1423101
- Namensverschleierung: https://learn.microsoft.com/en-us/graph/api/adminreportsettings-update
- Copilot Dashboard: https://learn.microsoft.com/en-us/viva/insights/org-team-insights/copilot-dashboard
- Export aus dem Copilot Dashboard: https://learn.microsoft.com/en-us/viva/insights/org-team-insights/export-copilot-metrics
- Copilot Analytics (Lizenzen, 50-Lizenz-Grenze): https://learn.microsoft.com/en-us/viva/insights/copilot-analytics-introduction
- Mindestgruppengröße: https://learn.microsoft.com/en-us/viva/insights/advanced/admin/manage-settings-copilot-dashboard
- Assisted hours („How do we estimate this?"): https://techcommunity.microsoft.com/blog/viva_insights_blog/copilot-dashboard-update-%E2%80%93-features-and-data-interpretation-guide/4165494
- ArbVG § 96 / § 96a: https://www.jusline.at/gesetz/arbvg/paragraf/96
