/**
 * Stat tile (design D): label · light display value · delta as a status dot
 * with text · optional hint · sparkline. Values wear text tokens, never
 * series colors; the delta color = direction × whether up is good.
 */

import {
  TrendSparkline,
  type SparkPoint,
} from "@/components/dashboard/trend-sparkline";

export function StatTile({
  label,
  value,
  hint,
  delta,
  spark,
  sparkUnit,
  sparkDomain,
}: {
  label: string;
  /** Preformatted display value, e.g. "68 %" or "7,2". */
  value: string;
  /** Small print under the value (e.g. "n = 34"). */
  hint?: string;
  delta?: {
    text: string;
    direction: "up" | "down" | "flat";
    upIsGood?: boolean;
  };
  spark?: SparkPoint[];
  sparkUnit?: string;
  sparkDomain?: [number, number];
}) {
  const deltaGood =
    delta &&
    (delta.direction === "flat"
      ? null
      : (delta.direction === "up") === (delta.upIsGood ?? true));
  const dot =
    deltaGood === null || deltaGood === undefined
      ? "hsl(var(--tertiary-foreground))"
      : deltaGood
        ? "var(--status-good)"
        : "var(--status-bad)";
  return (
    <div className="card-soft flex flex-col gap-1.5 p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-3xl font-light tracking-tight">{value}</p>
      {delta && (
        <p
          className="flex items-center gap-1.5 text-[11px]"
          style={{
            color:
              deltaGood === null
                ? "hsl(var(--muted-foreground))"
                : deltaGood
                  ? "var(--viz-delta-good)"
                  : "var(--viz-delta-bad)",
          }}
        >
          <span className="status-dot" style={{ background: dot }} aria-hidden />
          {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "＝"}{" "}
          {delta.text}
        </p>
      )}
      {hint && <p className="caption-3 text-[11px]">{hint}</p>}
      {spark && (
        <div className="mt-auto pt-1">
          <TrendSparkline data={spark} unit={sparkUnit} domain={sparkDomain} />
        </div>
      )}
    </div>
  );
}
