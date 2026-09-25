# Phase 4 einrichten — Supabase, Login, erster Testlauf

Diese Anleitung führt vom leeren Supabase-Konto bis zum ersten echten
Pulse mit dem dbrains-Team („Org 0"). Alles, was hier steht, ist Klickarbeit
in Web-Oberflächen plus ein Befehl im Terminal. Reihenfolge einhalten.

**Die Demo (`/demo`, `/dashboard`) läuft weiterhin ohne all das.** Nur die
Produktrouten (`/login`, `/app`, `/admin`) brauchen die Konfiguration.

---

## 1. Supabase-Projekt anlegen (5 Minuten)

1. Auf https://supabase.com anmelden → **New project**.
2. Name: `ki-barometer-dev` (später ein zweites Projekt `ki-barometer-prod`).
3. **Region: Frankfurt (eu-central-1)** — das ist Pflicht (EU-Hosting, SPEC §5).
4. Datenbank-Passwort generieren lassen und **sofort sicher ablegen**
   (Passwort-Manager). Es wird für die Migration gebraucht.
5. Tarif: Free reicht für Entwicklung und Dogfooding. Achtung: Free-Projekte
   pausieren nach 7 Tagen ohne Zugriff — vor dem Kundenpiloten auf Pro.

## 2. Die Zugangsdaten zusammensuchen

Supabase hat sein Key-System umgestellt: Statt der alten JWT-Keys `anon`
und `service_role` gibt es jetzt einen **Publishable key**
(`sb_publishable_…`, darf in den Browser) und **Secret keys**
(`sb_secret_…`, nur für den Server). Die App nutzt genau diese beiden; die
alten Keys funktionieren zur Not weiterhin (Fallback-Variablennamen in
`.env.example`), sind aber nicht mehr nötig.

Im Projekt links unten **Project Settings**:

| Wo | Wert | Wird zu |
| --- | --- | --- |
| **Data API** (bzw. **API**) → Project URL | `https://xxxx.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` |
| **API Keys** → Reiter „Publishable and secret API keys" → Publishable key | `sb_publishable_…` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| **API Keys** → Secret keys → **Create new API key** (Name z. B. `app-server`) → Wert einmalig kopieren | `sb_secret_…` | `SUPABASE_SECRET_KEY` |
| **Database** → Connection string → **URI**, Modus „Session" | `postgresql://postgres.xxxx:[PASSWORD]@…:5432/postgres` | `SUPABASE_DB_URL` (Passwort aus Schritt 1 einsetzen) |

Der Secret key umgeht jede Sicherheitsregel der Datenbank. Er gehört nur in
Umgebungsvariablen auf dem Server — nie in den Browser, nie in den Chat, nie
ins Repo. Die App weigert sich zu starten, wenn die beiden Keys vertauscht
eingetragen sind (ein `sb_secret_…` in der Publishable-Variable würde sonst
an Browser ausgeliefert).

Zwei Geheimnisse selbst erzeugen (Terminal, einmalig):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → PSEUDONYM_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → CRON_SECRET
```

`PSEUDONYM_SECRET` niemals ändern, sobald echte Antworten existieren — sonst
verlieren alle Teilnehmenden ihr Befragungsprofil und müssten das Onboarding
wiederholen (DECISIONS D4.2). Auch im Passwort-Manager ablegen.

## 3. Umgebungsvariablen eintragen — an drei Stellen

Vollständige Liste mit Erklärungen: `.env.example`.

| Variable | Wert |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | aus Schritt 2 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` aus Schritt 2 |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` aus Schritt 2 |
| `SUPABASE_DB_URL` | aus Schritt 2 (nur dort, wo die Migration läuft) |
| `NEXT_PUBLIC_APP_URL` | die öffentliche Adresse, z. B. `https://ai-echo-xyz.vercel.app` (lokal: `http://localhost:3000`) |
| `PLATFORM_ADMIN_EMAILS` | `leon@dbrains.academy` (mehrere mit Komma) |
| `PSEUDONYM_SECRET` | erzeugt in Schritt 2 |
| `CRON_SECRET` | erzeugt in Schritt 2 |

**a) Vercel** (damit die App im Web läuft): Projekt → Settings → Environment
Variables → jede Variable anlegen, Environments „Production", „Preview" und
„Development" anhaken. `NEXT_PUBLIC_APP_URL` auf die Vercel-Domain setzen.
Danach einmal neu deployen (Deployments → ⋯ → Redeploy).

**b) Cloud-Umgebung der Claude-Sessions** (damit Claude gegen die Datenbank
testen und die Migration einspielen kann): Menü der Umgebung in der
Titelleiste → Edit → Environment Variables. Hier auch `SUPABASE_DB_URL`
eintragen. Eine neue Session sieht die Variablen automatisch.

**c) Lokal** (optional): Datei `.env.local` im Projektordner anlegen
(Vorlage `.env.example`), `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
Die Datei ist per `.gitignore` ausgeschlossen.

## 4. Datenbank-Schema einspielen (1 Befehl)

Im Projektordner (lokal oder in einer Claude-Session), mit gesetztem
`SUPABASE_DB_URL`:

```bash
pnpm db:migrate
```

Erwartete Ausgabe: `applied 20260925120000_init.sql` und
`1 migration(s) applied.` Ein zweiter Aufruf meldet `Database is up to date.`
Das Skript legt alle Tabellen, die Sicherheitsregeln (RLS) und die
Teilnahme-Statistik an — Details in `supabase/migrations/`.

## 5. Supabase Auth konfigurieren (Login-Links)

Im Supabase-Projekt → **Authentication**:

1. **URL Configuration**
   - Site URL: die Vercel-Domain, z. B. `https://ai-echo-xyz.vercel.app`
   - Redirect URLs, je eine Zeile:
     - `https://ai-echo-xyz.vercel.app/auth/callback`
     - `https://*.vercel.app/auth/callback` (für Preview-Deployments)
     - `http://localhost:3000/auth/callback`
