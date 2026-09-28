/**
 * Microsoft 365 Copilot usage telemetry (docs/COPILOT-INTEGRATION.md,
 * DECISIONS D4.10) — pure domain code, no IO.
 *
 * Parses the reports Microsoft provides — the admin-center CSV export or the
 * Graph `copilot/reports` CSV (user detail v1/v2 or the user count summary) —
 * and aggregates them into ONE org-level weekly snapshot. The per-user rows
 * only ever exist in memory here; the snapshot carries counts and nothing
 * that could identify a person (anonymity by construction, SPEC §7).
 */

import { getIsoWeek } from "@/lib/domain/isoWeek";
import type { TelemetryUsage } from "@/lib/domain/triggers";
import type {
  ActiveDaysBucket,
  CopilotAppKey,
  CopilotUsageSnapshot,
  OrgToolSetting,
} from "@/lib/types";

/** Tool value of Microsoft 365 Copilot in the O2 catalogue. */
export const COPILOT_TOOL_VALUE = "copilot365";

/** Rolling window the admin center and the API default to (report v2). */
export const DEFAULT_PERIOD_DAYS = 28;

/** A snapshot before the org and the import timestamp are attached. */
export type CopilotSnapshotDraft = Omit<
  CopilotUsageSnapshot,
  "org_id" | "imported_at" | "source"
>;

export interface CopilotImportResult {
  /** Which report shape the file had. */
  kind: "user_detail" | "summary";
  draft: CopilotSnapshotDraft;
  /** Data rows consumed (user detail: licensed users listed). */
  rows: number;
  /** Non-fatal remarks for the admin (missing v2 columns etc.). */
  warnings: string[];
}

export interface CopilotImportOptions {
  /** Overrides the file's "Report Refresh Date" (needed when the column is missing). */
  refreshDate?: Date;
  /** Overrides the file's "Report Period" (days). */
  periodDays?: number;
}

/** The file is not a Copilot usage report we understand. */
export class CopilotImportError extends Error {
  readonly headers: string[];

  constructor(message: string, headers: string[]) {
    super(message);
    this.name = "CopilotImportError";
    this.headers = headers;
  }
}

/** Name-based check, robust against duplicated module instances (server actions). */
export function isCopilotImportError(err: unknown): err is CopilotImportError {
  return (
    err instanceof CopilotImportError ||
    (err instanceof Error && err.name === "CopilotImportError")
  );
}

// --- CSV --------------------------------------------------------------------

const DELIMITERS = [",", ";", "\t"] as const;

function countOutsideQuotes(line: string, char: string): number {
  let count = 0;
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === char) count += 1;
  }
  return count;
}

