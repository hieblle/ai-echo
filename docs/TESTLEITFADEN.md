# Testleitfaden für das Team

Mit diesem Leitfaden testet ihr die Plattform mit verteilten Rollen — so,
wie ein neuer Kunde sie erleben würde. Er ergänzt das Betriebshandbuch
(`docs/ADMIN-HANDBUCH.md`), das erklärt, *wie* etwas funktioniert. Hier steht,
*was ihr ausprobieren sollt* und was dabei herauskommen muss.

Dauer: etwa 60 Minuten für den Kern-Durchlauf plus eine Woche für den zweiten
Pulse. Mindestens 6 Personen (damit die Anonymitätsschwelle von 5 pro
Abteilung erreichbar ist), ideal 8–10.

---

## Die Rollen im Überblick — wer sieht was

| | Plattform-Admin (dbrains) | Org-Admin (Kunde, Leitung) | Teamleitung | Mitarbeiter:in |
| --- | --- | --- | --- | --- |
| Anmelden ohne Einladung | ja | nein | nein | nein |
| `/admin` — Firmen anlegen, Org-Admin einladen | ja | nein | nein | nein |
| `/app` — eigene Befragungen | nur als Mitglied einer Firma | ja | ja | ja |
| Onboarding, Pulse, Monatsbefragung | als Mitglied | ja | ja | ja |
| Führungskräfte-Befragung | als Mitglied mit Leitungsrolle | ja | ja | nein |
| `/app/<firma>/dashboard` | jede Firma, alles | eigene Firma, alles | nur eigene Abteilung, nur ab 5 Antworten | nein — nur zwei Gesamtzahlen auf `/app` |
| Monatsreport | ja | ja | nein | nein |
| `/app/<firma>/admin` — Mitglieder, Einstellungen, Zyklen | jede Firma | eigene Firma | nein | nein |
| Empfehlungen als erledigt markieren | ja | ja | nein | nein |

Die Rolle vergibt der Org-Admin (oder Plattform-Admin) in der Verwaltung.
Wer neu eingeladen wird, ist zunächst „eingeladen" und wird beim ersten
Klick auf den Login-Link „aktiv".

---

## Vorbereitung (Leon, 10 Minuten)

1. Rollen verteilen und aufschreiben, wer welche E-Mail-Adresse benutzt:
   - 1 Person spielt den **Org-Admin** des Testkunden (nicht Leon — Leon ist
     Plattform-Admin und soll die Übergabe erleben)
   - 2 Personen spielen **Teamleitungen** zweier Abteilungen
   - alle anderen sind **Mitarbeitende**, verteilt auf die Abteilungen —
     eine Abteilung soll mindestens 5 Personen haben, eine andere bewusst
     nur 1–2 (dann seht ihr die Anonymitätsregel)
2. Jede Person braucht ihre Firmen-Mailadresse griffbereit und das Handy.
3. Hinweis an alle: Der Login-Link kommt von `noreply@mail.app.supabase.io`
   — Spam-Ordner prüfen. Supabase verschickt nur **wenige Mails pro Stunde**.
   Deshalb: Einladungen in kleinen Gruppen mit Abstand verschicken, nicht
   alle auf einmal. Wenn das im Test nervt, ist das das Signal für einen
   eigenen Mailversand (Handbuch, Abschnitt 4).

---

## Szenario 1 — Plattform-Admin legt einen neuen Kunden an (Leon)

Ziel: Der komplette Ablauf „neuer Kunde" aus Sicht von dbrains.

1. `/login` öffnen, eigene Adresse eingeben, Login-Link in der Mail klicken.
   **Erwartet:** Du landest auf `/app`, oben rechts steht „Plattform-Admin".
2. `/admin` öffnen → **Neue Organisation anlegen**: Fantasiefirma, z. B.
   „Testwerk GmbH", Anrede Du, Stundensatz 60, drei bis vier Abteilungen
   (eine pro Zeile), zwei Tools mit Lizenzkosten ankreuzen.
   **Erwartet:** Meldung „Organisation angelegt", die Firma steht in der Liste.
