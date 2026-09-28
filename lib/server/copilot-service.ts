/**
 * Microsoft 365 Copilot telemetry (D4.10, docs/COPILOT-INTEGRATION.md) —
 * server-only composition: import a report file, sync via Graph, and
 * assemble the "Copilot-Nutzung" page. The store only ever receives the
 * org-level snapshot the domain layer aggregated; report rows never persist.
 */

import type { Store } from "@/lib/data/store";
import {
  COPILOT_TOOL_VALUE,
  CopilotImportError,
  activeRate,
  importCopilotCsv,
  licenseCheck,
  weeklyTrend,
  type CopilotImportOptions,
  type CopilotImportResult,
  type LicenseCheck,
} from "@/lib/domain/copilot";
import { pooledAdoption } from "@/lib/domain/kpi";
import type {
  CopilotSource,
  CopilotUsageSnapshot,
  Organization,
  OrgIntegration,
  OrgToolSetting,
  Role,
} from "@/lib/types";
import { canAdminOrg } from "./auth";
import type { CopilotReportFetcher } from "./m365-graph";

export { CopilotImportError };

/** Windows the weekly sync stores: the 28-day headline and the 7-day pulse. */
export const SYNC_PERIODS = [28, 7] as const;

export interface CopilotPageData {
  org: Organization;
  integration: OrgIntegration | null;
  /** Latest snapshot of the headline window (≥ 28 days), or null without data. */
  latest: CopilotUsageSnapshot | null;
  /** 7-day snapshot of the same week (Graph sync), when present. */
  latestShort: CopilotUsageSnapshot | null;
  trend: { week: string; activeRate: number | null }[];
  weeksStored: number;
  k: number;
  /** Fewer licensed users than k in the latest snapshot. */
  belowK: boolean;
  /** Numbers withheld for this viewer: below k and not an org admin (D4.10). */
  suppressed: boolean;
  tool: OrgToolSetting | null;
  license: LicenseCheck | null;
  /** Adoption from the pulse (W1.1, last four weeks) for the comparison. */
  survey: { rate: number; n: number; weeks: number } | null;
}

export async function getCopilotPageData(
  store: Store,
  org: Organization,
  role: Role,
): Promise<CopilotPageData> {
  const [integration, snapshots, tools, stats] = await Promise.all([
    store.getIntegration(org.id, "m365"),
    store.listCopilotSnapshots(org.id),
    store.listToolSettings(org.id),
    store.listParticipationStats(org.id),
  ]);
  const headline = snapshots.filter((s) => s.period_days >= 28);
  const trendSource = headline.length > 0 ? headline : snapshots;
  const trend = weeklyTrend(trendSource);
  const latest = trend[trend.length - 1]?.snapshot ?? null;
  const latestShort =
    latest
      ? (snapshots.find((s) => s.week === latest.week && s.period_days === 7) ?? null)
      : null;
  const tool = tools.find((t) => t.tool_value === COPILOT_TOOL_VALUE) ?? null;

  const weeks = [
    ...new Set(stats.filter((s) => s.template_key === "weekly").map((s) => s.week)),
  ]
    .sort()
    .slice(-4);
  let survey: CopilotPageData["survey"] = null;
  if (weeks.length > 0) {
    const responses = await store.listResponses(org.id, { weeks });
    const pooled = pooledAdoption(responses, weeks);
    if (pooled && pooled.n >= org.k_anonymity_min) {
      survey = { rate: pooled.rate, n: pooled.n, weeks: weeks.length };
    }
  }

  const belowK = latest !== null && latest.enabled_users < org.k_anonymity_min;
  return {
    org,
    integration,
    latest,
    latestShort,
    trend: trend.map(({ week, activeRate: rate }) => ({ week, activeRate: rate })),
    weeksStored: trend.length,
    k: org.k_anonymity_min,
    belowK,
    suppressed: belowK && !canAdminOrg(role),
    tool,
    license: latest ? licenseCheck(latest, tool) : null,
    survey,
  };
}

export interface ImportedSnapshot {
  snapshot: CopilotUsageSnapshot;
  result: CopilotImportResult;
}

/** Parse a report file and store its aggregate; the text is not retained. */
export async function importCopilotReport(
  store: Store,
  org: Organization,
  text: string,
  options: CopilotImportOptions & { source: CopilotSource },
  now: Date,
): Promise<ImportedSnapshot> {
  const { source, ...importOptions } = options;
  const result = importCopilotCsv(text, importOptions);
  const snapshot: CopilotUsageSnapshot = {
    ...result.draft,
    org_id: org.id,
    source,
    imported_at: now.toISOString(),
  };
  await store.upsertCopilotSnapshot(snapshot);
  return { snapshot, result };
}

export interface SyncResult {
  weeks: string[];
  snapshots: number;
  namesConcealed: boolean | null;
}

/** One Graph sync for a connected org: headline window + 7-day pulse. */
export async function syncCopilotFromGraph(
  store: Store,
  org: Organization,
  integration: OrgIntegration,
  fetcher: CopilotReportFetcher,
  now: Date,
): Promise<SyncResult> {
  if (!integration.tenant_id) {
    throw new Error("syncCopilotFromGraph: integration has no tenant id");
  }
  const weeks = new Set<string>();
  let count = 0;
  for (const periodDays of SYNC_PERIODS) {
    const csv =
      periodDays === 28
        ? await fetcher.fetchUserDetailCsv(integration.tenant_id, periodDays)
        : await fetcher.fetchSummaryCsv(integration.tenant_id, periodDays);
    const imported = await importCopilotReport(
      store,
      org,
      csv,
      { source: "graph", periodDays },
      now,
    );
    weeks.add(imported.snapshot.week);
    count += 1;
  }
  const namesConcealed = await fetcher.readNamesConcealed(integration.tenant_id);
  await store.upsertIntegration({
    ...integration,
    status: "connected",
    names_concealed: namesConcealed ?? integration.names_concealed,
    last_sync_at: now.toISOString(),
    last_error: null,
  });
  return { weeks: [...weeks].sort(), snapshots: count, namesConcealed };
}

export interface ScheduleResult {
  synced: string[];
  failed: { slug: string; error: string }[];
  skipped: number;
}

/** Weekly cron: sync every org with a connected Microsoft 365 integration. */
export async function runCopilotSyncSchedule(
  store: Store,
  fetcher: CopilotReportFetcher,
  now: Date,
): Promise<ScheduleResult> {
  const result: ScheduleResult = { synced: [], failed: [], skipped: 0 };
  for (const org of await store.listOrganizations()) {
    const integration = await store.getIntegration(org.id, "m365");
    if (!integration || integration.status === "pending" || !integration.tenant_id) {
      result.skipped += 1;
      continue;
    }
    try {
      await syncCopilotFromGraph(store, org, integration, fetcher, now);
      result.synced.push(org.slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await store.upsertIntegration({
        ...integration,
        status: "error",
        last_error: message.slice(0, 500),
      });
      result.failed.push({ slug: org.slug, error: message });
    }
  }
  return result;
}

/** Share of the latest headline snapshot, for callers that only need the number. */
export function latestActiveRate(snapshots: CopilotUsageSnapshot[]): number | null {
  const trend = weeklyTrend(snapshots.filter((s) => s.period_days >= 28));
  const latest = trend[trend.length - 1]?.snapshot;
  return latest ? activeRate(latest) : null;
}
