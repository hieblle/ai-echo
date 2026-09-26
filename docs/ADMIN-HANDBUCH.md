# KI-Barometer — Betriebshandbuch für Admins

Alles, was du wissen musst, um das KI-Barometer als Plattform-Admin bei
dbrains zu betreiben: was das Tool tut, welche Rollen es gibt, wie ein neuer
Kunde angelegt wird, was jede Woche passiert, und wie du die Plattform
vorführst. Technische Einrichtung (Supabase, Vercel, Variablen) steht
separat in `docs/SETUP-PHASE4.md`; Architektur-Entscheidungen in
`DECISIONS.md`; die Produktspezifikation in `SPEC.md`.

Stand: Phase 4 (Datenbank, Login, Rollen, Zyklen). Was noch fehlt, steht
ganz unten.

---

## 1. Was das KI-Barometer ist

Das KI-Barometer macht den Erfolg von KI-Einführungen in Unternehmen
messbar. Mitarbeitende beantworten am Handy in unter einer Minute einen
wöchentlichen Pulse (3–5 rotierende Fragen), einmal im Monat eine
Vertiefung, Führungskräfte zusätzlich einen kurzen Leadership-Block. Daraus
entstehen für die Geschäftsleitung:

- **Vier Indizes mit Trend:** Adoption, Effizienz, Vertrauen, Stimmung
- **ROI in Euro:** gesparte Stunden × Stundensatz minus Lizenzkosten
- **Perception Gap:** wo Führung und Belegschaft die KI-Einführung
  unterschiedlich sehen
- **Heatmap** nach Abteilungen, **Empfehlungen** (Regeln R1–R7 mit Links auf
  dbrains-Kurse), **Monatsreport** mit AI-Act-Kompetenznachweis

Es ist ein Steuerungswerkzeug für die KI-Einführungsberatung von dbrains —
kein reines Umfrage-Tool. Jede Auswertung ist anonym (Details in Abschnitt 5).

**Zwei Betriebsarten:**

| Bereich | URL | Wofür | Login |
| --- | --- | --- | --- |
| Demo-Modus | `/demo`, `/dashboard` | Erstgespräche, Vorführung ohne Account; drei fiktive Firmen mit generierten Daten, „Woche simulieren" | keiner |
| Produkt | `/login`, `/app`, `/admin` | echte Kunden, echte Antworten | E-Mail-Link |

---

## 2. Systeme und Zugänge

| System | Wofür | Wo | Zugang |
| --- | --- | --- | --- |
| **App (Vercel)** | Die laufende Anwendung | Vercel-Projekt `ai-echo` | Vercel-Konto von dbrains |
| **Supabase** | Datenbank, Login-Mails, Nutzerverwaltung | supabase.com, Projekt `ki-barometer-dev` (EU, Irland) | Supabase-Konto von dbrains |
| **GitHub** | Code, Anleitungen, dieses Handbuch | `hieblle/ai-echo` | GitHub-Konto |
| **Claude Code (Cloud)** | Weiterentwicklung, Datenbank-Änderungen, Seed-Skripte | claude.ai/code, Umgebung mit den Projekt-Variablen | Claude-Konto |
| **Passwort-Manager** | Alle Geheimnisse (Supabase-Keys, `PSEUDONYM_SECRET`, DB-Passwort) | dbrains-intern | — |

Grundregel: Geheimnisse stehen nur in Umgebungsvariablen (Vercel,
Claude-Umgebung, lokale `.env.local`) und im Passwort-Manager — nie im Chat,
nie im Repo, nie in E-Mails. `PSEUDONYM_SECRET` darf nach dem ersten
Einsatz **nie geändert** werden (Abschnitt 5).

---

## 3. Rollen

