/**
 * Stat tile (dataviz skill contract): label · value · optional delta vs a
 * named period · optional sparkline. Values wear text tokens, never series
 * colors; the delta color = direction × whether up is good.
 */

import {
  TrendSparkline,
  type SparkPoint,
} from "@/components/dashboard/trend-sparkline";
import { cn } from "@/lib/utils";

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
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {delta && (
        <p
          className={cn(
            "mt-0.5 text-xs",
            deltaGood === null && "text-muted-foreground",
          )}
          style={
            deltaGood === null
              ? undefined
              : {
                  color: deltaGood
                    ? "var(--viz-delta-good)"
                    : "var(--viz-delta-bad)",
                }
          }
        >
          {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "＝"}{" "}
          {delta.text}
        </p>
      )}
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      {spark && (
        <div className="mt-2">
          <TrendSparkline data={spark} unit={sparkUnit} domain={sparkDomain} />
        </div>
      )}
    </div>
  );
}
