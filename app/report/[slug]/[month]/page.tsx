import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GapDumbbells } from "@/components/dashboard/gap-dumbbell";
import { getReportData } from "@/lib/server/dashboard-service";
import type { WeeklyKpis } from "@/lib/types";

// Stateful in-memory demo data — always render fresh.
export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function pct(v: number | null): string {
  return v === null ? "–" : `${nf.format(v * 100)} %`;
}
function idx(v: number | null): string {
  return v === null ? "–" : nf1.format(v);
}
function latest(
  history: WeeklyKpis[],
  key: "adoption_rate" | "trust_index" | "sentiment_index" | "participation_rate",
): number | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const v = history[i]?.[key];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ slug: string; month: string }>;
}) {
  const { slug, month } = await params;
  const data = await getReportData(slug, month);
  if (!data) notFound();

  const {
    org,
    history,
    baseline,
    efficiencyCombined,
    roi,
    gapPairs,
    nps,
    recommendations,
    freeTexts,
    trainingWishes,
    aiAct,
  } = data;

  const kpiRows: { label: string; current: string; baseline: string }[] = [
    {
      label: "Adoption-Rate",
      current: pct(data.adoption.current),
      baseline: pct(data.adoption.baseline),
    },
    {
      label: "Effizienzindex (0–10)",
      current: idx(efficiencyCombined),
      baseline: idx(baseline.efficiency_index),
    },
    {
      label: "Vertrauensindex (0–10)",
      current: idx(latest(history, "trust_index")),
      baseline: idx(baseline.trust_index),
    },
    {
      label: "Stimmungsindex (0–10)",
      current: idx(latest(history, "sentiment_index")),
      baseline: idx(baseline.sentiment_index),
    },
    {
      label: "Teilnahmequote",
      current: pct(latest(history, "participation_rate")),
      baseline: "–",
    },
    {
      label: "Tool-NPS",
      current: nps ? `${nps.value > 0 ? "+" : ""}${nps.value}` : "–",
      baseline: "–",
    },
  ];

  const openRecs = recommendations.filter((r) => r.status === "open");
  const topTexts = freeTexts.slice(0, 5);

  return (
    <main className="mx-auto max-w-3xl px-8 py-10 print:max-w-none print:px-0 print:py-0">
      {/* Screen-only toolbar */}
      <div className="print-hidden mb-8 flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          Druckansicht — über den Browser-Druckdialog als PDF speichern
          (Phase 2: Print-Route, PDF-Generator folgt in Phase 5).
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/${org.slug}`}>Zum Dashboard</Link>
          </Button>
        </div>
      </div>

      {/* Report header */}
      <header className="mb-8 border-b pb-6">
        <p className="text-sm text-muted-foreground">
          KI-Barometer · Monatsreport · dbrains academy
        </p>
        <h1 className="mt-1 text-3xl font-bold">{org.name}</h1>
        <p className="mt-1 text-lg text-muted-foreground">
          {monthLabel(month)} · Datenbasis: {data.weeks.length} Pulse-Wochen (
          {data.weeks.join(", ")})
        </p>
      </header>

      {/* 1. Kennzahlen */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">1. Kennzahlen & Trend</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 font-medium">Kennzahl</th>
              <th className="py-2 text-right font-medium">Aktuell</th>
              <th className="py-2 text-right font-medium">Baseline</th>
            </tr>
          </thead>
          <tbody>
            {kpiRows.map((row) => (
              <tr key={row.label} className="border-b border-dashed">
                <td className="py-2">{row.label}</td>
                <td className="py-2 text-right font-medium">{row.current}</td>
                <td className="py-2 text-right text-muted-foreground">
                  {row.baseline}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">ROI im Berichtsmonat</p>
          <p className="text-2xl font-semibold">
            {nf.format(roi.net_savings_eur)} € Netto-Ersparnis
            {roi.roi_multiple !== null && (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                (Multiple: {nf1.format(roi.roi_multiple)}×)
              </span>
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {nf.format(roi.saved_hours)} gemeldete Stunden ×{" "}
            {nf.format(org.hourly_rate_default)} €/h −{" "}
            {nf.format(roi.license_costs_eur)} € Lizenzkosten. Hochgerechnet
            auf Nichtteilnehmende:{" "}
            {roi.saved_hours_extrapolated === null
              ? "–"
              : `${nf.format(roi.saved_hours_extrapolated)} h`}
            .
          </p>
        </div>
      </section>

      {/* 2. Gap-Analyse */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">2. Perception Gap</h2>
        <GapDumbbells pairs={gapPairs} />
      </section>

      {/* 3. Use Cases */}
      <section className="mb-8 print-break-before">
        <h2 className="mb-3 text-xl font-semibold">3. Top-Use-Cases & Stimmen</h2>
        {topTexts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine Freitext-Antworten im Berichtszeitraum.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {topTexts.map((t, i) => (
              <li key={i} className="rounded border p-3">
                „{t.text}“{" "}
                <span className="text-xs text-muted-foreground">
                  — {t.question}
                </span>
              </li>
            ))}
          </ul>
        )}
        {trainingWishes.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Meistgenannte Schulungswünsche:{" "}
            {trainingWishes
              .slice(0, 3)
              .map((w) => `${w.topic} (${nf.format(w.share * 100)} %)`)
              .join(" · ")}
          </p>
        )}
      </section>

      {/* 4. Empfehlungen */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">4. Empfehlungen</h2>
        {recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine Regel ausgelöst — alle Kennzahlen über den Schwellwerten.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recommendations.map((rec) => (
              <li
                key={`${rec.rule.key}|${rec.context}`}
                className="rounded border p-3"
              >
                <span className="font-medium">
                  {rec.rule.key} · {rec.rule.title}
                </span>
                {rec.status !== "open" && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({rec.status === "done" ? "erledigt" : "verworfen"})
                  </span>
                )}
                <br />
                <span className="text-muted-foreground">{rec.detail}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {openRecs.length} offene Empfehlung(en) zum Berichtszeitpunkt.
        </p>
      </section>

      {/* 5. AI-Act-Kompetenznachweis (SPEC §2 P5, §3) */}
      <section className="mb-8 rounded-lg border p-5">
        <h2 className="mb-1 text-xl font-semibold">
          5. KI-Kompetenz-Nachweis (Art. 4 EU AI Act)
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Aggregierte, anonyme Kennzahlen zur nachweisbaren KI-Kompetenz der
          Belegschaft — für HR/Compliance.
        </p>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Selbsteinschätzung (Baseline, O4)</dt>
            <dd className="text-lg font-semibold">{idx(aiAct.baselineKnowledge)} / 10</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sicherheit aktuell (M3.1)</dt>
            <dd className="text-lg font-semibold">{idx(aiAct.currentConfidence)} / 10</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kurs absolviert (M3.3)</dt>
            <dd className="text-lg font-semibold">{pct(aiAct.courseShare)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Ø Teilnahmequote</dt>
            <dd className="text-lg font-semibold">{pct(aiAct.avgWeeklyParticipation)}</dd>
          </div>
        </dl>
      </section>

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        Erstellt mit KI-Barometer (dbrains academy). Anonymität: Auswertungen
        nur ab n ≥ {org.k_anonymity_min} pro Abteilung; Freitexte ohne
        Personen-/Abteilungsbezug (SPEC §7).
      </footer>
    </main>
  );
}