3. Bei der neuen Firma die Adresse der Person eintragen, die den Org-Admin
   spielt → **Org-Admin einladen**.
   **Erwartet:** „Einladung verschickt". Diese Person bekommt eine Mail.
4. Notieren: Wie lange hat das gedauert? Was war unklar?

## Szenario 2 — Org-Admin richtet die Firma ein (die Org-Admin-Person)

Ziel: Das, was ein Kunde nach der Übergabe selbst macht.

1. Login-Link aus der Mail klicken. **Erwartet:** `/app` zeigt die Firma mit
   den Links „Dashboard" und „Verwaltung" und die Onboarding-Befragung.
2. **Verwaltung** öffnen (`/app/testwerk-gmbh/admin` — der Kurzname steht in
   der URL). Abschnitt **Mitglieder einladen**: Adressen der Kolleginnen und
   Kollegen einfügen — **abteilungsweise**, damit die Abteilung stimmt;
   die beiden Teamleitungen mit Rolle „Teamleitung" einladen.
   **Erwartet:** Meldung mit Anzahl verschickt / bereits Mitglied /
   fehlgeschlagen. Alle stehen in der Mitgliederliste als „eingeladen".
3. Bei einem Mitglied die Abteilung ändern und speichern; bei einem
   anderen „Link erneut senden" klicken.
4. Abschnitt **Befragungszyklen**: **„Wöchentlicher Pulse jetzt öffnen"**.
   **Erwartet:** „Zyklus geöffnet: N Personen eingeladen, N Mails
   verschickt". Der Zyklus erscheint in der Liste.
5. Selbst auf `/app` gehen: **Onboarding** starten und abschließen, dann den
   **Pulse** (unter 60 Sekunden).

## Szenario 3 — Mitarbeitende: Onboarding und Pulse am Handy (alle)

Ziel: Der Kern des Produkts — muss am Handy in unter einer Minute klappen.

1. Login-Link aus der Mail **am Handy** klicken. **Erwartet:** `/app` mit
   „Onboarding-Befragung · Jetzt starten".
2. Vor dem Start erscheint der Datenschutz-Hinweis (anonyme Auswertung,
   Mindestteamgröße 5). **Prüfen:** Ist er verständlich?
3. Onboarding ausfüllen (Abteilung, Tools, Erfahrung …). Mindestens eine
   Person wählt bei den Tools „Aktuell keine" — sie bekommt später den
   kurzen Pulse mit 3 Fragen.
4. Danach zeigt `/app` den offenen Pulse. Pulse ausfüllen, Zeit stoppen.
   **Erwartet:** Danke-Seite mit „Wissens-Tipp der Woche"; unter 60 Sekunden.
5. Nochmal auf den Pulse gehen. **Erwartet:** Er ist als „Erledigt" markiert,
   ein zweites Ausfüllen ist nicht möglich.
6. Auf `/app` stehen unten zwei Zahlen (Teilnahmequote, Stimmung gesamt) —
   sobald genug Antworten da sind.

Bitte festhalten: unverständliche Fragen, unpassende Antwortoptionen,
Tippfehler, was am Handy schlecht bedienbar ist.

## Szenario 4 — Teamleitung: das Team-Dashboard (die beiden Teamleitungen)

1. `/app` → „Dashboard" bei der Firma. **Erwartet:**
   - Teamleitung der **großen** Abteilung (≥ 5 Antworten): Team-Dashboard
     mit Kacheln, eigener Zeile in der Heatmap plus „Gesamt", Perception
     Gap. **Kein** ROI, **keine** Empfehlungen, **keine** Freitexte.
   - Teamleitung der **kleinen** Abteilung: nur der Hinweis „weniger als 5
     Antworten — keine Kennzahlen". Das ist richtig so.
