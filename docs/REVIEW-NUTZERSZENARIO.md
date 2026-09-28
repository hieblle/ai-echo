# Rundgang, Befunde und Zielbild — KI-Barometer aus Sicht der Führung

**Stand:** 28.09.2026 · **Grundlage:** Rundgang durch alle Seiten der Demo und des
Produkts (drei echte Logins: Org-Admin, Teamleitung, Mitarbeiter:in), Code-Prüfung
der Kennzahlen und Regeln. **Es wurde kein Code geändert** — dieses Dokument ist
die Bewertung und der Vorschlag.

---

## Kurzfassung

1. **Technisch läuft der Kern rund.** Login per Link, Datenschutz-Hinweis,
   Onboarding, Pulse, Dashboard, Report, Verwaltung und Copilot-Seite
   funktionieren je Rolle ohne Abbruch. Ein Pulse dauert unter einer Minute.
2. **Die App liefert Zahlen, aber noch keine Erkenntnis.** Eine Führungskraft
   sieht rund 25 Kennzahlen und muss die Geschichte selbst zusammensetzen.
   Die Stärke „Perception Gap“ funktioniert; das Versprechen „Maßnahmen statt
   Reports“ ist am schwächsten umgesetzt.
3. **Befragung und Copilot-Daten stehen nebeneinander, nicht zusammen.** In der
   Merlin-Demo bewertet die Befragung Copilot mit 2,9 von 10, Microsoft meldet
   69 % aktive Lizenzen — und die App bemerkt diesen Widerspruch nicht.
4. **Drei Punkte sind vor dem ersten echten Test kritisch:** Die Gesamtwerte der
   Organisation sind nicht durch die Mindestanzahl k geschützt, Empfehlungen
   feuern schon ab zwei Antworten, und R5 empfiehlt „Lizenz kündigen“, obwohl
   Microsoft 69 % aktive Nutzung meldet.
5. **Zielbild:** ein „Lagebild“ statt einer Kennzahlen-Wand — ein Adoptions-Trichter
   aus beiden Quellen, ein ROI-Korridor statt eines Punktwerts, ein zweiter Gap
   „Führung glaubt vs. Microsoft misst“ und ein Maßnahmen-Kreislauf mit
   Wirkungsnachweis.

---

## 1. Was eine Führungskraft wissen will — und was die App heute beantwortet

Die Geschäftsführung nutzt das KI-Barometer, um sieben Fragen zu beantworten.
Bewertung: ✔ gut beantwortet · ◐ teilweise · ✘ fehlt.

| # | Leitfrage | Wo in der App | Heute | Was fehlt |
|---|---|---|---|---|
| L1 | Wird KI genutzt — von wie vielen, wie intensiv? | Kachel Adoption, Copilot-Seite | ◐ | Zwei Prozentzahlen nebeneinander (71 % Befragung, 69 % Microsoft) ohne Aussage. Intensität gibt es nur für Copilot. |
| L2 | Lohnt es sich finanziell? | ROI-Kachel | ◐ | Nur Selbsteinschätzung, hochgerechnet auf alle Lizenzen, ohne Bandbreite. 13,9× wirkt auf eine Controllerin eher unglaubwürdig. |
| L3 | Wo hakt es? | Heatmap, Freitexte, Vertrauensindex | ◐ | Rote Zellen (SPAR: Vertrauen Logistik 4,9) lösen keine Empfehlung aus. Freitexte sind ungeordnet und teils doppelt. |
| L4 | Sieht das Team es so wie wir? | Perception Gap | ✔ | Funktioniert (SPAR: Strategie-Klarheit Δ 4,3 → R6). Braucht Monats- und Führungsbefragung. |
| L5 | Was sollen wir tun — und hat es gewirkt? | Empfehlungs-Karten | ✘ | Wenige, generische Karten; kein Verantwortlicher, kein Termin, keine Vorher-/Nachher-Messung. |
| L6 | Lohnen sich die Lizenzen? | Lizenzcheck, R5 | ◐ | R5 widerspricht den Microsoft-Daten (Befund K3). Keine Empfehlung zum Umverteilen ungenutzter Lizenzen. |
| L7 | Sind wir beim AI Act abgesichert? | Report Abschnitt 5 | ◐ | Selbsteinschätzung und Kursquote vorhanden, aber kein eigenständiger Nachweis. |

