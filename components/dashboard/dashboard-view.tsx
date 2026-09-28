/**
 * Dashboard body (SPEC §8 F5) in design D, shared by the demo route and the
 * product route. Server component: receives the aggregated `DashboardData`
 * and the actions/links of its host. Team views (data.scope) hide the
 * org-level sections (ROI, recommendations, free texts) and show nothing at
 * all while the team is below the anonymity threshold.
 */

import Link from "next/link";
import { GapDumbbells } from "@/components/dashboard/gap-dumbbell";
import { Heatmap } from "@/components/dashboard/heatmap";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Button } from "@/components/ui/button";
import { WEEKLY_ADOPTION_MIN_SAMPLE } from "@/lib/domain/kpi";
import type {
  DashboardData,
  DashboardRecommendation,
} from "@/lib/server/dashboard-service";
import { cn } from "@/lib/utils";
import type { RoiPopulationSource, WeeklyKpis } from "@/lib/types";

const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const ACTION_TYPE_LABELS: Record<string, string> = {
  course: "Kurs-Empfehlung",
  strategy_call: "Strategie-Call",
  license_review: "Lizenz-Prüfung",
  communication: "Kommunikation",
};

type HistoryKey =
  | "adoption_rate"
  | "efficiency_index"
  | "trust_index"
  | "sentiment_index"
  | "participation_rate";

function pct(value: number | null): string {
  return value === null ? "–" : `${nf.format(value * 100)} %`;
}

function idx(value: number | null): string {
  return value === null ? "–" : nf1.format(value);
}

function eur(value: number | null): string {
  return value === null ? "–" : nf.format(value);
}

function hours(value: number | null, digits = 0): string {
  if (value === null) return "–";
  return `${(digits === 0 ? nf : nf1).format(value)} h`;
}

function populationLabel(source: RoiPopulationSource | null): string {
  switch (source) {
    case "seats":
      return "Lizenzen";
    case "invited":
      return "eingeladene Mitglieder";
    case "respondents":
      return "Antwortende";
    default:
      return "–";
  }
}

function latestNonNull(history: WeeklyKpis[], key: HistoryKey): number | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const v = history[i]?.[key];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

function deltaVsBaseline(
  current: number | null,
  baseline: number | null,
  asPercent: boolean,
): { text: string; direction: "up" | "down" | "flat" } | undefined {
  if (current === null || baseline === null) return undefined;
  const diff = current - baseline;
  const direction = Math.abs(diff) < 0.005 ? "flat" : diff > 0 ? "up" : "down";
  const text = asPercent
    ? `${diff >= 0 ? "+" : "−"}${nf.format(Math.abs(diff) * 100)} Pp. vs. Baseline`
    : `${diff >= 0 ? "+" : "−"}${nf1.format(Math.abs(diff))} vs. Baseline`;
  return { text, direction };
}

function spark(history: WeeklyKpis[], key: HistoryKey, scale = 1) {
  return history.map((h) => ({
    week: h.week,
    value: h[key] === null ? null : (h[key] as number) * scale,
  }));
}

export interface OrgSwitcherEntry {
  name: string;
  href: string;
  active: boolean;
}

export interface DashboardViewProps {
  data: DashboardData;
  /** Orgs the viewer may switch between (one entry = no switcher). */
  orgSwitcher: OrgSwitcherEntry[];
  /** Link to the monthly report; null hides the button. */
  reportHref: string | null;
  /** Link to the Copilot telemetry page (shown when telemetry exists). */
  copilotHref?: string | null;
  /** Demo only: "+ Woche simulieren". */
  simulateAction?: () => Promise<void>;
  /** Handles the done/dismissed forms (hidden fields: ruleKey, context, status). */
  recommendationAction: (formData: FormData) => Promise<void>;
  /** Shown when no data exists yet. */
  emptyHint: React.ReactNode;
  footer: React.ReactNode;
}

function SectionTitle({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-base font-medium">{children}</h2>
      {aside && <div className="text-[11px] text-muted-foreground">{aside}</div>}
    </div>
  );
}

