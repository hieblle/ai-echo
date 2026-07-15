import Link from "next/link";
import { notFound } from "next/navigation";
import { simulateWeek, updateRecommendationStatus } from "@/app/actions";
import { GapDumbbells } from "@/components/dashboard/gap-dumbbell";
import { Heatmap } from "@/components/dashboard/heatmap";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Button } from "@/components/ui/button";
import {
  getDashboardData,
  monthOfIsoWeek,
  type DashboardRecommendation,
} from "@/lib/server/dashboard-service";
import { WEEKLY_ADOPTION_MIN_SAMPLE } from "@/lib/domain/kpi";
import { cn } from "@/lib/utils";
import type { WeeklyKpis } from "@/lib/types";

// Stateful in-memory demo data — always render fresh.
export const dynamic = "force-dynamic";

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

function pct(value: number | null): string {
  return value === null ? "–" : `${nf.format(value * 100)} %`;
}

function idx(value: number | null): string {
  return value === null ? "–" : nf1.format(value);
}

function latestNonNull(
  history: WeeklyKpis[],
  key: "adoption_rate" | "efficiency_index" | "trust_index" | "sentiment_index" | "participation_rate",
): number | null {
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

function spark(
  history: WeeklyKpis[],
  key: "adoption_rate" | "efficiency_index" | "trust_index" | "sentiment_index" | "participation_rate",
  scale = 1,
) {
  return history.map((h) => ({
    week: h.week,
    value: h[key] === null ? null : (h[key] as number) * scale,
  }));
}

function RecommendationCard({
  rec,
  orgId,
}: {
  rec: DashboardRecommendation;
  orgId: string;
}) {
  const done = rec.status !== "open";
  async function setStatus(formData: FormData) {
    "use server";
    await updateRecommendationStatus({
      orgId: formData.get("orgId"),
      ruleKey: formData.get("ruleKey"),
      context: formData.get("context"),
      status: formData.get("status"),
    });
  }
  const hidden = (
    <>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="ruleKey" value={rec.rule.key} />
      <input type="hidden" name="context" value={rec.context} />
    </>
  );
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-lg border bg-card p-4",
        done && "opacity-60",
      )}
    >
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {rec.rule.key} · {ACTION_TYPE_LABELS[rec.rule.action_type]}
          </span>
          {rec.status === "done" && (
            <span className="text-xs font-medium" style={{ color: "var(--viz-delta-good)" }}>
              Erledigt ✓
            </span>
          )}
          {rec.status === "dismissed" && (
            <span className="text-xs text-muted-foreground">Verworfen</span>
          )}
        </div>
        <h3 className="font-semibold">{rec.rule.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{rec.detail}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {rec.rule.course_url && (
          <Button asChild size="sm" variant="outline">
            <a href={rec.rule.course_url} target="_blank" rel="noreferrer">
              Zum Kurs ↗
            </a>
          </Button>
        )}
        {rec.status === "open" ? (
          <>
            <form action={setStatus}>
              {hidden}
              <input type="hidden" name="status" value="done" />
              <Button size="sm" variant="secondary" type="submit">
                Erledigt
              </Button>
            </form>
            <form action={setStatus}>
              {hidden}
              <input type="hidden" name="status" value="dismissed" />
              <Button size="sm" variant="ghost" type="submit">
                Verwerfen
              </Button>
            </form>
          </>
        ) : (
          <form action={setStatus}>
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

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getDashboardData(slug);
  if (!data) notFound();

  const {
    org,
    orgs,
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
  const reportMonth = latestWeek ? monthOfIsoWeek(latestWeek) : null;
  const trust = latestNonNull(history, "trust_index");
  const sentiment = latestNonNull(history, "sentiment_index");
  const participation = latestNonNull(history, "participation_rate");
  const openRecs = recommendations.filter((r) => r.status === "open");

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-6 py-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              KI-Barometer · Dashboard
            </p>
            <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
            {latestWeek && (
              <p className="text-sm text-muted-foreground">
                Datenstand: {weeks.length} Wochen bis {latestWeek}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={simulateWeek}>
              <Button type="submit" variant="outline">
                + Woche simulieren
              </Button>
            </form>
            {reportMonth && (
              <Button asChild>
                <Link href={`/report/${org.slug}/${reportMonth}`}>
                  Monatsreport
                </Link>
              </Button>
            )}
          </div>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Organisation wählen">
          {orgs.map((o) => (
            <Link
              key={o.id}
              href={`/dashboard/${o.slug}`}
              aria-current={o.id === org.id ? "true" : undefined}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition-colors hover:bg-accent",
                o.id === org.id &&
                  "border-primary bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {o.name}
            </Link>
          ))}
        </nav>
      </header>

      {weeks.length === 0 ? (
        <section className="rounded-lg border bg-muted/30 p-8 text-center text-muted-foreground">
          <p>
            Für diese Organisation liegen noch keine Befragungsdaten vor.
            Spiele im <Link href="/demo" className="underline">Demo-Modus</Link>{" "}
            Befragungen durch oder wechsle zu einer der generierten Demo-Orgs.
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
              delta={deltaVsBaseline(adoption.current, adoption.baseline, true)}
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
              delta={deltaVsBaseline(efficiencyCombined, baseline.efficiency_index, false)}
              spark={spark(history, "efficiency_index")}
              sparkDomain={[0, 10]}
            />
            <StatTile
              label="Vertrauensindex"
              value={idx(trust)}
              delta={deltaVsBaseline(trust, baseline.trust_index, false)}
              spark={spark(history, "trust_index")}
              sparkDomain={[0, 10]}
            />
            <StatTile
              label="Stimmungsindex"
              value={idx(sentiment)}
              delta={deltaVsBaseline(sentiment, baseline.sentiment_index, false)}
              spark={spark(history, "sentiment_index")}
              sparkDomain={[0, 10]}
            />
            <StatTile
              label="Teilnahmequote"
              value={pct(participation)}
              spark={spark(history, "participation_rate", 100)}
              sparkUnit=" %"
              sparkDomain={[0, 100]}
            />
          </section>

          {/* ROI-Kachel (Leitkennzahl, SPEC §3) */}
          <section
            aria-label="ROI"
            className="grid gap-3 rounded-lg border bg-card p-6 sm:grid-cols-[auto_1fr]"
          >
            <div className="pr-6 sm:border-r">
              <p className="text-sm text-muted-foreground">
                Netto-Ersparnis pro Monat
              </p>
              <p className="text-5xl font-semibold tracking-tight">
                {nf.format(roi.net_savings_eur)}{" "}
                <span className="text-2xl text-muted-foreground">€</span>
              </p>
              {roi.roi_multiple !== null && (
                <p className="mt-1 text-sm text-muted-foreground">
                  ROI-Multiple: {nf1.format(roi.roi_multiple)}×
                </p>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Gesparte Stunden</dt>
                <dd className="font-medium">{nf.format(roi.saved_hours)} h</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Hochgerechnet*</dt>
                <dd className="font-medium">
                  {roi.saved_hours_extrapolated === null
                    ? "–"
                    : `${nf.format(roi.saved_hours_extrapolated)} h`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Brutto-Ersparnis</dt>
                <dd className="font-medium">{nf.format(roi.gross_savings_eur)} €</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Lizenzkosten</dt>
                <dd className="font-medium">{nf.format(roi.license_costs_eur)} €</dd>
              </div>
              <p className="col-span-2 text-xs text-muted-foreground sm:col-span-4">
                Basis: letzte 4 Wochen, {nf.format(org.hourly_rate_default)} €/h ·
                *auf Nichtteilnehmende hochgerechnet (konservativer Erstwert:
                nur gemeldete Stunden, SPEC §10).
              </p>
            </dl>
          </section>

          {/* Heatmap (k-Anonymität sichtbar) */}
          <section aria-label="Abteilungs-Heatmap" className="rounded-lg border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">
              Abteilungen × Dimensionen
            </h2>
            <Heatmap
              cells={heatmap}
              departments={departments}
              k={org.k_anonymity_min}
            />
          </section>

          {/* Perception Gap */}
          <section aria-label="Perception Gap" className="rounded-lg border bg-card p-6">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">Perception Gap</h2>
              {nps && (
                <p className="text-sm text-muted-foreground">
                  Tool-NPS: <span className="font-semibold text-foreground">{nps.value > 0 ? "+" : ""}{nps.value}</span>{" "}
                  (n = {nps.n})
                </p>
              )}
            </div>
            <GapDumbbells pairs={gapPairs} />
          </section>

          {/* Empfehlungs-Cards (Trigger R1–R7) */}
          <section aria-label="Empfehlungen">
            <h2 className="mb-3 text-lg font-semibold">
              Empfehlungen{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {openRecs.length} offen · regelbasiert (R1–R7)
              </span>
            </h2>
            {recommendations.length === 0 ? (
              <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                Aktuell löst keine Regel aus — alle Kennzahlen liegen über den
                Schwellwerten.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {recommendations.map((rec) => (
                  <RecommendationCard
                    key={`${rec.rule.key}|${rec.context}`}
                    rec={rec}
                    orgId={org.id}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Freitext-Highlights (nur Org-Ebene, zufällige Reihenfolge, §7.3) */}
          <section aria-label="Stimmen aus dem Team">
            <h2 className="mb-3 text-lg font-semibold">
              Stimmen aus dem Team{" "}
              <span className="text-sm font-normal text-muted-foreground">
                anonym · ohne Abteilung/Datum
              </span>
            </h2>
            {freeTexts.length === 0 ? (
              <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                Noch keine Freitext-Antworten.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {freeTexts.map((t, i) => (
                  <figure key={i} className="rounded-lg border bg-card p-4">
                    <blockquote className="text-sm">„{t.text}“</blockquote>
                    <figcaption className="mt-2 text-xs text-muted-foreground">
                      {t.question}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <footer className="flex flex-wrap gap-4 border-t pt-4 text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">
          Startseite
        </Link>
        <Link href="/demo" className="hover:underline">
          Survey-Demo
        </Link>
        <span>
          Demo-Daten: deterministisch generiert, In-Memory (Neustart setzt
          zurück).
        </span>
      </footer>
    </main>
  );
}
