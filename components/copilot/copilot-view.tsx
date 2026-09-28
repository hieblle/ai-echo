/**
 * "Copilot-Nutzung" page body (D4.10, docs/COPILOT-INTEGRATION.md §4.4),
 * shared by the demo route and the product route. Server component: gets
 * the assembled `CopilotPageData` and its host's links. Shows org-level
 * telemetry only — Microsoft's licensed/active counts, usage per app, the
 * trend, the comparison with the pulse and the licence check.
 */

import Link from "next/link";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/field";
import { activeRate, formatReportDate } from "@/lib/domain/copilot";
import type { CopilotPageData } from "@/lib/server/copilot-service";
import { COPILOT_APP_KEYS, COPILOT_APP_LABELS, type CopilotSource } from "@/lib/types";

const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const SOURCE_LABELS: Record<CopilotSource, string> = {
  csv: "CSV-Import",
  graph: "automatisch (Microsoft Graph)",
  viva: "Copilot Dashboard",
};

function pct(value: number | null): string {
  return value === null ? "–" : `${nf.format(value * 100)} %`;
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-base font-medium">{children}</h2>
      {aside && <div className="text-[11px] text-muted-foreground">{aside}</div>}
    </div>
  );
}

function Bar({
  label,
  value,
  share,
  color,
}: {
  label: string;
  value: string;
  share: number;
  color?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-3 text-xs">
        <span>{label}</span>
        <span className="whitespace-nowrap text-muted-foreground">{value}</span>
      </div>
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{
            width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`,
            ...(color ? { background: color } : {}),
          }}
        />
      </div>
    </div>
  );
}

export interface CopilotViewProps {
  data: CopilotPageData;
  /** Link to the admin section "7 Integrationen"; null for viewers without admin rights. */
  adminHref: string | null;
  dashboardHref: string;
  footer: React.ReactNode;
}

export function CopilotView({ data, adminHref, dashboardHref, footer }: CopilotViewProps) {
  const { org, latest, latestShort, trend, license, survey, integration } = data;
  const rate = latest ? activeRate(latest) : null;
  const previous = trend.length >= 2 ? trend[trend.length - 2]?.activeRate ?? null : null;
  const delta =
    rate !== null && previous !== null
      ? {
          text: `${rate - previous >= 0 ? "+" : "−"}${nf.format(Math.abs(rate - previous) * 100)} Pp. vs. Vorwoche`,
          direction: (Math.abs(rate - previous) < 0.005 ? "flat" : rate > previous ? "up" : "down") as
            | "flat"
            | "up"
            | "down",
        }
      : undefined;

  const apps = latest
    ? COPILOT_APP_KEYS.flatMap((key) => {
        const count = latest.active_by_app[key];
        return count === undefined ? [] : [{ key, count }];
      }).sort((a, b) => b.count - a.count)
    : [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">KI-Barometer · Copilot-Nutzung</p>
          <h1 className="text-2xl font-normal tracking-tight sm:text-3xl">{org.name}</h1>
          {latest ? (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="pill bg-white/70">{SOURCE_LABELS[latest.source]}</span>
              Microsoft-Bericht vom {formatReportDate(latest.report_refresh_date)} · Fenster{" "}
              {latest.period_days} Tage · {data.weeksStored} Wochen gespeichert
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Noch keine Microsoft-Nutzungsdaten.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={dashboardHref}>Dashboard</Link>
          </Button>
          {adminHref && (
            <Button asChild>
              <Link href={adminHref}>Daten verwalten</Link>
            </Button>
          )}
        </div>
      </header>

      {!latest ? (
        <section className="card-soft space-y-4 p-8">
          <h2 className="text-base font-medium">So kommen die Copilot-Daten hier an</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Microsoft zeigt im Admin Center, wie viele Lizenzen aktiv genutzt
            werden, in welchen Apps und wie intensiv. Das KI-Barometer übernimmt
            davon nur Wochen-Summen der Organisation — nie einzelne Personen —
            und stellt sie neben die Befragung.
          </p>
          <ol className="grid gap-3 text-sm sm:grid-cols-2">
            <li className="rounded-2xl bg-white/70 p-4">
              <p className="font-medium">1 · CSV hochladen</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Admin Center → Berichte → Nutzung → Microsoft 365 Copilot →
                Exportieren. In der Verwaltung unter „7 Integrationen“ einspielen.
              </p>
            </li>
            <li className="rounded-2xl bg-white/70 p-4">
              <p className="font-medium">2 · Microsoft 365 verbinden</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ein Klick durch den Microsoft-Admin, danach holt das
                KI-Barometer die Zahlen jede Woche automatisch.
              </p>
            </li>
          </ol>
          {adminHref ? (
            <Button asChild>
              <Link href={adminHref}>Zur Verwaltung · Integrationen</Link>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Bitte die Verwaltung deiner Organisation, die Daten anzubinden.
            </p>
          )}
        </section>
      ) : data.suppressed ? (
        <section className="card-soft p-8 text-center text-sm text-muted-foreground">
          <p>
            Im Microsoft-Bericht sind weniger als {data.k} Lizenzen enthalten.
            Zum Schutz der Anonymität werden die Werte erst ab {data.k} lizenzierten
            Personen angezeigt.
          </p>
        </section>
      ) : (
        <>
          {data.belowK && (
            <Notice tone="info">
              Unter der Anonymitätsschwelle: Der Bericht enthält nur{" "}
              {nf.format(latest.enabled_users)} Lizenzen (k = {data.k}). Diese Werte
              sieht nur die Verwaltung — sie stehen genauso im Microsoft Admin
              Center; Teamleitungen sehen sie nicht.
            </Notice>
          )}
          {integration?.status === "error" && (
            <Notice tone="err">
              Die automatische Synchronisierung ist zuletzt fehlgeschlagen
              {integration.last_error ? `: ${integration.last_error}` : "."}{" "}
              Die angezeigten Werte stammen vom letzten erfolgreichen Import.
            </Notice>
          )}

          <section aria-label="Kennzahlen" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Copilot-Lizenzen"
              value={nf.format(latest.enabled_users)}
              hint="laut Microsoft-Bericht"
            />
            <StatTile
              label="Aktive Nutzer"
              value={pct(rate)}
              hint={
                latestShort
                  ? `${nf.format(latest.active_users)} von ${nf.format(latest.enabled_users)} · 7 Tage: ${pct(activeRate(latestShort))}`
                  : `${nf.format(latest.active_users)} von ${nf.format(latest.enabled_users)} in ${latest.period_days} Tagen`
              }
              delta={delta}
            />
            <StatTile
              label="Prompts je aktivem Nutzer"
              value={latest.prompts_per_active_user === null ? "–" : nf1.format(latest.prompts_per_active_user)}
              hint={
                latest.prompts_total === null
                  ? "nicht im Bericht (Version 1)"
                  : `${nf.format(latest.prompts_total)} Prompts gesamt`
              }
            />
            <StatTile
              label="Ø aktive Tage"
              value={latest.active_days_avg === null ? "–" : nf1.format(latest.active_days_avg)}
              hint={
                latest.active_days_avg === null
                  ? "nicht im Bericht"
                  : `von ${latest.period_days} Tagen, aktive Nutzer`
              }
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-label="Nutzung je App" className="card-soft p-6">
              <SectionTitle aside={`Anteil der ${nf.format(latest.enabled_users)} Lizenzen`}>
                Nutzung je App
              </SectionTitle>
              {apps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine App-Spalten im Bericht.</p>
              ) : (
                <div className="space-y-3">
                  {apps.map(({ key, count }) => (
                    <Bar
                      key={key}
                      label={COPILOT_APP_LABELS[key]}
                      value={`${nf.format(count)} · ${pct(latest.enabled_users > 0 ? count / latest.enabled_users : null)}`}
                      share={latest.enabled_users > 0 ? count / latest.enabled_users : 0}
                    />
                  ))}
                </div>
              )}
            </section>

            <section aria-label="Verlauf" className="card-soft p-6">
              <SectionTitle aside="aktive Nutzer ÷ Lizenzen je Woche">Verlauf</SectionTitle>
              {trend.length < 2 ? (
                <p className="text-sm text-muted-foreground">
                  Ab der zweiten gespeicherten Woche erscheint hier der Verlauf.
                </p>
              ) : (
                <ul className="space-y-3">
                  {trend.slice(-8).map((t) => (
                    <li key={t.week}>
                      <Bar
                        label={t.week}
                        value={pct(t.activeRate)}
                        share={t.activeRate ?? 0}
                        color={t.week === latest.week ? undefined : "var(--viz-deemphasis)"}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {latest.active_days_buckets && (
                <div className="mt-6 border-t border-border pt-4">
                  <p className="mb-3 text-xs text-muted-foreground">
                    Aktive Tage der aktiven Nutzer (von {latest.period_days})
                  </p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {(["1-2", "3-5", "6-10", "11+"] as const).map((bucket) => (
                      <div key={bucket} className="rounded-2xl bg-white/70 px-2 py-3">
                        <p className="text-lg font-light">{nf.format(latest.active_days_buckets?.[bucket] ?? 0)}</p>
                        <p className="text-[11px] text-muted-foreground">{bucket} Tage</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          <section aria-label="Befragung und Telemetrie" className="card-soft p-6">
            <SectionTitle aside="zwei Quellen, zwei Fragen">Befragung vs. Telemetrie</SectionTitle>
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <Bar
                  label={
                    survey
                      ? `Nutzen KI mindestens wöchentlich — Pulse W1.1, ${survey.weeks} Wochen, n = ${nf.format(survey.n)}`
                      : "Nutzen KI mindestens wöchentlich — Pulse W1.1 (noch keine Daten)"
                  }
                  value={pct(survey?.rate ?? null)}
                  share={survey?.rate ?? 0}
                  color="var(--viz-series-1)"
                />
                <Bar
                  label={`Copilot aktiv laut Microsoft — ${latest.period_days} Tage bis ${formatReportDate(latest.report_refresh_date)}`}
                  value={pct(rate)}
                  share={rate ?? 0}
                />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Die Befragung zählt jede KI-Nutzung (alle Tools, Selbstauskunft),
                Microsoft nur bewusste Copilot-Aktionen lizenzierter Personen.
                Liegt die Telemetrie deutlich unter der Befragung, wird Copilot
                weniger genutzt als das Team es beschreibt — oder das Team nutzt
                andere Werkzeuge. Ob Copilot nützt und wie sicher sich Menschen
                fühlen, sagt nur die Befragung.
              </p>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-label="Lizenzcheck" className="card-soft p-6">
              <SectionTitle
                aside={
                  license?.basis === "seats"
                    ? "Basis: Anzahl Lizenzen aus den Tool-Einstellungen"
                    : "Basis: lizenzierte Nutzer laut Bericht"
                }
              >
                Lizenzcheck
              </SectionTitle>
              {license ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Lizenzen</dt>
                    <dd className="mt-0.5 font-medium">{nf.format(license.seats)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Ungenutzt im Fenster</dt>
                    <dd className="mt-0.5 font-medium">{nf.format(license.unusedSeats)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Lizenz pro Kopf und Monat</dt>
                    <dd className="mt-0.5 font-medium">
                      {license.costPerSeatEur === null ? "–" : `${nf.format(license.costPerSeatEur)} €`}
                    </dd>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-[11px] text-muted-foreground">Ungenutzte Lizenzkosten pro Monat</dt>
                    <dd className="mt-0.5 text-3xl font-light tracking-tight">
                      {license.unusedCostEur === null ? "–" : `${nf.format(license.unusedCostEur)} €`}
                    </dd>
                  </div>
                  <p className="col-span-2 text-[11px] leading-relaxed text-muted-foreground sm:col-span-3">
                    {license.costPerSeatEur === null
                      ? "Lizenzkosten für Microsoft Copilot in der Verwaltung eintragen, dann rechnet die Kachel die ungenutzten Kosten aus."
                      : "Ungenutzt = lizenziert, aber keine Copilot-Aktion im Fenster. Unter 20 % Aktivquote löst Empfehlung R5 (Lizenz prüfen) aus."}
                  </p>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Keine Lizenzangabe im Bericht.</p>
              )}
            </section>

            <section aria-label="Stunden-Beleg" className="card-soft p-6">
              <SectionTitle aside="ROI-Beleg (Stufe 3)">Gesparte Stunden</SectionTitle>
              {latest.assisted_hours !== null ? (
                <div>
                  <p className="text-3xl font-light tracking-tight">
                    {nf.format(latest.assisted_hours)} <span className="text-lg text-muted-foreground">h</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Microsofts Schätzung „Copilot assisted hours“ im Fenster —
                    unabhängig von der Selbsteinschätzung im Pulse (W2.1).
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Microsofts Stundenschätzung („Copilot assisted hours“) gibt es ab
                  50 Lizenzen im Copilot Dashboard. Ihr Export ist noch nicht
                  angebunden — bis dahin gilt im ROI die Selbsteinschätzung der
                  Befragten.
                </p>
              )}
            </section>
          </div>
        </>
      )}

      <footer className="mt-auto flex flex-wrap gap-4 border-t border-border pt-4 text-xs text-muted-foreground">
        {footer}
      </footer>
    </main>
  );
}