**Fazit:** Wer die App öffnet, bekommt Messwerte. Wer wissen will, *was sie
bedeuten und was als Nächstes zu tun ist*, bekommt heute zu wenig. Das ist der
größte Hebel für den Wert der App.

---

## 2. Was getestet wurde

| Bereich | Umfang | Ergebnis |
|---|---|---|
| Demo | Startseite, Dashboard Merlin und SPAR, Copilot-Seite, Monatsreport, alle vier Befragungen als Mitarbeiterin und Geschäftsführung, Desktop und Handy | läuft |
| Produkt, Mitarbeiter:in | Login-Link, Datenschutz-Hinweis, Onboarding, Pulse, Startseite, Sperre für Dashboard | läuft |
| Produkt, Teamleitung | Onboarding, Pulse, Team-Dashboard, Copilot-Seite, direkter Aufruf des Reports | läuft, zwei Befunde |
| Produkt, Org-Admin | Startseite mit Einrichtung, Verwaltung (7 Abschnitte), Dashboard, CSV-Import, Report | läuft, Import wartet auf die Migration |

Die Wegwerf-Organisation und die drei Test-Konten wurden danach gelöscht.

**Was schon gut ist:**

- Der Pulse hat fünf Fragen, eine pro Bildschirm, und ist in unter einer Minute erledigt.
- Der Datenschutz-Hinweis vor der ersten Befragung ist kurz und verständlich.
- Die Verwaltung führt in sieben nummerierten Schritten durch die Einrichtung; die Kacheln oben zeigen, was fehlt.
- Die Heatmap und das Team-Dashboard halten die Mindestanzahl k je Abteilung konsequent ein.
- Der Perception Gap ist anschaulich (Punkt-Strich-Darstellung) und löst R6 richtig aus.
- Die Copilot-Seite nennt Quelle, Berichtsdatum und Zeitfenster; die Verwaltung erklärt, was gespeichert wird.

---

## 3. Befunde

### 3.1 Kritisch — vor dem ersten echten Test beheben

**K1 · Gesamtwerte der Organisation sind nicht durch k geschützt.**
- *Beobachtet:* In der Test-Org mit drei Personen zeigte das Dashboard nach zwei
  Pulsen „Vertrauensindex 2,0“, „Adoption 100 %“ und eine Gesamtzeile in der
  Heatmap. Alle Mitglieder sehen auf der Startseite „Stimmung zu KI 7,5“ — nach
  einer einzigen Antwort war das exakt die Antwort dieser Person.
- *Warum kritisch:* Wer weiß, wer teilgenommen hat (die Teilnahmequote verrät
  es in kleinen Gruppen), kann Einzelantworten zurückrechnen. Die Gesamtzeile
  ist laut DECISIONS D2.3 bewusst ungeschützt — das stammt aus der Demo-Phase mit
  großen Orgs. Beim dbrains-Test als Org 0 und bei jedem KMU-Team wird es real.
- *Vorschlag:* Jede Org-Kennzahl, jede Startseiten-Zahl und jeder Report-Wert
  erst ab n ≥ k Antworten im Fenster. Darunter: „Noch zu wenige Antworten für
  eine anonyme Auswertung (3 von 5)“.

**K2 · Empfehlungen feuern auf Kleinstdaten.**
- *Beobachtet:* R2 („Kurse Prompt Engineering + KI-Output validieren“) wurde
  nach zwei Antworten ausgelöst, weil eine Person Vertrauen niedrig bewertet hat.
- *Warum kritisch:* Eine falsche Empfehlung in der ersten Woche kostet
  Glaubwürdigkeit — genau dann, wenn die Führung entscheidet, ob sie der App traut.
- *Vorschlag:* Mindest-Datenbasis für alle Regeln (wie schon bei R5 mit ≥ 10
  Antworten), sichtbar als „dünne Datenbasis“ statt einer Empfehlung.

**K3 · R5 widerspricht den Microsoft-Daten.**
- *Beobachtet:* Merlin-Dashboard: „Lizenz prüfen: kündigen oder gezielt schulen —
  Copilot wird nur von 6 % als meistgenutztes Tool genannt … Laut
  Microsoft-Nutzungsdaten sind 69 % der Lizenzen aktiv.“