2. **Providers → Email**: eingeschaltet lassen. „Confirm email" darf an
   bleiben. Self-Signup ist in der App selbst unterbunden — nur eingeladene
   Adressen (und die Plattform-Admins) können sich anmelden.
3. **Email Templates** (optional, aber empfohlen): „Invite user" und
   „Magic Link" auf Deutsch umtexten. Der Platzhalter
   `{{ .ConfirmationURL }}` muss im Link bleiben. Vorschlag Magic Link:
   *Betreff:* „Dein Login-Link zum KI-Barometer" · *Text:* „Hallo! Mit diesem
   Link kommst du direkt zu deiner Befragung: {{ .ConfirmationURL }} — Der
   Link ist eine Stunde gültig. Deine Antworten werden anonym ausgewertet."
4. **Rate Limits / SMTP:** Der eingebaute Versand von Supabase ist nur für
   Tests gedacht (wenige Mails pro Stunde, Absender `noreply@mail.app.supabase.io`).
   Sobald 5 oder mehr Personen gleichzeitig eingeladen werden, unter
   Project Settings → Authentication → **SMTP Settings** einen eigenen
   Versand hinterlegen (z. B. Brevo, Resend — siehe DECISIONS D3.2). Bis
   dahin: Einladungen in kleinen Gruppen mit Abstand verschicken.

## 6. Erster Login und Org 0

1. `https://<deine-domain>/login` öffnen, `leon@dbrains.academy` eingeben →
   Login-Link kommt per Mail (Plattform-Admins dürfen sich ohne Einladung
   anmelden, alle anderen nicht).
2. Nach dem Klick landest du auf `/app` → oben rechts **Plattform-Admin**
   → `/admin`.
3. **Neue Organisation anlegen:** Name „dbrains academy", Anrede Du,
   Abteilungen (mindestens so grob, dass 5 Personen pro Abteilung
   zusammenkommen — oder für den Test nur eine Abteilung), genutzte Tools
   mit Lizenzkosten.
4. In der Liste bei „dbrains academy" **deine eigene Adresse als Org-Admin
   einladen** (du bekommst eine Mail; der Klick aktiviert die Mitgliedschaft).
5. **Verwaltung** der Org öffnen (`/app/dbrains-academy/admin`):
   Teammitglieder einladen (Adressen einfügen, Rolle, Abteilung), dann
   **„Wöchentlicher Pulse jetzt öffnen"**. Jede eingeladene Person erhält
   einen Login-Link, macht einmalig das Onboarding und dann den Pulse.
6. **Dashboard** (`/app/dbrains-academy/dashboard`): erscheint mit Zahlen,
   sobald Antworten da sind; Abteilungen unter 5 Antworten werden nur in
   „Gesamt" gezählt.

Ab jetzt läuft der Zeitplan automatisch (Montag öffnen, Donnerstag
erinnern, Monatsende Vertiefung) — vorausgesetzt, Vercel hat `CRON_SECRET`
und zeigt unter Settings → **Cron Jobs** die beiden Jobs aus `vercel.json`.
Manuell auslösen geht jederzeit über die Verwaltung.

## 7. Tests gegen die echte Datenbank

Sobald die Variablen in der Claude-Umgebung stehen, laufen die
Integrationstests automatisch mit:

```bash
pnpm test
```

Sie legen kurzzeitig zwei Test-Organisationen und einen Test-User an
(Präfix `itest-`), prüfen die Mandantentrennung, die Sicherheitsregeln und
den Duplikat-Schutz und räumen wieder auf. **Nur gegen das Dev-Projekt
laufen lassen**, nie gegen Produktion.

## Wenn etwas hakt

| Symptom | Ursache / Lösung |
| --- | --- |
| Seite „Datenbank nicht konfiguriert" | Eine der drei Supabase-Variablen fehlt an der Stelle, wo die App läuft (Vercel? lokal?), oder Publishable und Secret key sind vertauscht (dann steht ein Hinweis im Server-Log). Nach dem Eintragen neu deployen bzw. Server neu starten. |
| Login-Link → „Link ungültig oder abgelaufen" | Redirect URL in Supabase fehlt (Schritt 5.1) oder Link älter als eine Stunde / schon benutzt. |
| Keine Mail | Spam-Ordner; Stundenlimit des Supabase-Versands (Schritt 5.4); Adresse nicht eingeladen (die App verrät das absichtlich nicht). |
| `pnpm db:migrate` bricht ab | `SUPABASE_DB_URL` prüfen (Passwort eingesetzt? Modus „Session"?). Netzwerk muss Port 5432 nach außen erlauben. |
| Teamleitung sieht „Kein Team zugeordnet" | In der Verwaltung dem Mitglied eine Abteilung geben. |
| Cron läuft nicht | `CRON_SECRET` in Vercel fehlt, oder das Deployment ist kein Production-Deployment (Vercel führt Crons nur dort aus). |
