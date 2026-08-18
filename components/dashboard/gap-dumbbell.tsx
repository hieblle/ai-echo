/**
 * Perception-gap dumbbells (SPEC §10): one row per mirrored pair, employee
 * vs leadership dot on a shared 0–10 scale. Two series → legend present +
 * direct value labels (dataviz skill); validated categorical slots 1/2.
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

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export function GapDumbbells({ pairs }: { pairs: GapPairResult[] }) {
  const width = 560;
  const x = (v: number) => 8 + (v / 10) * (width - 16);

  return (
    <div>
      <div className="mb-3 flex gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Dot color={EMPLOYEE} /> Mitarbeitende
        </span>
        <span className="flex items-center gap-1.5">
          <Dot color={LEADERSHIP} /> Führungskräfte
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
                <p className="text-sm font-medium">
                  {labels.title}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {labels.detail}
                  </span>
                </p>
                {pair.gap !== null && (
                  <p
                    className="text-sm font-semibold"
                    style={critical ? { color: "var(--viz-delta-bad)" } : undefined}
                  >
                    Δ {pair.gap > 0 ? "+" : ""}
                    {pair.gap.toFixed(1).replace(".", ",")}
                  </p>
                )}
              </div>
              {hasData ? (
                <svg
                  viewBox={`0 0 ${width} 36`}
                  className="w-full"
                  role="img"
                  aria-label={`${labels.title}: Mitarbeitende ${pair.employee_value?.toFixed(1).replace(".", ",")}, Führung ${pair.leadership_value?.toFixed(1).replace(".", ",")}`}
                >
                  <line
                    x1={8}
                    x2={width - 8}
                    y1={18}
                    y2={18}
                    stroke="var(--viz-grid)"
                    strokeWidth={1}
                  />
                  <line
                    x1={x(pair.employee_value!)}
                    x2={x(pair.leadership_value!)}
                    y1={18}
                    y2={18}
                    stroke="var(--viz-deemphasis)"
                    strokeWidth={2}
                  />
                  {[
                    { v: pair.employee_value!, color: EMPLOYEE },
                    { v: pair.leadership_value!, color: LEADERSHIP },
                  ].map(({ v, color }, i) => (
                    <g key={i}>
                      <circle cx={x(v)} cy={18} r={7} fill="#fcfcfb" />
                      <circle cx={x(v)} cy={18} r={5} fill={color} />
                      <text
                        x={x(v)}
                        y={8}
                        textAnchor="middle"
                        className="fill-foreground text-[10px] font-medium"
                      >
                        {v.toFixed(1).replace(".", ",")}
                      </text>
                    </g>
                  ))}
                </svg>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Noch keine Daten für dieses Paar (Monats-/Leadership-Befragung
                  erforderlich).
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Skala 0–10 · Δ = Führung − Mitarbeitende (positiv = Führung
        optimistischer). Ab Δ &gt; 3 wird eine Kommunikationsmaßnahme empfohlen
        (R6).
      </p>
    </div>
  );
}
