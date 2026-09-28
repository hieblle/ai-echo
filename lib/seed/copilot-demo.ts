/**
 * Deterministic Copilot usage snapshots for the sales demo (Merlin, D4.10):
 * six weeks of a healthy rollout — active share rising from 55 % to 68 %
 * of 48 licences. Org-level aggregates only, like the real import.
 */

import { mondayOfIsoWeek } from "@/lib/domain/isoWeek";
import type { CopilotAppKey, CopilotUsageSnapshot } from "@/lib/types";

/** Share of the active users that used each app in the window. */
const APP_SHARES: Record<CopilotAppKey, number> = {
  chat_work: 0.85,
  teams: 0.75,
  outlook: 0.6,
  word: 0.55,
  m365_app: 0.4,
  powerpoint: 0.35,
  excel: 0.3,
  chat_web: 0.2,
  edge: 0.15,
  onenote: 0.1,
  agents: 0.08,
  loop: 0.05,
};

export function generateDemoCopilotSnapshots(
  orgId: string,
  weeks: readonly string[],
  seats = 48,
): CopilotUsageSnapshot[] {
  return weeks.map((week, i) => {
    const active = Math.round(seats * (0.55 + 0.026 * i));
    const monday = mondayOfIsoWeek(week);
    const refresh = new Date(monday.getTime() + 6 * 86_400_000);
    const imported = new Date(monday.getTime() + 9 * 86_400_000 + 6 * 3_600_000);
    const activeByApp: Partial<Record<CopilotAppKey, number>> = {};
    for (const [app, share] of Object.entries(APP_SHARES) as [CopilotAppKey, number][]) {
      activeByApp[app] = Math.round(active * share);
    }
    const promptsTotal = active * (28 + 2 * i);
    const b12 = Math.round(active * 0.15);
    const b35 = Math.round(active * 0.25);
    const b610 = Math.round(active * 0.35);
    return {
      org_id: orgId,
      week,
      source: "graph",
      period_days: 28,
      report_refresh_date: refresh.toISOString().slice(0, 10),
      enabled_users: seats,
      active_users: active,
      active_by_app: activeByApp,
      prompts_total: promptsTotal,
      prompts_per_active_user: Math.round((promptsTotal / active) * 10) / 10,
      active_days_avg: Math.round((7 + 0.4 * i) * 10) / 10,
      active_days_buckets: { "1-2": b12, "3-5": b35, "6-10": b610, "11+": active - b12 - b35 - b610 },
      assisted_hours: null,
      imported_at: imported.toISOString(),
    };
  });
}