| Rolle | Wer | Sieht / darf | Wie vergeben |
| --- | --- | --- | --- |
| **platform_admin** | dbrains-Team | Alle Organisationen: anlegen, Org-Admins einladen, jedes Dashboard und jede Verwaltung öffnen. Beantwortet selbst keine Befragungen (außer als Mitglied einer Org). | Adresse in der Umgebungsvariable `PLATFORM_ADMIN_EMAILS` (kommagetrennt) — in Vercel **und** in der Claude-Umgebung eintragen, Vercel danach neu deployen. Darf sich ohne Einladung anmelden. |
| **org_admin** | Geschäftsleitung / HR / Projektleitung beim Kunden | Alles der eigenen Organisation: Dashboard, Monatsreport, Verwaltung (Mitglieder einladen, Rollen, Abteilungen, Tools, Einstellungen, Zyklen), Empfehlungen als erledigt markieren. Nimmt selbst an allen Befragungen teil (inkl. Führungsblock). | Vom Plattform-Admin unter `/admin` eingeladen; weitere Org-Admins ernennt der Org-Admin in der Verwaltung. |
| **team_lead** | Teamleitungen | Team-Dashboard nur für die **eigene Abteilung** — und nur, wenn dort mindestens k (5) Antworten vorliegen; sonst gar nichts. Kein ROI, keine Empfehlungen, keine Freitexte (Org-Ebene). Nimmt an Pulse, Monat und Führungsblock teil. | Rolle + Abteilung in der Verwaltung. Ohne Abteilung kein Team-Dashboard. |
| **employee** | Mitarbeitende | Eigene Befragungen (Onboarding, Pulse, Monat) plus zwei Transparenz-Kennzahlen der Organisation (Teilnahmequote, Stimmung gesamt). Kein Dashboard. | Einladung durch den Org-Admin. |

Zugang gibt es **nur per Einladung**. Es gibt keine Selbstregistrierung und
kein Passwort: Jede Anmeldung ist ein Login-Link per E-Mail (eine Stunde
gültig).

---

## 4. Wie die Plattform läuft — der Wochenrhythmus

1. **Onboarding** (einmalig, ~3 Minuten): Abteilung, genutzte Tools,
   Erfahrung, Selbsteinschätzung. Personalisiert die späteren Pulse-Fragen.
   Ohne Onboarding gibt es keinen Pulse.
2. **Montag 09:00** — der Zeitplan öffnet den **wöchentlichen Pulse** für
   alle Mitglieder und verschickt je einen Login-Link. Wer klickt, landet
   direkt bei seiner Befragung (3–5 Fragen, < 60 Sekunden).
3. **Donnerstag 10:00** — **eine** Erinnerung an alle, die noch nicht
   geantwortet haben. Nie mehr als eine pro Befragung.
4. **Letzter Werktag im Monat** — **Monatliche Vertiefung** (8–12 Fragen)
   für alle und der **Führungsblock** (F1–F7) für Teamleitungen und
   Org-Admins; beide eine Woche offen.
5. Abgelaufene Zyklen werden automatisch geschlossen. Wer einen Zyklus
   verpasst, kann ihn nicht nachholen — das ist Absicht (Antworten gehören
   zu ihrer Woche).

Der Zeitplan läuft als Cron auf Vercel (nur im Production-Deployment;
braucht die Variable `CRON_SECRET`). **Alles geht auch manuell:** In der
Verwaltung einer Organisation kannst du jeden Zyklus sofort öffnen,
Erinnerungen auslösen und Zyklen schließen — etwa für den ersten Testlauf
oder wenn ein Kunde einen anderen Rhythmus will.

