"use client";

/**
 * Stat-tile sparkline (design D): a thin grey line, the current period as a
 * yellow end-dot with a dark ring, hover tooltip.
 */

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SparkPoint {
  week: string;
  value: number | null;
}

function EndDot(props: {
  cx?: number;
  cy?: number;
  index?: number;
  dataLength: number;
}) {
  const { cx, cy, index, dataLength } = props;
  if (cx === undefined || cy === undefined || index !== dataLength - 1) {
    return null;
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill="#ffffff" />
      <circle cx={cx} cy={cy} r={4} fill="var(--accent-yellow)" stroke="var(--viz-series-1)" strokeWidth={1} />
    </g>
  );
}

export function TrendSparkline({
  data,
  unit = "",
  domain,
}: {
  data: SparkPoint[];
  /** Suffix in the tooltip, e.g. " %" or " Pkt.". */
  unit?: string;
  domain?: [number, number];
}) {
  if (data.every((d) => d.value === null)) {
    return (
      <p className="text-[11px] text-muted-foreground">Noch keine Trenddaten.</p>
    );
  }
  return (
    <div className="h-10 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 2, left: 8 }}
        >
          <XAxis dataKey="week" hide />
          <YAxis hide domain={domain ?? ["auto", "auto"]} />
          <Tooltip
            cursor={{ stroke: "var(--viz-grid)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0];
              const v = p?.value;
              return (
                <div className="rounded-xl bg-white px-2 py-1 text-xs shadow-pill">
                  <span className="text-muted-foreground">
                    {String(p?.payload?.week ?? "")}:{" "}
                  </span>
                  <span className="font-medium">
                    {typeof v === "number" ? v.toLocaleString("de-DE") : "–"}
                    {unit}
                  </span>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--viz-deemphasis)"
            strokeWidth={1.5}
            strokeLinecap="round"
            connectNulls
            isAnimationActive={false}
            dot={<EndDot dataLength={data.length} />}
            activeDot={{ r: 4, fill: "var(--accent-yellow)", stroke: "var(--viz-series-1)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