- *Warum kritisch:* Die Befragungsfrage W1.2 fragt nach dem *meistgenutzten*
  Tool. Ein Werkzeug, das alle an zweiter Stelle nutzen, bekommt 0 %. Das ist
  kein Nutzungsmaß. Die Regel „strengere Quelle gewinnt“ lässt diese schwächere
  Messung die gemessene Telemetrie überstimmen.
- *Zusätzlich:* Der September-Report zeigt „Keine Regel ausgelöst“, weil W1.2 in
  den vier Report-Wochen gar nicht gezogen wurde. Dashboard und Report sagen der
  Führung also Verschiedenes.
- *Vorschlag:* Wenn Telemetrie für ein Tool vorliegt, entscheidet sie über
  „genutzt ja/nein“. Die Befragung liefert dann den Grund („nur 6 % nennen
  Copilot als Haupttool — ChatGPT dominiert“). **Das ändert deine Vorgabe
  „strengeren nehmen“ und braucht deine Entscheidung** (siehe Abschnitt 8).

**K4 · Der ROI ist nicht belastbar genug für eine Geschäftsführung.**
- *Beobachtet:* Merlin: 33.335 € Netto-Ersparnis pro Monat, 13,9×. Die
  Stunden kommen nur aus der Selbsteinschätzung und werden auf alle 48 Lizenzen
  hochgerechnet — auch auf die 15, die laut Microsoft Copilot gar nicht genutzt haben.
- *Warum kritisch:* Wer antwortet, ist eher engagiert (Selbstauswahl). Eine
  Controllerin fragt als Erstes „Woher kommen die 579 Stunden?“ und bekommt eine
  Hochrechnung ohne Bandbreite.
- *Vorschlag:* ROI-Korridor mit Telemetrie-Kalibrierung (Abschnitt 4, V2).

**K5 · Teamleitungen kleiner Teams sehen gar nichts.**
- *Beobachtet:* Team-Dashboard „Vertrieb“ mit zwei Personen: nur der Satz
  „weniger als 5 Antworten … keine Kennzahlen“. Auch keine Org-Werte zum Vergleich.
- *Warum kritisch:* Im Zielsegment (25–500 Mitarbeitende) haben viele Teams
  unter fünf Personen. Die Rolle Teamleitung ist dann leer — und wer nichts
  sieht, bewirbt die Befragung im Team nicht.
- *Vorschlag:* Unter k die Org-Werte (sobald K1 sie schützt) plus einen
  „Team-Impuls“: drei Gesprächsfragen fürs Teammeeting, abgeleitet aus den
  Org-Schwachstellen. Wert ohne Teamdaten.

### 3.2 Mittel — verbessert Verständnis und Vertrauen

