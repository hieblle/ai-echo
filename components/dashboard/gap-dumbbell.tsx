/**
 * Perception-gap dumbbells (SPEC §10) in design D: one row per mirrored
 * pair, the employee dot in ink and the leadership dot in the yellow accent
 * (with a dark ring, so the two are told apart by lightness as well) on a
 * shared 0–10 hairline. Plain positioned HTML, so it keeps its size on
 * phones instead of scaling down like an SVG would.
 */

import type { GapPairResult, GapPairKey } from "@/lib/types";

const PAIR_LABELS: Record<GapPairKey, { title: string; detail: string }> = {
  strategy: {
    title: "Strategie-Klarheit",
    detail: "M5.1 (Mitarbeitende) ↔ F6 (Führung)",
  },
  competence: {
    title: "KI-Kompetenz",
    detail: "M3.1 (Selbsteinschätzung) ↔ F7 (Team-Einschätzung)",
  },
  benefit: {
    title: "Nutzen-Einschätzung",
    detail: "Effizienzindex (MA) ↔ F2 (Investitions-Nutzen)",
  },
};

const EMPLOYEE = "var(--viz-series-1)";
const LEADERSHIP = "var(--viz-series-2)";

function fmt(v: number): string {
  return v.toFixed(1).replace(".", ",");
}

function Dot({ color, ring, large }: { color: string; ring?: boolean; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={large ? "block h-3 w-3 rounded-full" : "inline-block h-2.5 w-2.5 rounded-full"}
      style={{
        backgroundColor: color,
        boxShadow: ring ? "inset 0 0 0 1px var(--viz-series-1)" : undefined,
      }}
    />
  );
}

function Track({
  employee,
  leadership,
  label,
}: {
  employee: number;
  leadership: number;
  label: string;
}) {
  const pct = (v: number) => `${Math.max(0, Math.min(10, v)) * 10}%`;
  const lo = Math.min(employee, leadership);
  const hi = Math.max(employee, leadership);
  // Values closer than this would overlap when labelled on the same side.
  const close = hi - lo < 0.7;
  const marks = [
    { v: employee, color: EMPLOYEE, ring: false, above: true },
    { v: leadership, color: LEADERSHIP, ring: true, above: !close },
  ];
  return (
    <div className="mx-2 h-12" role="img" aria-label={label}>
      <div className="relative h-full">
        <div
          className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full"
          style={{ background: "var(--viz-grid)" }}
        />
        <div
          className="absolute top-1/2 h-0.5 -translate-y-1/2"
          style={{
            left: pct(lo),
            width: `${(hi - lo) * 10}%`,
            background: "var(--viz-deemphasis)",
          }}
        />
        {marks.map((m, i) => (
          <div key={i}>
            <span
              className="absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-soft"
              style={{ left: pct(m.v) }}
            >
              <Dot color={m.color} ring={m.ring} large />
            </span>
            <span
              className="absolute -translate-x-1/2 text-[10px] font-medium leading-none"
              style={{ left: pct(m.v), ...(m.above ? { top: 0 } : { bottom: 0 }) }}
            >
              {fmt(m.v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GapDumbbells({ pairs }: { pairs: GapPairResult[] }) {
  return (
    <div>
      <div className="mb-4 flex gap-5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Dot color={EMPLOYEE} /> Mitarbeitende
        </span>
        <span className="flex items-center gap-1.5">
          <Dot color={LEADERSHIP} ring /> Führungskräfte
        </span>
      </div>
      <div className="space-y-4">
        {pairs.map((pair) => {
          const labels = PAIR_LABELS[pair.pair];
          const hasData =
            pair.employee_value !== null && pair.leadership_value !== null;
          const critical = pair.gap !== null && pair.gap > 3;
          return (
            <div key={pair.pair}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="text-sm">
                  {labels.title}{" "}
                  <span className="text-[11px] text-muted-foreground">
                    {labels.detail}
                  </span>
                </p>
                {pair.gap !== null && (
                  <p
                    className="shrink-0 text-sm font-medium"
                    style={critical ? { color: "var(--viz-delta-bad)" } : undefined}
                  >
                    Δ {pair.gap > 0 ? "+" : ""}
                    {fmt(pair.gap)}
                  </p>
                )}
              </div>
              {hasData ? (
                <Track
                  employee={pair.employee_value!}
                  leadership={pair.leadership_value!}
                  label={`${labels.title}: Mitarbeitende ${fmt(pair.employee_value!)}, Führung ${fmt(pair.leadership_value!)}`}
                />
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Noch keine Daten für dieses Paar (Monats-/Leadership-Befragung
                  erforderlich).
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        Skala 0–10 · Δ = Führung − Mitarbeitende (positiv = Führung
        optimistischer). Ab Δ &gt; 3 wird eine Kommunikationsmaßnahme empfohlen
        (R6).
      </p>
    </div>
  );
}