**Mails:** Aktuell verschickt die Plattform ausschließlich Login-Links über
Supabase (Einladung, Pulse-Start, Erinnerung). Die Texte der Mails bearbeitest
du in Supabase unter Authentication → Email Templates („Invite user" und
„Magic Link"). Der eingebaute Supabase-Versand hat ein niedriges
Stundenlimit — für mehr als eine Handvoll Personen gleichzeitig muss ein
eigener SMTP-Versand hinterlegt werden (`docs/SETUP-PHASE4.md`, Schritt 5.4).

---

## 5. Anonymität — was du Kunden und Betriebsräten zusagen kannst

Das ist das wichtigste Verkaufsargument und die häufigste Frage. Die
ehrliche Fassung:

1. **Antworten tragen keinen Personenbezug.** In der Antwort-Tabelle stehen
   nur Organisation, Abteilung, Rolle (Mitarbeitende/Führung), Frage, Antwort
   und Kalenderwoche — kein Name, keine Nutzer-ID, kein Zeitstempel. Das
   erzwingt die Datenbank selbst, und ein automatischer Test schlägt Alarm,
   falls jemand das je ändert.
2. **Teilnahme und Antworten sind getrennt.** Wer teilgenommen hat (für
   Erinnerungen und die Teilnahmequote) steht in einer anderen Tabelle, die
   mit den Antworten nichts teilt außer der Woche.
3. **k-Anonymität: Auswertung nur ab 5 Personen pro Abteilung.** Kleinere
   Abteilungen erscheinen nirgends einzeln, nur im Gesamtwert. Die Schwelle
   ist pro Kunde nur erhöhbar (z. B. auf Wunsch des Betriebsrats), nie
   senkbar — auch das erzwingt die Datenbank.
4. **Freitexte** werden nur auf Organisationsebene, in zufälliger
   Reihenfolge, ohne Abteilung und Datum angezeigt. Vor jedem Freitextfeld
   steht der Hinweis, keine identifizierenden Angaben zu machen.
5. **Wo die Grenze liegt (bitte nicht überversprechen):** Die App führt ein
   pseudonymes Befragungsprofil pro Person (welche Tools genutzt, welche
   Fragen zuletzt gestellt), damit Rotation und Fragenlogik funktionieren.
   Der Schlüssel dazu ist ein Hash aus Mitgliedschaft und dem Server-Geheimnis
   `PSEUDONYM_SECRET`. Eine Zuordnung Profil ↔ Person wäre nur mit
   Datenbankzugriff **und** diesem Geheimnis möglich — also nur für dbrains
   als Betreiber, und auch dann nicht für die Antworten selbst, die keinen
   Schlüssel tragen. Die korrekte Formulierung lautet: *technisch anonyme
   Antworten, pseudonymes Profil, Betreiberzugriff organisatorisch
   abgesichert (AVV, Vier-Augen-Prinzip)*.

Alle Server stehen in der EU (Supabase Irland, Vercel Frankfurt); mit
beiden Anbietern besteht ein Auftragsverarbeitungsvertrag (AVV) — vor dem
ersten Kundenpiloten im jeweiligen Konto abschließen.

---

## 6. Neuen Kunden anlegen (Checkliste)

### Vorher vom Kunden einholen

- **Abteilungen**, grob genug geschnitten, dass in jeder mindestens 5
  Personen teilnehmen (sonst erscheint die Abteilung nie einzeln)
- **KI-Tools** im Einsatz und die **monatlichen Lizenzkosten** je Tool
  (fließen in den ROI)
- **Standard-Stundensatz** (Personalkosten pro Stunde, z. B. 65 €)
- **Anrede**: Du oder Sie (Konzerne meist Sie)
- **Ansprechperson** beim Kunden, die Org-Admin wird (E-Mail-Adresse)
- **Teilnehmerliste** mit E-Mail-Adressen, Abteilung und Rolle
  (Teamleitung ja/nein) — bekommt der Org-Admin, nicht du
- Geklärt: Betriebsrat/Mitbestimmung, Datenschutz (AVV), Scope (Büro-
  Arbeitsplätze; Produktion/Filialen ohne eigene E-Mail sind noch nicht
  abgedeckt)

### Schritte im Tool (< 10 Minuten)

1. Anmelden unter `/login` mit deiner dbrains-Adresse → oben rechts
   **Plattform-Admin** (`/admin`).
2. **Neue Organisation anlegen:** Name, optional Kurzname (wird sonst aus
   dem Namen gebildet, z. B. `merlin`), Anrede, Stundensatz, Schwelle k
   (Standard 5), Abteilungen (eine pro Zeile), Tools ankreuzen und
   Lizenzkosten eintragen → **Organisation anlegen**.
3. In der Liste bei der neuen Organisation die Adresse der Ansprechperson
   eintragen → **Org-Admin einladen**. Sie bekommt sofort einen Login-Link.
4. Über **Verwaltung** kannst du alles später ändern (Abteilungen, Tools,
   Anrede, k nach oben).

### Übergabe an den Org-Admin

Der Org-Admin macht danach selbst (du kannst es auch, du siehst dieselbe
Verwaltung):

1. **Mitglieder einladen:** E-Mail-Liste in das Feld einfügen (eine pro
   Zeile oder Komma-getrennt, auch eine kopierte Excel-Spalte), Rolle und
   Abteilung wählen → am besten **abteilungsweise** einladen, dann stimmt
   die Zuordnung. Duplikate werden übersprungen, Fehler pro Adresse
   angezeigt.
2. **Teamleitungen** brauchen eine Abteilung (sonst kein Team-Dashboard).
3. **Ersten Pulse starten:** entweder auf Montag warten oder in der
   Verwaltung **„Wöchentlicher Pulse jetzt öffnen"** klicken. Alle erhalten
   einen Login-Link, machen einmalig das Onboarding und dann den Pulse.
4. Nach 2–3 Wochen zeigt das Dashboard erste Trends; die Baseline sind die
   ersten beiden Pulse-Wochen.

### Erste Woche begleiten

- Teilnahmequote im Dashboard beobachten; unter 40 % über zwei Zyklen
  löst Empfehlung R7 aus („Management-Buy-in")
- Mails im Spam? Absender ist aktuell `noreply@mail.app.supabase.io` — dem
  Kunden vorab sagen, dass diese Adresse freigeschaltet werden soll
- Wer keinen Link bekommt: in der Verwaltung beim Mitglied **„Link erneut
  senden"**

---

## 7. Laufender Betrieb

### Verwaltung (`/app/<kunde>/admin`)

- **Befragungszyklen:** offene Zyklen sehen, manuell öffnen/schließen,
  Erinnerung auslösen
- **Mitglieder einladen** (siehe oben)
- **Mitglieder:** Rolle und Abteilung ändern, Link erneut senden,
  **Entfernen** (die Person bekommt keine Befragungen mehr; ihre
  anonymen Antworten bleiben in den Aggregaten). Die eigene Mitgliedschaft
  lässt sich nicht entfernen, und ein Org-Admin kann sich nicht selbst
  herabstufen.
- **Einstellungen:** Anrede, Stundensatz, k (nur erhöhbar)
- **Abteilungen** hinzufügen/löschen (Mitglieder einer gelöschten Abteilung
  verlieren nur die Zuordnung)
- **Tools und Lizenzkosten** pflegen — inaktive Tools zählen nicht im ROI

### Dashboard lesen (`/app/<kunde>/dashboard`)

- **Kacheln:** Adoption (Anteil aktiver Nutzer, gepoolt über 4 Wochen),
  Effizienz-, Vertrauens-, Stimmungsindex (0–10) und Teilnahmequote, jeweils
  mit Sparkline und Delta zur Baseline (ab 3 Wochen)
- **ROI-Kachel:** konservativ nur gemeldete Stunden × Stundensatz
  (Org-Standard oder Ø aus dem Führungsblock F5) minus aktive Lizenzkosten,
  Basis letzte 4 Wochen; Hochrechnung als Zweitwert
- **Heatmap** Abteilungen × Dimensionen; „n < 5" = anonymisiert
- **Perception Gap:** Führung vs. Mitarbeitende auf drei gespiegelten
  Paaren (Strategie, Kompetenz, Nutzen); positiv = Führung optimistischer
- **Empfehlungen R1–R7:** regelbasiert, mit Kurs-Link, vom Org-Admin als
  erledigt/verworfen markierbar

| Regel | Löst aus bei | Empfehlung |
| --- | --- | --- |
| R1 | Adoption < 50 % über 2 Wochen | Kurs „KI-Grundlagen" + Awareness |
| R2 | Vertrauensindex < 5 | Kurse „Prompt Engineering", „KI-Output validieren" |
| R3 | Stimmung sinkt 3 Zyklen in Folge | Strategie-Call mit dbrains |
| R4 | Schulungswunsch-Thema > 30 % | passenden Kurs verlinken |
| R5 | bezahltes Tool < 20 % genutzt | Lizenz prüfen: kündigen oder schulen |
| R6 | Perception Gap > 3 Punkte | Townhall / FAQ zur KI-Strategie |
| R7 | Teilnahmequote < 40 % über 2 Zyklen | Management-Buy-in einholen |

- **Monatsreport** (`/app/<kunde>/report/<jahr-monat>`): Druckansicht mit
  Kennzahlen vs. Baseline, Gap, Top-Use-Cases, Empfehlungen und dem
  AI-Act-Kompetenznachweis — über den Browser-Druckdialog als PDF speichern.

---

## 8. Musterkunde für Vorführungen: Moorbach Antriebstechnik GmbH

Ein fiktiver Kunde in der **echten** Plattform (Login, Verwaltung,
Dashboard mit Daten), Kurzname `moorbach`. 47 Platzhalter-Mitglieder mit
Adressen `@moorbach-demo.example` (eine reservierte, nicht zustellbare
Domain — es kann keine Mail an sie gehen, und der Zeitplan überspringt die
Organisation), 6 Wochen generierte Antworten, ein offener Pulse für die
laufende Woche. Die Sie-Form ist eingestellt.

**Was man zeigen kann und was drinsteckt**

- Adoption um 70 %, gute Stimmung, ROI deutlich positiv
- **Marketing hat nur 4 Personen** → in der Heatmap „n < 5": zeigt die
  Anonymitätsregel live
- **Copilot-Lizenz für 1.440 €/Monat wird kaum genutzt** → Empfehlung **R5**
  feuert („Lizenz prüfen")
- Perception Gap klein (gesunde Organisation) — für einen großen Gap den
  Demo-Modus mit „SPAR" öffnen (`/dashboard/spar`)
- Verwaltung mit vollständiger Mitgliederliste, Abteilungen, Tools
- Der **offene Pulse** der laufenden Woche: Du bist Org-Admin von Moorbach
  → unter `/app` einmal das Onboarding machen und den Pulse beantworten —
  so zeigst du den Handy-Flow live

**Empfohlene Reihenfolge in einem Termin (10 Minuten)**

1. `/app` — „so sieht ein Mitarbeiter das": offene Befragung, zwei
   Transparenz-Zahlen
2. Pulse am Handy durchspielen (< 60 Sekunden)
3. `/app/moorbach/dashboard` — Kacheln, ROI, Heatmap mit „n < 5", Gap,
   Empfehlung R5 mit Kurs-Link
4. Monatsreport öffnen (Druckansicht, AI-Act-Abschnitt)
5. `/app/moorbach/admin` — wie wenig Verwaltung nötig ist

**Zurücksetzen** (z. B. nachdem du im Termin Empfehlungen als erledigt
markiert oder den Pulse beantwortet hast): in einer Claude-Session oder
lokal mit den Projekt-Variablen

```bash
pnpm seed:demo --reset     # löscht Moorbach samt Platzhalter-Usern und legt alles neu an
pnpm check:org             # zeigt in einer Zeile, was das Dashboard anzeigen wird
```

Der Musterkunde ist als `is_demo` markiert: Der automatische Zeitplan lässt
ihn aus, und beim manuellen Öffnen eines Zyklus werden keine Mails
verschickt.

---

## 9. Wenn etwas nicht funktioniert

| Symptom | Ursache / Lösung |
| --- | --- |
| Jemand bekommt keinen Login-Link | Adresse nicht eingeladen (die Login-Seite verrät das absichtlich nicht) · Spam-Ordner · Stundenlimit des Supabase-Versands → in der Verwaltung „Link erneut senden" oder etwas warten |
| „Link ungültig oder abgelaufen" | Link älter als 1 Stunde oder schon benutzt → neuen anfordern. Tritt es bei allen auf: Redirect-URLs in Supabase (Authentication → URL Configuration) prüfen |
| Mitglied sieht „Bitte zuerst das Onboarding abschließen" | Gewollt: Pulse erst nach Onboarding |
| „Für diese Befragung ist kein Zyklus geöffnet" | Zyklus in der Verwaltung öffnen oder auf Montag warten |
| Teamleitung sieht keine Zahlen | Abteilung unter 5 Antworten (gewollt) oder keine Abteilung zugeordnet |
| Teilnahmequote plötzlich niedrig | Die laufende Woche zählt erst, sobald jemand geantwortet hat; ein offener Zyklus ohne Antworten erscheint nicht |
| Dashboard leer | Noch kein abgeschlossener Zyklus mit Antworten |
| Cron öffnet nichts | `CRON_SECRET` in Vercel fehlt oder das Deployment ist kein Production-Deployment |
| Seite „Datenbank nicht konfiguriert" | Umgebungsvariablen in Vercel fehlen/vertauscht → `docs/SETUP-PHASE4.md` |

Bei allem anderen: Fehlermeldung kopieren und in einer Claude-Session mit
dem Repo klären — dort liegen Code, Tests und die Projekt-Variablen.

---

## 10. Was noch nicht fertig ist (Stand Phase 4)

- **Interner Testlauf** mit ≥ 5 dbrains-Leuten über eine Woche als „Org 0"
  — letzte offene Abnahme von Phase 4
- **Eigener Mailversand** (Brevo/Resend) statt Supabase-Standard — nötig ab
  etwa 5 gleichzeitigen Einladungen und für schöne Absenderadressen
- **Phase 5:** PDF-Monatsreport mit automatischem Versand, Datenexport und
  Org-Löschung (DSGVO), Betriebsrat-Zweiseiter, Fehler-Monitoring,
  Pilot-Runbook
- Vercel Pro (kommerzielle Nutzung) und Supabase Pro (keine Pausierung,
  Backups) **vor** dem ersten zahlenden Kunden
- Nicht im MVP: Deskless-Zugang ohne E-Mail (Filialen/Produktion),
  Teams/Slack, Mehrsprachigkeit, Benchmarks