2. Versuchen, die Verwaltung zu öffnen (`/app/<firma>/admin`).
   **Erwartet:** Zurück auf `/app` mit dem Hinweis „fehlt die Berechtigung".

## Szenario 5 — Org-Admin: Dashboard, Empfehlungen, Report

Nach dem ersten Pulse (alle haben geantwortet):

1. **Dashboard** öffnen. **Erwartet:** eine Woche Daten, Kacheln gefüllt,
   Heatmap mit „n < 5" bei der kleinen Abteilung, Freitexte ohne Abteilung.
   Die Deltas zur Baseline erscheinen erst ab drei Wochen — das ist normal.
2. Falls eine Empfehlung angezeigt wird: auf **Erledigt** klicken, dann
   **Wieder öffnen**.
3. **Monatsreport** über den Button öffnen; Druckdialog (Strg/Cmd+P)
   ansehen — es soll sauber aussehen.
4. Verwaltung: den Pulse-Zyklus **schließen**. Danach als Mitarbeiter:in auf
   `/app` gehen. **Erwartet:** „Aktuell ist keine Befragung offen".
5. **Monatliche Vertiefung** und **Führungskräfte-Befragung** öffnen. Alle
   füllen die Monatsbefragung aus, die Leitungsrollen zusätzlich den
   Führungsblock (F1–F7). Mitarbeitende sehen den Führungsblock nicht.
   **Erwartet danach im Dashboard:** Perception Gap gefüllt, Tool-NPS.
6. **Erinnerung jetzt senden**: Alle, die noch offen sind, bekommen genau
   eine Mail; ein zweiter Klick verschickt nichts mehr.

## Szenario 6 — Sonderfälle (5 Minuten, wer mag)

- Login-Link ein zweites Mal klicken → „Link ungültig", neuen anfordern.
- `/login` mit einer Adresse, die nicht eingeladen ist → es kommt keine
  Mail, die Seite verrät nicht, ob die Adresse existiert.
- Org-Admin **entfernt** ein Mitglied → die Person sieht die Firma auf
  `/app` nicht mehr; ihre bisherigen Antworten bleiben in den Aggregaten.
- Org-Admin versucht, sich selbst zu entfernen → wird abgelehnt.
- Einstellungen: k von 5 auf 6 erhöhen (geht), wieder auf 5 (geht nicht).

## Zweite Woche

Am nächsten Montag öffnet der Zeitplan den Pulse automatisch (wenn in Vercel
`CRON_SECRET` gesetzt ist) — sonst öffnet ihn der Org-Admin per Klick. Alle
antworten erneut; danach hat das Dashboard zwei Wochen und die Rotation
zeigt andere Fragen als in Woche 1. Ab der dritten Woche erscheinen die
Deltas zur Baseline.

---

## Feedback festhalten

Pro Person ein paar Zeilen, gesammelt an Leon:

```
Rolle: …           Gerät: Handy / Laptop
Was hat nicht funktioniert (mit Seite/URL):
Was war unverständlich (Frage, Text, Button):
Wie lange hat der Pulse gedauert:
Was fehlt dir:
```

Leon überträgt die Punkte in `DECISIONS.md` (Fragebogen-Änderungen werden
dort als v1.2 eingefroren) und gibt sie als Aufgaben an Claude weiter.

---

## Danach: aufräumen

Der Testkunde kann bleiben (er ist für Demos ungeeignet, weil echte
Kolleg:innen drin sind) oder gelöscht werden. Löschen geht heute nur direkt
in Supabase (Table Editor → `organizations` → Zeile löschen; alles
Zugehörige verschwindet mit). Die Auth-Nutzer der Kolleg:innen bleiben
bestehen — das schadet nicht, sie sind dann nur in keiner Firma mehr.
Zum Vorführen bei Interessenten dient der Musterkunde „Moorbach"
(`docs/ADMIN-HANDBUCH.md`, Abschnitt 8).