function RecommendationCard({
  rec,
  action,
}: {
  rec: DashboardRecommendation;
  action: (formData: FormData) => Promise<void>;
}) {
  const done = rec.status !== "open";
  const hidden = (
    <>
      <input type="hidden" name="ruleKey" value={rec.rule.key} />
      <input type="hidden" name="context" value={rec.context} />
    </>
  );
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-3 p-5",
        done ? "card-soft text-muted-foreground" : "card-solid",
      )}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="pill bg-secondary text-foreground">
            <span
              className="status-dot"
              style={{ background: done ? "var(--status-good)" : "var(--status-alert)" }}
              aria-hidden
            />
            {rec.rule.key} · {ACTION_TYPE_LABELS[rec.rule.action_type]}
          </span>
          {rec.status === "done" && (
            <span className="text-[11px] font-medium" style={{ color: "var(--viz-delta-good)" }}>
              Erledigt ✓
            </span>
          )}
          {rec.status === "dismissed" && (
            <span className="text-[11px]">Verworfen</span>
          )}
        </div>
        <h3 className={cn("text-sm font-medium", !done && "text-foreground")}>{rec.rule.title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{rec.detail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {rec.rule.course_url && (
          <Button asChild size="sm" variant="outline">
            <a href={rec.rule.course_url} target="_blank" rel="noreferrer">
              Zum Kurs ↗
            </a>
          </Button>
        )}
        {rec.status === "open" ? (
          <>
            <form action={action}>
              {hidden}
              <input type="hidden" name="status" value="done" />
              <Button size="sm" variant="secondary" type="submit">
                Erledigt
              </Button>
            </form>
            <form action={action}>
              {hidden}
              <input type="hidden" name="status" value="dismissed" />
              <Button size="sm" variant="ghost" type="submit">
                Verwerfen
              </Button>
            </form>
          </>
        ) : (
          <form action={action}>
            {hidden}
            <input type="hidden" name="status" value="open" />
            <Button size="sm" variant="ghost" type="submit">
              Wieder öffnen
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export function DashboardView({
  data,
  orgSwitcher,
  reportHref,
  copilotHref = null,
  simulateAction,
  recommendationAction,
  emptyHint,
  footer,
}: DashboardViewProps) {
  const {
    org,
    scope,
    departments,
    weeks,
    history,
    baseline,
    adoption,
    efficiencyCombined,
    roi,
    gapPairs,
    nps,
    heatmap,
    recommendations,
    freeTexts,
  } = data;

  const latestWeek = weeks[weeks.length - 1];
  const trust = latestNonNull(history, "trust_index");
  const sentiment = latestNonNull(history, "sentiment_index");
  const participation = latestNonNull(history, "participation_rate");
  const openRecs = recommendations.filter((r) => r.status === "open");
  // With < 3 weeks "latest vs baseline" compares a window against itself.
  const deltaOf = (
    current: number | null,
    base: number | null,
    asPercent: boolean,
  ) =>
    history.length >= 3 ? deltaVsBaseline(current, base, asPercent) : undefined;

  const perHeadShare =
    roi.savings_per_head_eur && roi.license_cost_per_head_eur !== null
      ? Math.min(1, roi.license_cost_per_head_eur / Math.max(roi.savings_per_head_eur, 1))
      : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              KI-Barometer · {scope ? "Team-Dashboard" : "Dashboard"}
            </p>
            <h1 className="text-2xl font-normal tracking-tight sm:text-3xl">
              {org.name}
              {scope && (
                <span className="text-muted-foreground"> · {scope.departmentName}</span>
              )}
            </h1>
            {latestWeek && (
              <p className="text-xs text-muted-foreground">
                Datenstand: {weeks.length} Wochen bis {latestWeek}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {simulateAction && (
              <form action={simulateAction}>
                <Button type="submit" variant="outline">
                  + Woche simulieren
                </Button>
              </form>
            )}
            {reportHref && (
              <Button asChild>
                <Link href={reportHref}>Monatsreport</Link>
              </Button>
            )}
          </div>
        </div>
        {orgSwitcher.length > 1 && (
          <nav className="flex flex-wrap gap-2" aria-label="Organisation wählen">
            {orgSwitcher.map((o) => (
              <Link
                key={o.href}
                href={o.href}
                aria-current={o.active ? "true" : undefined}
                className={cn(
                  "rounded-full bg-white/70 px-4 py-1.5 text-xs transition-colors hover:bg-white",
                  o.active && "bg-primary text-primary-foreground shadow-pill hover:bg-primary",
                )}
              >
                {o.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {weeks.length === 0 ? (
        <section className="card-soft p-8 text-center text-sm text-muted-foreground">
          {emptyHint}
        </section>
      ) : scope?.suppressed ? (
        <section className="card-soft p-8 text-center text-sm text-muted-foreground">
          <p>
            Für {scope.departmentName} liegen im Betrachtungszeitraum weniger
            als {org.k_anonymity_min} Antworten vor. Zum Schutz der Anonymität
            werden für dieses Team keine Kennzahlen angezeigt — die Antworten
            fließen in die Gesamtauswertung der Organisation ein.
          </p>
        </section>
      ) : (
        <>
          {/* 4 Index-Kacheln + Teilnahme (SPEC §13 Phase 2 / F5) */}
          <section aria-label="Indizes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile
              label="Adoption-Rate"
              value={pct(adoption.current)}
              hint="gepoolt über 4 Wochen"
              delta={deltaOf(adoption.current, adoption.baseline, true)}
              spark={history.map((h) => ({
                week: h.week,
                // Weeks without a real W1.1 sample (rotation did not draw it)
                // carry no adoption evidence — show a gap, not a fake dip.
                value:
                  h.adoption_rate === null ||
                  h.n_adoption < WEEKLY_ADOPTION_MIN_SAMPLE
                    ? null
                    : h.adoption_rate * 100,
              }))}
              sparkUnit=" %"
              sparkDomain={[0, 100]}
            />
            <StatTile
              label="Effizienzindex"
              value={idx(efficiencyCombined)}
              hint="W2.3 + normiertes M1.3"
              delta={deltaOf(efficiencyCombined, baseline.efficiency_index, false)}
              spark={spark(history, "efficiency_index")}
              sparkDomain={[0, 10]}
            />
            <StatTile
              label="Vertrauensindex"
              value={idx(trust)}
              delta={deltaOf(trust, baseline.trust_index, false)}
              spark={spark(history, "trust_index")}
              sparkDomain={[0, 10]}
            />
            <StatTile
              label="Stimmungsindex"
              value={idx(sentiment)}
              delta={deltaOf(sentiment, baseline.sentiment_index, false)}
              spark={spark(history, "sentiment_index")}
              sparkDomain={[0, 10]}
            />
            <StatTile
              label="Teilnahmequote"
              value={pct(participation)}
              hint={scope ? "Organisation gesamt" : undefined}
              spark={spark(history, "participation_rate", 100)}
              sparkUnit=" %"
              sparkDomain={[0, 100]}
            />
          </section>

          {/* Copilot-Telemetrie (D4.10) — org level only, links to its page */}
          {!scope && data.copilot && (
            <section
              aria-label="Copilot-Nutzung"
              className="card-soft flex flex-wrap items-center justify-between gap-3 px-6 py-4"
            >
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="status-dot" style={{ background: "var(--accent-yellow)" }} aria-hidden />
                <span className="font-medium">Microsoft 365 Copilot</span>
                <span className="text-muted-foreground">
                  {pct(data.copilot.activeRate)} von {nf.format(data.copilot.enabled)} Lizenzen aktiv
                  {" · "}
                  {data.copilot.periodDays} Tage · Stand {data.copilot.week} · laut Microsoft-Bericht
                </span>
              </p>
              {copilotHref && (
                <Button asChild variant="outline" size="sm">
                  <Link href={copilotHref}>Copilot-Nutzung</Link>
                </Button>
              )}
            </section>
          )}

          {/* ROI-Kachel (Leitkennzahl, SPEC §3, D4.8) — org level only */}
          {!scope && (
            <section
              aria-label="ROI"
              className="card-soft grid gap-6 p-6 lg:grid-cols-[300px_1fr]"
            >
              <div className="flex flex-col gap-2 lg:border-r lg:border-border lg:pr-6">
                <p className="text-xs text-muted-foreground">Netto-Ersparnis pro Monat</p>
                <p className="text-5xl font-light tracking-tight">
                  {eur(roi.net_savings_eur)}{" "}
                  <span className="text-2xl text-muted-foreground">€</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {roi.roi_multiple !== null && (
                    <>ROI-Multiple: <span className="font-medium text-foreground">{nf1.format(roi.roi_multiple)}×</span> · </>
                  )}
                  {roi.population === null
                    ? "noch keine Stundenangaben"
                    : `für ${nf.format(roi.population)} Personen (${populationLabel(roi.population_source)})`}
                </p>
                {roi.savings_per_head_eur !== null && (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span>Ersparnis pro Kopf</span>
                        <span className="text-muted-foreground">{eur(roi.savings_per_head_eur)} €</span>
                      </div>
                      <div className="bar-track"><div className="bar-fill" style={{ width: "100%" }} /></div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span>Lizenz pro Kopf</span>
                        <span className="text-muted-foreground">{eur(roi.license_cost_per_head_eur)} €</span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${Math.round((perHeadShare ?? 0) * 100)}%`,
                            background: "var(--status-bad)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] text-muted-foreground">Gespart pro Kopf und Woche</dt>
                  <dd className="mt-0.5 font-medium">{hours(roi.hours_per_head_week, 1)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Ersparnis pro Kopf und Monat</dt>
                  <dd className="mt-0.5 font-medium">{eur(roi.savings_per_head_eur)} €</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Lizenz pro Kopf und Monat</dt>
                  <dd className="mt-0.5 font-medium">{eur(roi.license_cost_per_head_eur)} €</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Gespart gesamt pro Monat</dt>
                  <dd className="mt-0.5 font-medium">{hours(roi.saved_hours_extrapolated)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Brutto-Ersparnis</dt>
                  <dd className="mt-0.5 font-medium">{eur(roi.gross_savings_eur)} €</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Lizenzkosten gesamt</dt>
                  <dd className="mt-0.5 font-medium">{nf.format(roi.license_costs_eur)} €</dd>
                </div>
                <p className="col-span-2 text-[11px] leading-relaxed text-muted-foreground sm:col-span-3">
                  Basis: letzte {data.roiWindowWeeks} Wochen, {nf.format(roi.saved_hours)} h
                  gemeldet in {nf.format(roi.heads)} ausgefüllten Pulsen (wer keine KI
                  nutzt, zählt mit 0 h) · {nf.format(data.roiHourlyRate)} €/h{" "}
                  {data.roiRateFromF5 ? "(Ø aus F5)" : "(Org-Standard)"} · Monat = 4,33
                  Wochen · Selbsteinschätzung der Befragten (W2.1).
                </p>
              </dl>
            </section>
          )}

          {/* Heatmap (k-Anonymität sichtbar) */}
          <section aria-label="Abteilungs-Heatmap" className="card-soft p-6">
            <SectionTitle aside="Letzte 4 Wochen · Werte nur ab k Antworten je Abteilung">
              {scope ? "Team im Vergleich zur Organisation" : "Abteilungen × Dimensionen"}
            </SectionTitle>
            <Heatmap
              cells={heatmap}
              departments={departments}
              k={org.k_anonymity_min}
            />
          </section>

          {/* Perception Gap */}
          <section aria-label="Perception Gap" className="card-soft p-6">
            <SectionTitle
              aside={
                nps ? (
                  <>
                    Tool-NPS: <span className="font-medium text-foreground">{nps.value > 0 ? "+" : ""}{nps.value}</span>{" "}
                    (n = {nps.n})
                  </>
                ) : undefined
              }
            >
              Perception Gap
            </SectionTitle>
            <GapDumbbells pairs={gapPairs} />
          </section>

          {/* Empfehlungs-Cards (Trigger R1–R7) — org level only */}
          {!scope && (
            <section aria-label="Empfehlungen">
              <SectionTitle aside={`${openRecs.length} offen · regelbasiert (R1–R7)`}>
                Empfehlungen
              </SectionTitle>
              {recommendations.length === 0 ? (
                <p className="card-soft p-5 text-sm text-muted-foreground">
                  Aktuell löst keine Regel aus — alle Kennzahlen liegen über den
                  Schwellwerten.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {recommendations.map((rec) => (
                    <RecommendationCard
                      key={`${rec.rule.key}|${rec.context}`}
                      rec={rec}
                      action={recommendationAction}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Freitext-Highlights (nur Org-Ebene, zufällige Reihenfolge, §7.3) */}
          {!scope && (
            <section aria-label="Stimmen aus dem Team">
              <SectionTitle aside="anonym · ohne Abteilung und Datum">
                Stimmen aus dem Team
              </SectionTitle>
              {freeTexts.length === 0 ? (
                <p className="card-soft p-5 text-sm text-muted-foreground">
                  Noch keine Freitext-Antworten.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {freeTexts.map((t, i) => (
                    <figure key={i} className="card-soft p-5">
                      <blockquote className="text-sm leading-relaxed">„{t.text}“</blockquote>
                      <figcaption className="mt-2 text-[11px] text-muted-foreground">
                        {t.question}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      <footer className="mt-auto flex flex-wrap gap-4 border-t border-border pt-4 text-xs text-muted-foreground">
        {footer}
      </footer>
    </main>
  );
}
