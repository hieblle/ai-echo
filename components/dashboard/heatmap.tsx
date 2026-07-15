/**
 * Departments × dimensions heatmap (SPEC §13 Phase 2).
 *
 * Sequential single-hue ramp (validated reference palette, light→dark =
 * low→high). Suppressed cells (k-anonymity, SPEC §7) show "n < k" instead of
 * a value — a department below the threshold never appears individually.
 * Values are direct-labeled inside the cells (relief rule for light steps).
 */

import type { Department, HeatmapCell, WeeklyDimension } from "@/lib/types";
import { WEEKLY_DIMENSIONS } from "@/lib/types";

const DIMENSION_LABELS: Record<WeeklyDimension, string> = {
  adoption: "Adoption",
  efficiency: "Effizienz",
  trust: "Vertrauen",
  sentiment: "Stimmung",
};

/** Sequential blue ramp 100→700 (see dataviz reference palette). */
const RAMP = [
  "#cde2fb",
  "#b7d3f6",
  "#9ec5f4",
  "#86b6ef",
  "#6da7ec",
  "#5598e7",
  "#3987e5",
  "#2a78d6",
  "#256abf",
  "#1c5cab",
  "#184f95",
];

function rampColor(value: number): string {
  const t = Math.min(Math.max(value / 10, 0), 1);
  return RAMP[Math.round(t * (RAMP.length - 1))] ?? RAMP[0]!;
}

/** Ink for a label inside a colored fill, picked by fill luminance. */
function inkFor(value: number): string {
  return value / 10 > 0.55 ? "#ffffff" : "#0b0b0b";
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
      <table className="w-full border-separate border-spacing-0.5 text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left font-medium text-muted-foreground">
              Abteilung
            </th>
            {WEEKLY_DIMENSIONS.map((dim) => (
              <th
                key={dim}
                className="p-2 text-center font-medium text-muted-foreground"
              >
                {DIMENSION_LABELS[dim]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id ?? "__org__"}>
              <td
                className={
                  row.id === null
                    ? "p-2 font-semibold"
                    : "p-2 text-muted-foreground"
                }
              >
                {row.name}
              </td>
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
                      className="rounded bg-muted/60 p-2 text-center text-xs text-muted-foreground"
                    >
                      {isSuppressed ? `n < ${k}` : "–"}
                    </td>
                  );
                }
                const label = cell.value.toFixed(1).replace(".", ",");
                return (
                  <td
                    key={dim}
                    title={`${row.name} · ${DIMENSION_LABELS[dim]}: ${label} (n = ${cell.n})`}
                    className="rounded p-2 text-center font-medium"
                    style={{
                      backgroundColor: rampColor(cell.value),
                      color: inkFor(cell.value),
                    }}
                  >
                    {label}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        Skala 0–10 (Adoption als Anteil × 10). Abteilungen unter der
        Anonymitätsschwelle (n &lt; {k}) fließen nur in „Gesamt“ ein.
      </p>
    </div>
  );
}