| # | Befund | Vorschlag |
|---|---|---|
| M1 | **Interne Kürzel sichtbar:** R4-Karte „Schulung zum Thema „prompt_engineering““ (SPAR), Report „privacy_legal (25 %) · prompt_engineering (21 %)“. | Beschriftung aus dem Fragebogen verwenden („Prompt Engineering“). |
| M2 | **Falsche Meldung:** Teamleitung ruft den Monatsreport direkt auf (die Seitenleiste blendet ihn aus) → „Das Dashboard sehen nur Teamleitung und Geschäftsführung.“ | Eigene Meldung „Den Monatsreport sieht die Verwaltung“. |
| M3 | **Kein „Was heißt das?“:** Das Dashboard zeigt fünf Kacheln, ROI, Heatmap, Gap, Karten — aber keine Zusammenfassung, keine Priorität. | „Lagebild“ mit drei Sätzen oben (Abschnitt 6). |
| M4 | **Rote Zellen ohne Folge:** SPAR Logistik Vertrauen 4,9, Controlling 5,2 — keine Empfehlung, weil Regeln nur Org-Werte prüfen. | Regeln auch je Abteilung (ab k), z. B. R2 „Vertrauen < 5 in Logistikplanung“. |
| M5 | **Doppelte Freitexte:** „Service-Berichte sind einheitlicher …“ steht zweimal im Dashboard, „Technische Dokumentation …“ zweimal im Report. | Duplikate zusammenfassen („3× genannt“); später Themen-Cluster (Backlog #1). |
| M6 | **Scheinbare Übereinstimmung:** „Befragung vs. Telemetrie“ stellt 71 % (alle KI-Tools, Antwortende, 4 Wochen) neben 69 % (nur Copilot, Lizenzierte, 28 Tage). Das sieht aus wie Bestätigung, misst aber Verschiedenes. | Gleiches mit Gleichem vergleichen: Copilot-Zeile aus M2.1 gegen Telemetrie (Abschnitt 4, V3). |
| M7 | **Copilot-Seite beschreibt, statt zu deuten:** 5 Personen nur 1–2 aktive Tage, Excel 21 %, 15 ungenutzte Lizenzen — nichts davon wird als Befund formuliert. | Zwei, drei automatische Befund-Sätze und passende Empfehlungen (Abschnitt 4, V4 und V6). |
| M8 | **Mitarbeitende bekommen wenig zurück:** Startseite zeigt nur Teilnahmequote und Stimmung. | „Das habt ihr gesagt — das passiert jetzt“: umgesetzte Maßnahmen sichtbar machen. Wichtigster Hebel gegen sinkende Teilnahme. |
| M9 | **Deltas ohne Aussage:** „−0 Pp. vs. Baseline“, „+0,0 vs. Baseline“, flache Linien. Die Demo erzählt keine Entwicklung. | Deltas unter einer Schwelle als „stabil“ zeigen; Demo-Daten mit sichtbarem Verlauf (Verbesserung nach einer Maßnahme). |
| M10 | **Widersprüchliche Demo:** Merlin-Befragung: Copilot Nützlichkeit 2,9/10, 1 Nutzung pro Woche (M2.1). Microsoft: 69 % aktiv, 38 Prompts je Nutzer. | Demo-Geschichte stimmig machen — oder den Widerspruch bewusst einbauen und von der App erkennen lassen (V3). |
| M11 | **Doppelte Abfrage:** Führungsfrage F1 „Budget für KI-Lizenzen“, obwohl die Verwaltung die Lizenzkosten schon eingetragen hat. | F1 durch „Wie viel % der Copilot-Lizenzen werden aus deiner Sicht aktiv genutzt?“ ersetzen (Abschnitt 4, V3). |
| M12 | **Befragungslast am Monatsende:** Führungskräfte bekommen in derselben Woche Pulse, Monatsbefragung und Führungsblock (rund 22 Fragen). | Führungsblock eine Woche versetzen oder Pulse in dieser Woche für Führungskräfte aussetzen. |

### 3.3 Klein

- Das Handy-Dashboard ist sehr lang (Merlin: 4.452 px); die Heatmap muss man seitlich schieben. Für Führung am Handy reicht das Lagebild plus Karten.
- Datei-Auswahl und Datumsfeld im CSV-Import zeigen die Browser-Sprache („Choose File“, „mm/dd/yyyy“).
- Die Befragungs-Demo schreibt in „Musterwerk“, das Demo-Dashboard öffnet „Merlin“ — eigene Demo-Antworten sieht man erst nach dem Wechsel.
- Die Admin-Einrichtung auf der Startseite nennt vier Schritte; Copilot-Anbindung sowie Monats- und Führungsbefragung fehlen dort.
- Die Migration `20260928120000_copilot_usage.sql` ist in Supabase noch nicht eingespielt; bis dahin endet jeder CSV-Import mit dem Hinweis.

---

## 4. Wie Befragung und Copilot-Daten sich ergänzen

### 4.1 Grundsatz

**Telemetrie misst Verhalten, die Befragung misst Wirkung und Gründe.**
Microsoft weiß, *dass* und *wie oft* jemand Copilot in Excel nutzt. Nur die
Befragung weiß, *ob es Zeit spart*, *ob das Ergebnis taugt*, *warum jemand es
nicht nutzt* und *wie sich das Team dabei fühlt*. Erst zusammen entsteht das Bild.

Jede Kennzahl kommt aus der Quelle, die sie am besten misst:

| Frage | Beste Quelle | Die andere Quelle liefert |
|---|---|---|
| Wie viele nutzen Copilot? | Telemetrie (aktiv ÷ lizenziert) | Befragung nur, solange nichts angebunden ist |
| Wie viele nutzen KI insgesamt (alle Tools)? | Befragung (W1.1) | Telemetrie deckt nur Copilot ab |
| Wie intensiv, in welchen Apps? | Telemetrie (aktive Tage, Prompts, Apps) | Befragung für andere Tools (M2.1) |
| Spart es Zeit? | Befragung (W2.1) | Plausibilitätsprüfung über aktive Nutzer; ab Stufe 3 Microsofts Stundenschätzung |
| Taugt das Ergebnis, vertraut man ihm? | Befragung (W2.3, W3.1, W3.3) | — |
| Warum nutzt jemand es nicht? | Befragung (M2.3, W4.3, gezielte Zusatzfragen) | Telemetrie zeigt, *wo* die Lücke ist |
| Lohnt sich die Lizenz? | Telemetrie + Lizenzkosten | Befragung liefert den Grund und die Nützlichkeit |
| Hat eine Maßnahme gewirkt? | beide: Vorher/Nachher | — |

**Verbindung nur auf Summen-Ebene.** Beide Quellen werden über Organisation und
Woche verknüpft, später über Abteilung und Woche ab k. Eine Verknüpfung auf
Personenebene gibt es nie: Die Befragung ist anonym gebaut, und eine Verbindung
mit Microsoft-Personendaten wäre eine Leistungskontrolle im Sinne von ArbVG §96a.

### 4.2 Acht konkrete Verbindungen

**V1 · Adoptions-Trichter (Kernansicht).** Eine Grafik, jede Stufe aus der
besten Quelle. Mit den Merlin-Demo-Daten:

```
Lizenziert                48   100 %   Microsoft
Aktiv (28 Tage)           33    69 %   Microsoft
Regelmäßig (≥ 6 Tage)     20    42 %   Microsoft
Ergebnis gut (W2.3 ≥ 7)          69 %   Befragung, Anteil der Antworten
Spart ≥ 3 h pro Woche           41 %   Befragung, Anteil der Antworten
```

Die Führung sieht sofort, *wo* der Trichter bricht, und jede Bruchstelle hat eine
eigene Maßnahme: Lizenz → Umverteilen; aktiv → regelmäßig: Anwendungsfälle und
Übung; regelmäßig → gutes Ergebnis: Prompt- und Prüfkompetenz; gutes Ergebnis →
Zeitgewinn: Prozesse anpassen.

**V2 · ROI-Korridor statt Punktwert.** Die Stunden pro Nutzer kommen aus der
Befragung, die Zahl der Nutzer aus der Telemetrie. Merlin, gerundet:

| Variante | Rechnung | Netto pro Monat |
|---|---|---|
| Heute | 2,8 h × alle 48 Lizenzen | rund 33.300 € |
| Kalibriert | 3,1 h je Nutzer × 33 aktive Nutzer | rund 24.900 € |
| Vorsichtig | regelmäßige Nutzer voll, gelegentliche halb | rund 19.500 € |

Die Führung sieht „zwischen 19.500 € und 33.300 € pro Monat“ und kann jede Zahl
erklären. Das ist glaubwürdiger als ein einzelner hoher Wert. Ab Stufe 3 kommt
Microsofts eigene Stundenschätzung als dritter Anker dazu.

**V3 · Zweiter Gap: „Führung glaubt — Microsoft misst“.** Neben den
Perception Gap (Führung vs. Team) tritt ein Realitäts-Gap:
- Führungsfrage (ersetzt F1): „Wie viel Prozent der Copilot-Lizenzen werden aus deiner Sicht aktiv genutzt?“ → gegen die Telemetrie.
- Team-Selbstauskunft: Copilot-Zeile aus M2.1 („Nutzungen pro Woche“, „Nützlichkeit“) → gegen Prompts je aktivem Nutzer und aktive Tage.
- Merlin-Demo als Beispiel: Das Team sagt 1 Nutzung pro Woche und 2,9 von 10 Nützlichkeit, Microsoft misst 38 Prompts in 28 Tagen. Das ist genau der Widerspruch, den die App heute nicht zeigt.

Dieser zweite Gap ist ein starkes Alleinstellungsmerkmal: Weder Viva Insights
noch Teamecho können ihn zeigen, weil jeweils eine Quelle fehlt.

**V4 · Gezielte Zusatzfragen aus der Telemetrie.** Ist eine App schwach
(Merlin: Excel 21 %), zieht die nächste Monatsbefragung eine Zusatzfrage aus
dem Fragen-Pool: „Was hindert dich, Copilot in Excel zu nutzen?“ mit Antworten
wie „kenne die Funktion nicht“, „Ergebnis unzuverlässig“, „keine passenden
Aufgaben“, „Datenschutz unklar“. Die Frage bleibt Seed-Daten, nur die Auswahl
wird datengetrieben. So beantwortet die Befragung genau das *Warum* hinter der
Telemetrie-Lücke.

**V5 · Wirkungs-Matrix: Nutzung × Vertrauen.** Vier Felder aus Telemetrie
(Intensität) und Befragung (Ergebnisqualität, Nacharbeit, Sicherheit):

| | Vertrauen hoch | Vertrauen niedrig |
|---|---|---|
| **Nutzung hoch** | skalieren: Anwendungsfälle teilen | Qualität sichern: Kurs „KI-Output validieren“ |
| **Nutzung niedrig** | befähigen: Anwendungsfälle und Übung | Grundlagen und Change-Kommunikation |

Heute auf Org-Ebene, später je Abteilung (ab k, siehe V8).

**V6 · Lizenz-Steuerung mit Begründung.** Ungenutzte Lizenzen (Telemetrie)
plus Gründe (Befragung M2.3 „ungenutztes Tool und warum“) plus Nützlichkeit
(M2.1) ergeben eine Empfehlung wie: „15 Lizenzen ohne Nutzung, 450 € pro Monat.
Häufigster Grund laut Befragung: keine passenden Aufgaben. Vorschlag: an
Interessierte umverteilen oder mit Anwendungsfällen starten.“ Wer konkret
inaktiv ist, weiß nur das Microsoft Admin Center — die App verlinkt dorthin und
bleibt selbst personenfrei. Das ist ein gutes Argument gegenüber Betriebsrat
und Datenschutz.

**V7 · Wirkungsnachweis für Maßnahmen.** Wird eine Empfehlung als erledigt
markiert (etwa „Excel-Schulung am 15.10.“), zeigt die App vier Wochen später
Vorher/Nachher aus beiden Quellen: Excel-Nutzung laut Microsoft und Sicherheit
laut Befragung. Das schließt das Problem P4 aus der Spezifikation und ist der
stärkste Beleg für dbrains-Kurse.

**V8 · Abteilungsebene (später, nur mit Betriebsvereinbarung).** Der
Microsoft-Bericht enthält keine Abteilung. Mit einer zusätzlichen Berechtigung
(Entra-Attribut „Abteilung“) ließe sich beim Import je Abteilung summieren —
mit k-Schwelle, ohne Personen zu speichern. Das macht Heatmap und Wirkungs-Matrix
je Abteilung möglich. Rechtlich ist das der heikelste Schritt: nur mit
Betriebsvereinbarung und dokumentierter Zuordnung.

### 4.3 Stolperfallen beim Verbinden

- **Gleiches mit Gleichem vergleichen:** Die Befragung zählt alle KI-Tools, Microsoft nur Copilot. Für Copilot-Vergleiche die Copilot-Antworten nutzen (M2.1, W1.2), W1.1 nur als Kontext.
- **Zeitfenster angleichen:** Microsoft rechnet 28 Tage mit 2–3 Tagen Verzug, der Pulse vier ISO-Wochen. Beide Fenster immer beschriften.
- **Unterschiedliche Grundgesamtheit:** Lizenzierte laut Microsoft vs. Antwortende laut Befragung. Liegt die Befragung weit über der Telemetrie, antworten vermutlich vor allem Engagierte — die App sollte das als Hinweis zur Repräsentativität zeigen.
- **k gilt auch für kombinierte Werte:** Ein Trichter oder eine Matrix darf nur erscheinen, wenn jede Quelle für sich die Schwelle erfüllt.

---

## 5. Kritische Punkte jenseits einzelner Fehler

| Bereich | Risiko | Gegenmaßnahme |
|---|---|---|
| Anonymität | Kleine Orgs und Teams: Org-Gesamtwerte unter k (K1), Rückrechnung über die Teilnahmequote | k auf jeder Ebene, auch Startseite und Report; Teilnahmequote erst ab k |
| Datenqualität | Selbstauskunft bei Stunden, W1.2 als Nutzungsmaß, Selbstauswahl der Antwortenden, Kleinstdaten | Telemetrie-Kalibrierung (V2), Mindest-Datenbasis je Regel (K2), Korridor statt Punktwert |
| Glaubwürdigkeit | Widersprüche zwischen Dashboard und Report (K3), zwischen Befragung und Telemetrie (M10), hohe ROI-Multiples | eine Regel-Logik für beide Ansichten, Widersprüche aktiv anzeigen statt verstecken |
| Teilnahme | Wöchentlicher Pulse ohne sichtbare Folgen ermüdet; R7 greift erst, wenn es zu spät ist | Rückmeldung an Mitarbeitende (M8), Pulse in Teams (Backlog #5) |
| Mitbestimmung | Die Graph-Anbindung *könnte* technisch Personenzeilen lesen, auch wenn die App sie verwirft; der Betriebsrat bewertet die Zugriffsmöglichkeit, nicht nur die Speicherung | im Betriebsrat-Zweiseiter offen beschreiben: verdeckte Namen an, Verarbeitung nur im Speicher, Schema-Test als Nachweis, keine Abteilungs-Telemetrie ohne BV |
| Abhängigkeit von Microsoft | Berichtsformate ändern sich (v1 → v2), 48–72 h Verzug, Stundenschätzung erst ab 50 Lizenzen | Parser toleriert beide Versionen; CSV als Rückfallweg; Stufe 3 erst mit dem Kunden ab 50 Lizenzen |
| Betrieb | Migration offen, Entra-App nicht registriert, kein Alarm bei fehlgeschlagener Synchronisierung, Report noch ohne PDF-Versand | Checkliste in SETUP-PHASE4; Fehlermail bei zweimal fehlgeschlagener Synchronisierung; Phase 5 |
| Rolle Teamleitung | In KMU oft unter k — Rolle ohne Nutzen (K5) | Org-Werte plus Team-Impuls |

---

## 6. Zielbild: Wie die optimale Version aussieht

### 6.1 Leitidee: Lagebild statt Kennzahlen-Wand

Die erste Seite beantwortet in 30 Sekunden drei Fragen: **Was läuft? Wo hakt
es? Was tun wir?** Alles andere ist ein Klick tiefer. Die Sätze entstehen aus
Regeln und Vorlagen — dafür braucht es keine KI-Textgenerierung. Die Skizze
nutzt die Merlin-Demo-Werte; Maßnahmen, Namen und die Führungsschätzung sind
erfundene Beispiele.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Merlin Technology · Lagebild KW 39                      Datenbasis: gut ● │
│                                                                           │
│ „69 % der Copilot-Lizenzen sind aktiv (+4 Pp.). Wer KI nutzt, spart laut  │
│  Team rund 3 Stunden pro Woche — netto 19.500 bis 33.300 € pro Monat.     │
│  Größte Lücken: Excel (21 % aktiv) und Vertrauen in der Logistik (4,9).“  │
├──────────────────────┬──────────────────────┬─────────────────────────────┤
│ WAS LÄUFT            │ WO HAKT ES           │ WAS TUN WIR                 │
│ ▲ Aktivquote 4 Wo.   │ ● Excel kaum genutzt │ ☐ Excel-Kurs (Frau Huber,   │
│   in Folge gestiegen │ ● Logistik: Vertrauen│   bis 15.10.)               │
│ ▲ Service-Berichte   │   unter 5            │ ☑ Townhall Strategie →      │
│   als Top-Use-Case   │ ● Führung schätzt    │   Gap von 4,3 auf 1,9 ✓     │
│                      │   Nutzung 85 %, real │ ☐ 15 Lizenzen umverteilen   │
│                      │   69 %               │   (450 €/Monat)             │
├──────────────────────┴──────────────────────┴─────────────────────────────┤
│ Adoptions-Trichter (V1)       │ ROI-Korridor (V2)     │ Zwei Gaps (V3)    │
│ 48 → 33 → 20 → 69 % → 41 %    │ 19,5k ─────● 33,3k €  │ Team ↔ Führung    │
│                               │                       │ Führung ↔ Messung │
└───────────────────────────────┴───────────────────────┴───────────────────┘
```

Darunter, eingeklappt: Indizes mit Verlauf, Heatmap, Wirkungs-Matrix (V5),
Copilot-Details, Stimmen aus dem Team (gebündelt nach Thema).

### 6.2 Je Rolle

- **Geschäftsführung:** Lagebild, Trichter, ROI-Korridor, Maßnahmen mit Wirkung. Monatlich eine PDF-Seite „Executive Summary“ per Mail — der Report beginnt mit dem Lagebild, nicht mit einer Tabelle.
- **Org-Admin:** eine Seite „Datenlage“: Teilnahme, Aktualität der Microsoft-Daten, Synchronisierungsstatus, welche Auswertung wegen k noch fehlt und was dafür nötig ist. Einrichtung inklusive Copilot-Anbindung als geführter Assistent.
- **Teamleitung:** Team-Werte ab k; darunter Org-Werte und ein Team-Impuls mit drei Gesprächsfragen fürs nächste Teammeeting.
- **Mitarbeiter:in:** nach dem Pulse „Das habt ihr gesagt — das passiert jetzt“ mit den umgesetzten Maßnahmen; der Wissens-Tipp passt zur aktuellen Schwachstelle (etwa ein Excel-Tipp, wenn Excel schwach ist).

### 6.3 Maßnahmen-Kreislauf

```
Befund (Regel, Quelle genannt) → Maßnahme mit Verantwortlichem und Termin
   → erledigt → Wirkungsmessung nach 4 Wochen (Telemetrie + Befragung)
   → im Report: „Excel-Kurs am 15.10. → Excel aktiv 21 % → 38 %, Sicherheit 6,1 → 7,0“
```

Das ist der Kern von „Maßnahmen statt Reports“ und gleichzeitig der beste
Verkaufsbeleg für dbrains-Kurse.

### 6.4 Leitplanken, die immer gelten

- k auf jeder Ebene, auch für Org-Gesamtwerte, Startseite, Report und kombinierte Werte.
- Jede Zahl nennt Quelle, Zeitfenster und Datenbasis; dünne Daten werden als solche markiert, nicht versteckt.
- Keine Verknüpfung auf Personenebene, keine Personenzeilen aus Microsoft-Berichten.
- Dashboard und Report nutzen dieselbe Regel-Logik und dieselben Fenster.

---

## 7. Vorgeschlagene Reihenfolge

| Wann | Paket | Inhalt | Aufwand (grob) |
|---|---|---|---|
| **Sofort, vor dem dbrains-Test** | Sicherheit und Korrektheit | K1 k-Schutz auf Org-Ebene, K2 Mindest-Datenbasis je Regel, K3 R5-Logik (nach deiner Entscheidung), M1 Beschriftungen, M2 Meldung | 1–2 Tage |
| **Vor Pilot Merlin** | Erkenntnis statt Zahlen | Lagebild (6.1), Adoptions-Trichter (V1), ROI-Korridor (V2), Realitäts-Gap mit neuer Führungsfrage (V3), Freitext-Duplikate (M5), stimmige Demo-Geschichte (M10), Teamleitung unter k (K5) | 5–8 Tage |
| **Pilotphase** | Kreislauf schließen | Maßnahmen mit Verantwortlichem und Termin, Wirkungsnachweis (V7), Rückmeldung an Mitarbeitende (M8), Regeln je Abteilung (M4), Lizenz-Steuerung (V6), gezielte Zusatzfragen (V4) | 6–10 Tage |
| **Später** | Ausbau | Wirkungs-Matrix je Abteilung und Abteilungs-Telemetrie mit BV (V5, V8), Stufe 3 Stundenschätzung, Pulse in Teams, Themen-Cluster der Freitexte | offen |

---

## 8. Offene Entscheidungen für dich

1. **R5-Logik (K3):** Du hattest „beide zeigen, strengeren nehmen“ gewählt. Der Rundgang zeigt, dass die Befragungsseite von R5 (W1.2 „meistgenutztes Tool“) kein Nutzungsmaß ist und deshalb die gemessenen 69 % überstimmt. **Empfehlung:** Liegt Telemetrie vor, entscheidet sie; die Befragung erklärt. Ohne Telemetrie bleibt die heutige Regel.
2. **Neue Führungsfrage statt F1 (V3, M11):** F1 „Budget für KI-Lizenzen“ durch „Wie viel % der Copilot-Lizenzen werden aus deiner Sicht aktiv genutzt?“ ersetzen. Das ändert den Fragebogen v1.1 und gehört nach DECISIONS.
3. **Abteilungs-Telemetrie (V8):** erst mit Betriebsvereinbarung beim Kunden — für den Merlin-Pilot vermutlich nicht nötig.