function detectDelimiter(headerLine: string): string {
  let best: string = ",";
  let bestCount = -1;
  for (const d of DELIMITERS) {
    const n = countOutsideQuotes(headerLine, d);
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Minimal RFC-4180 parser: BOM, CRLF, quoted fields with doubled quotes,
 * delimiter detected from the header line (`,` `;` or tab). Empty lines are
 * dropped.
 */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const headerLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(headerLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = "";
    if (row.some((f) => f.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i] as string;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      endRow();
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

// --- Header classification ------------------------------------------------------

type Column =
  | { kind: "refresh" }
  | { kind: "period" }
  | { kind: "upn" }
  | { kind: "last_activity" }
  | { kind: "app_activity"; app: CopilotAppKey }
  | { kind: "prompts_all" }
  | { kind: "active_days" }
  | { kind: "enabled_any" }
  | { kind: "active_any" }
  | { kind: "app_enabled"; app: CopilotAppKey }
  | { kind: "app_active"; app: CopilotAppKey }
  | { kind: "prompts_total" }
  | { kind: "prompts_avg" }
  | { kind: "ignore" };

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Which app a (normalized) column name refers to, if any. */
function appOf(name: string): CopilotAppKey | null {
  if (/\bteams\b/.test(name)) return "teams";
  if (/\bword\b/.test(name)) return "word";
  if (/\bexcel\b/.test(name)) return "excel";
  if (/\bpower ?point\b/.test(name)) return "powerpoint";
  if (/\boutlook\b/.test(name)) return "outlook";
  if (/\bone ?note\b/.test(name)) return "onenote";
  if (/\bloop\b/.test(name)) return "loop";
  if (/\bedge\b/.test(name)) return "edge";
  if (/\bagents?\b/.test(name)) return "agents";
  if (/\bchat\b/.test(name)) return /\bweb\b/.test(name) ? "chat_web" : "chat_work";
  if (/\bmicrosoft 365 copilot\b/.test(name) || /\bm365 copilot\b/.test(name)) {
    return "m365_app";
  }
  return null;
}

function classify(header: string): Column {
  const n = normalizeHeader(header);
  if (n === "report refresh date") return { kind: "refresh" };
  if (n === "report period") return { kind: "period" };
  if (/user principal name/.test(n) || n === "upn") return { kind: "upn" };
  if (/\bprompts?\b/.test(n)) {
    if (/\ball apps\b/.test(n)) return { kind: "prompts_all" };
    if (/\btotal\b/.test(n)) return { kind: "prompts_total" };
    if (/\baverage\b|\bavg\b/.test(n)) return { kind: "prompts_avg" };
    return { kind: "ignore" };
  }
  if (/\bactive (usage )?days\b/.test(n)) {
    return appOf(n) === null || /\ball apps\b/.test(n)
      ? { kind: "active_days" }
      : { kind: "ignore" };
  }
  if (/\blast activity\b/.test(n)) {
    const app = appOf(n);
    return app ? { kind: "app_activity", app } : { kind: "last_activity" };
  }
  if (/\benabled users\b/.test(n)) {
    const app = /\bany app\b/.test(n) ? null : appOf(n);
    return app ? { kind: "app_enabled", app } : { kind: "enabled_any" };
  }
  if (/\bactive users\b/.test(n)) {
    const app = /\bany app\b/.test(n) ? null : appOf(n);
    return app ? { kind: "app_active", app } : { kind: "active_any" };
  }
  return { kind: "ignore" };
}

// --- Values ------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** "2026-09-25", "25.09.2026" or "9/25/2026" → UTC midnight; null otherwise. */
export function parseReportDate(raw: string): Date | null {
  const s = raw.trim();
  if (s === "") return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return utcDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return utcDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return utcDate(Number(m[3]), Number(m[1]), Number(m[2]));
  return null;
}

function utcDate(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whole number from a cell ("1.234", "1,234", "12") — null when empty/invalid. */
function parseCount(raw: string | undefined): number | null {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  if (digits === "") return null;
  return Number(digits);
}

/** Decimal from a cell ("3,5" or "3.5") — null when empty/invalid. */
function parseDecimal(raw: string | undefined): number | null {
  const s = (raw ?? "").trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function bucketOf(days: number): ActiveDaysBucket {
  if (days <= 2) return "1-2";
  if (days <= 5) return "3-5";
  if (days <= 10) return "6-10";
  return "11+";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// --- Import --------------------------------------------------------------------------

/**
 * Parse a Copilot usage report and aggregate it. Throws CopilotImportError
 * when the columns are not recognised or the file has no data rows.
 */
export function importCopilotCsv(
  text: string,
  options: CopilotImportOptions = {},
): CopilotImportResult {
  const rows = parseDelimited(text);
  const header = rows[0];
  if (!header || rows.length < 2) {
    throw new CopilotImportError("Die Datei enthält keine Datenzeilen.", header ?? []);
  }
  const columns = header.map(classify);
  const has = (kind: Column["kind"]) => columns.some((c) => c.kind === kind);
  if (has("app_activity") || has("last_activity")) {
    return aggregateUserDetail(header, columns, rows.slice(1), options);
  }
  if (has("enabled_any") || has("app_enabled")) {
    return aggregateSummary(header, columns, rows.slice(1), options);
  }
  throw new CopilotImportError(
    "Spalten nicht erkannt — erwartet wird der Microsoft 365 Copilot usage report (Nutzertabelle oder Summenblatt, Export aus dem Admin Center oder der Graph-API).",
    header,
  );
}

function firstIndex(columns: Column[], kind: Column["kind"]): number {
  return columns.findIndex((c) => c.kind === kind);
}

function resolveWindow(
  columns: Column[],
  firstRow: string[] | undefined,
  options: CopilotImportOptions,
  warnings: string[],
): { refresh: Date; periodDays: number } {
  let refresh = options.refreshDate ?? null;
  const refreshIdx = firstIndex(columns, "refresh");
  if (!refresh && refreshIdx >= 0) {
    refresh = parseReportDate(firstRow?.[refreshIdx] ?? "");
  }
  if (!refresh) {
    throw new CopilotImportError(
      "Das Datum des Berichts („Report Refresh Date“) fehlt — bitte beim Import angeben.",
      [],
    );
  }
  if (options.refreshDate) {
    warnings.push(`Berichtsdatum aus dem Formular übernommen: ${isoDate(options.refreshDate)}.`);
  }
  let periodDays = options.periodDays ?? null;
  const periodIdx = firstIndex(columns, "period");
  if (!periodDays && periodIdx >= 0) periodDays = parseCount(firstRow?.[periodIdx]);
  if (!periodDays) {
    periodDays = DEFAULT_PERIOD_DAYS;
    warnings.push(`Kein Berichtszeitraum in der Datei — ${DEFAULT_PERIOD_DAYS} Tage angenommen.`);
  }
  return { refresh, periodDays };
}

function aggregateUserDetail(
  header: string[],
  columns: Column[],
  data: string[][],
  options: CopilotImportOptions,
): CopilotImportResult {
  const warnings: string[] = [];
  const { refresh, periodDays } = resolveWindow(columns, data[0], options, warnings);
  const windowStart = new Date(refresh.getTime() - (periodDays - 1) * DAY_MS);
  const inWindow = (d: Date | null) =>
    d !== null && d.getTime() >= windowStart.getTime() && d.getTime() <= refresh.getTime();

  const upnIdx = firstIndex(columns, "upn");
  const lastIdx = firstIndex(columns, "last_activity");
  const promptsIdx = firstIndex(columns, "prompts_all");
  const daysIdx = firstIndex(columns, "active_days");
  // One column per app; a later, more specific column (v2 "Copilot Chat
  // (work)") replaces the generic v1 one ("Copilot Chat") for the same app.
  const appIndex = new Map<CopilotAppKey, number>();
  columns.forEach((c, i) => {
    if (c.kind === "app_activity") appIndex.set(c.app, i);
  });
  const appColumns = [...appIndex.entries()].map(([app, index]) => ({ app, index }));
  if (promptsIdx < 0) {
    warnings.push("Keine Prompt-Spalte (Bericht Version 1) — Prompt-Kennzahlen bleiben leer.");
  }
  if (daysIdx < 0) {
    warnings.push("Keine Spalte „Active Usage Days“ — aktive Tage bleiben leer.");
  }

  const seen = new Set<string>();
  let enabled = 0;
  let active = 0;
  const activeByApp: Partial<Record<CopilotAppKey, number>> = {};
  for (const { app } of appColumns) activeByApp[app] = 0;
  let promptsTotal = 0;
  let promptsSeen = false;
  let daysSum = 0;
  let daysCount = 0;
  const buckets: Record<ActiveDaysBucket, number> = { "1-2": 0, "3-5": 0, "6-10": 0, "11+": 0 };

  for (const row of data) {
    if (upnIdx >= 0) {
      const key = (row[upnIdx] ?? "").trim().toLowerCase();
      if (key === "") continue;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    enabled += 1;

    let latest: Date | null = lastIdx >= 0 ? parseReportDate(row[lastIdx] ?? "") : null;
    for (const { app, index } of appColumns) {
      const d = parseReportDate(row[index] ?? "");
      if (inWindow(d)) activeByApp[app] = (activeByApp[app] ?? 0) + 1;
      if (d && (!latest || d.getTime() > latest.getTime())) latest = d;
    }
    const isActive = inWindow(latest);
    if (isActive) active += 1;

    if (promptsIdx >= 0) {
      const n = parseCount(row[promptsIdx]);
      if (n !== null) {
        promptsSeen = true;
        promptsTotal += n;
      }
    }
    if (daysIdx >= 0) {
      const days = parseCount(row[daysIdx]);
      if (days !== null && days > 0) {
        daysSum += days;
        daysCount += 1;
        buckets[bucketOf(days)] += 1;
      }
    }
  }

  if (enabled === 0) {
    throw new CopilotImportError("Die Nutzertabelle enthält keine Zeilen.", header);
  }

  return {
    kind: "user_detail",
    rows: enabled,
    warnings,
    draft: {
      week: getIsoWeek(refresh),
      period_days: periodDays,
      report_refresh_date: isoDate(refresh),
      enabled_users: enabled,
      active_users: active,
      active_by_app: activeByApp,
      prompts_total: promptsSeen ? promptsTotal : null,
      prompts_per_active_user:
        promptsSeen && active > 0 ? round1(promptsTotal / active) : null,
      active_days_avg: daysCount > 0 ? round1(daysSum / daysCount) : null,
      active_days_buckets: daysIdx >= 0 ? buckets : null,
      assisted_hours: null,
    },
  };
}

function aggregateSummary(
  header: string[],
  columns: Column[],
  data: string[][],
  options: CopilotImportOptions,
): CopilotImportResult {
  const warnings: string[] = [];
  // `period='ALL'` yields one row per window — pick the requested one.
  const periodIdx = firstIndex(columns, "period");
  let row = data[0];
  if (periodIdx >= 0 && options.periodDays) {
    row = data.find((r) => parseCount(r[periodIdx]) === options.periodDays) ?? row;
  }
  if (!row) throw new CopilotImportError("Das Summenblatt enthält keine Zeile.", header);
  const { refresh, periodDays } = resolveWindow(columns, row, options, warnings);

  const enabledIdx = firstIndex(columns, "enabled_any");
  const activeIdx = firstIndex(columns, "active_any");
  const enabled = enabledIdx >= 0 ? (parseCount(row[enabledIdx]) ?? 0) : 0;
  const active = activeIdx >= 0 ? (parseCount(row[activeIdx]) ?? 0) : 0;
  if (enabledIdx < 0) {
    warnings.push("Keine Spalte „Any App Enabled Users“ — lizenzierte Nutzer unbekannt.");
  }
  const activeByApp: Partial<Record<CopilotAppKey, number>> = {};
  columns.forEach((c, i) => {
    if (c.kind === "app_active") activeByApp[c.app] = parseCount(row[i]) ?? 0;
  });
  const totalIdx = firstIndex(columns, "prompts_total");
  const avgIdx = firstIndex(columns, "prompts_avg");
  const promptsTotal = totalIdx >= 0 ? parseCount(row[totalIdx]) : null;
  const promptsAvg =
    avgIdx >= 0
      ? parseDecimal(row[avgIdx])
      : promptsTotal !== null && active > 0
        ? round1(promptsTotal / active)
        : null;

  return {
    kind: "summary",
    rows: 1,
    warnings,
    draft: {
      week: getIsoWeek(refresh),
      period_days: periodDays,
      report_refresh_date: isoDate(refresh),
      enabled_users: enabled,
      active_users: active,
      active_by_app: activeByApp,
      prompts_total: promptsTotal,
      prompts_per_active_user: promptsAvg,
      active_days_avg: null,
      active_days_buckets: null,
      assisted_hours: null,
    },
  };
}

// --- Metrics ----------------------------------------------------------------------------

/** Active ÷ licensed users, or null without licences. */
export function activeRate(snapshot: Pick<CopilotUsageSnapshot, "enabled_users" | "active_users">): number | null {
  return snapshot.enabled_users > 0
    ? snapshot.active_users / snapshot.enabled_users
    : null;
}

export interface LicenseCheck {
  /** Licences the check rests on (tool seats, else the report's licensed users). */
  seats: number;
  basis: "seats" | "report";
  costPerSeatEur: number | null;
  unusedSeats: number;
  unusedCostEur: number | null;
}

/**
 * How many licences went unused in the window and what they cost per month.
 * Cost per seat = the tool's monthly invoice ÷ its seat count (or ÷ the
 * report's licensed users when no seat count is configured).
 */
export function licenseCheck(
  snapshot: CopilotUsageSnapshot,
  tool: OrgToolSetting | null,
): LicenseCheck | null {
  const seats = tool?.seats ?? snapshot.enabled_users;
  if (seats <= 0) return null;
  const basis: LicenseCheck["basis"] = tool?.seats ? "seats" : "report";
  const costPerSeatEur =
    tool && tool.monthly_license_cost_eur > 0
      ? tool.monthly_license_cost_eur / seats
      : null;
  const unusedSeats = Math.max(0, seats - snapshot.active_users);
  return {
    seats,
    basis,
    costPerSeatEur,
    unusedSeats,
    unusedCostEur: costPerSeatEur === null ? null : unusedSeats * costPerSeatEur,
  };
}

/** German date "25.09.2026" from "2026-09-25". */
export function formatReportDate(isoDay: string): string {
  const [y, m, d] = isoDay.split("-");
  return `${d}.${m}.${y}`;
}

/** Telemetry input for R5 (D4.10): Copilot's active share with its source label. */
export function copilotTelemetryUsage(snapshot: CopilotUsageSnapshot): TelemetryUsage {
  return {
    tool_value: COPILOT_TOOL_VALUE,
    share: activeRate(snapshot) ?? 0,
    label: `Microsoft-Nutzungsdaten (${snapshot.period_days} Tage bis ${formatReportDate(snapshot.report_refresh_date)})`,
  };
}

/** One point per week for the trend: the latest snapshot of each week wins. */
export function weeklyTrend(
  snapshots: readonly CopilotUsageSnapshot[],
): { week: string; activeRate: number | null; snapshot: CopilotUsageSnapshot }[] {
  const byWeek = new Map<string, CopilotUsageSnapshot>();
  for (const s of snapshots) {
    const current = byWeek.get(s.week);
    if (!current || s.imported_at >= current.imported_at) byWeek.set(s.week, s);
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, snapshot]) => ({ week, activeRate: activeRate(snapshot), snapshot }));
}
