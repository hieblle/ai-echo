/**
 * Departments × dimensions (SPEC §13 Phase 2) in design D: a soft table with
 * one status dot per value (good / beobachten / handeln) instead of a colour
 * ramp. Suppressed cells (k-anonymity, SPEC §7) show "n < k" with a lock — a
 * department below the threshold never appears individually.
 */

import { Lock } from "lucide-react";
import type { Department, HeatmapCell, WeeklyDimension } from "@/lib/types";
import { WEEKLY_DIMENSIONS } from "@/lib/types";
import { cn } from "@/lib/utils";

const DIMENSION_LABELS: Record<WeeklyDimension, string> = {
  adoption: "Adoption",
  efficiency: "Effizienz",
  trust: "Vertrauen",
  sentiment: "Stimmung",
};

/** Status thresholds on the shared 0–10 scale (Adoption = share × 10). */
export const HEATMAP_GOOD_FROM = 7;
export const HEATMAP_WARN_FROM = 6.5;

function statusColor(value: number): string {
  if (value >= HEATMAP_GOOD_FROM) return "var(--status-good)";
  if (value >= HEATMAP_WARN_FROM) return "var(--status-warn)";
  return "var(--status-bad)";
}

function statusLabel(value: number): string {
  if (value >= HEATMAP_GOOD_FROM) return "gut";
  if (value >= HEATMAP_WARN_FROM) return "beobachten";
  return "handeln";
}

export function Heatmap({
  cells,
  departments,
  k,
}: {
  cells: HeatmapCell[];
  departments: Department[];
  k: number;
}) {
  const byKey = new Map(
    cells.map((c) => [`${c.department_id ?? "__org__"}|${c.dimension}`, c]),
  );
  const rows: { id: string | null; name: string }[] = [
    ...departments.map((d) => ({ id: d.id as string | null, name: d.name })),
    { id: null, name: "Gesamt" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-0.5 text-sm">
        <thead>
          <tr className="text-[11px] text-muted-foreground">
            <th className="px-4 pb-1 text-left font-normal">Abteilung</th>
            {WEEKLY_DIMENSIONS.map((dim) => (
              <th key={dim} className="px-3 pb-1 text-left font-normal">
                {DIMENSION_LABELS[dim]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const total = row.id === null;
            return (
              <tr
                key={row.id ?? "__org__"}
                className={cn(
                  "h-11",
                  total && "font-medium [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl [&>td]:bg-white",
                )}
              >
                <td className={cn("px-4", total ? "" : "text-foreground")}>{row.name}</td>
                {WEEKLY_DIMENSIONS.map((dim) => {
                  const cell = byKey.get(`${row.id ?? "__org__"}|${dim}`);
                  if (!cell || cell.value === null) {
                    // "n < k" ONLY for genuinely suppressed cells — a qualified
                    // department can still lack data for one dimension.
                    const isSuppressed = (cell?.suppressed ?? false) && (cell?.n ?? 0) > 0;
                    return (
                      <td
                        key={dim}
                        title={
                          isSuppressed
                            ? `Zu wenige Antworten (n < ${k}) — wird nur in der Gesamtauswertung berücksichtigt.`
                            : "Keine Daten."
                        }
                        className="px-3 text-xs text-muted-foreground"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {isSuppressed && <Lock className="h-3 w-3" strokeWidth={1.5} aria-hidden />}
                          {isSuppressed ? `n < ${k}` : "–"}
                        </span>
                      </td>
                    );
                  }
                  const label = cell.value.toFixed(1).replace(".", ",");
                  return (
                    <td
                      key={dim}
                      title={`${row.name} · ${DIMENSION_LABELS[dim]}: ${label} (${statusLabel(cell.value)}, n = ${cell.n})`}
                      className="px-3"
                    >
                      <span className="inline-flex items-center gap-2">
                        {!total && (
                          <span
                            className="status-dot"
                            style={{ background: statusColor(cell.value) }}
                            aria-hidden
                          />
                        )}
                        {label}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="status-dot" style={{ background: "var(--status-good)" }} aria-hidden />
          gut (ab {HEATMAP_GOOD_FROM.toFixed(1).replace(".", ",")})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="status-dot" style={{ background: "var(--status-warn)" }} aria-hidden />
          beobachten ({HEATMAP_WARN_FROM.toFixed(1).replace(".", ",")} bis {HEATMAP_GOOD_FROM.toFixed(1).replace(".", ",")})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="status-dot" style={{ background: "var(--status-bad)" }} aria-hidden />
          handeln (darunter)
        </span>
        <span className="basis-full sm:basis-auto sm:ml-auto">
          Skala 0–10 (Adoption als Anteil × 10) · Abteilungen unter der Anonymitätsschwelle (n &lt; {k}) fließen nur in „Gesamt“ ein.
        </span>
      </div>
    </div>
  );
}
