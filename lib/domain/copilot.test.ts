import { describe, expect, it } from "vitest";
import {
  CopilotImportError,
  activeRate,
  copilotTelemetryUsage,
  importCopilotCsv,
  licenseCheck,
  parseDelimited,
  parseReportDate,
  weeklyTrend,
} from "./copilot";
import type { CopilotUsageSnapshot, OrgToolSetting } from "@/lib/types";

/**
 * Graph `copilot/reports` user detail, report version 2, names concealed
 * (the tenant default). Refresh 2026-09-25, window 28 days → 2026-08-29.
 */
const V2_HEADER =
  "Report Refresh Date,User Principal Name,Display Name,Last Activity Date," +
  "Copilot Chat Last Activity Date,Microsoft Teams Copilot Last Activity Date," +
  "Word Copilot Last Activity Date,Excel Copilot Last Activity Date," +
  "PowerPoint Copilot Last Activity Date,Outlook Copilot Last Activity Date," +
  "OneNote Copilot Last Activity Date,Loop Copilot Last Activity Date," +
  "Prompts submitted for all apps,Prompts submitted for Copilot Chat (work)," +
  "Prompts submitted for Copilot Chat (web),Active Usage Days for all apps," +
  "Copilot Chat (work) Last Activity Date,Copilot Chat (web) Last Activity Date," +
  "Microsoft 365 Copilot Last Activity Date,Edge Last Activity Date," +
  "Copilot Agent Last Activity Date,Report Period";

const V2_ROWS = [
  // active: last activity 2026-09-24 (Teams + Word), 40 prompts, 12 days
  "2026-09-25,DC8C64D6EC3A3AA17481D7E5EB5B68A6,C65E8D8AFA0DAB9639EDFAAEA94AFE66,2026-09-24,2026-09-10,2026-09-24,2026-09-20,,,,,,40,30,10,12,2026-09-10,,,,,28",
  // active: only Outlook, 3 prompts, 2 days
  "2026-09-25,1B2C3D4E5F60718293A4B5C6D7E8F901,AAAA,2026-09-01,,,,,,2026-09-01,,,3,3,0,2,,,,,,28",
  // inactive: last activity before the window
  "2026-09-25,0000000000000000000000000000AAAA,BBBB,2026-08-20,,2026-08-20,,,,,,,0,0,0,0,,,,,,28",
  // never active (licensed only)
  "2026-09-25,0000000000000000000000000000BBBB,CCCC,,,,,,,,,,0,0,0,0,,,,,,28",
  // active via Copilot Chat (work) only, no overall column value — derived
  "2026-09-25,0000000000000000000000000000CCCC,DDDD,,,,,,,,,,7,7,0,4,2026-09-22,,,,,28",
  // duplicate UPN of row 1 (must not double count)
  "2026-09-25,dc8c64d6ec3a3aa17481d7e5eb5b68a6,C65E,2026-09-24,,2026-09-24,,,,,,,40,30,10,12,,,,,,28",
];

const V2_CSV = [V2_HEADER, ...V2_ROWS].join("\r\n");

describe("parseDelimited", () => {
  it("handles BOM, CRLF, quoted commas and doubled quotes", () => {
    const rows = parseDelimited('﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n\r\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", 'say "hi"'],
    ]);
  });

  it("detects semicolon and tab delimiters from the header", () => {
    expect(parseDelimited("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseDelimited("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseReportDate", () => {
  it("reads ISO, German and US formats as UTC midnight", () => {
    for (const raw of ["2026-09-25", "25.09.2026", "9/25/2026", "2026-09-25T00:00:00Z"]) {
      expect(parseReportDate(raw)?.toISOString()).toBe("2026-09-25T00:00:00.000Z");
    }
    expect(parseReportDate("")).toBeNull();
    expect(parseReportDate("n/a")).toBeNull();
  });
});

describe("importCopilotCsv · user detail v2", () => {
  const result = importCopilotCsv(V2_CSV);

  it("aggregates licensed and active users without keeping any row", () => {
    expect(result.kind).toBe("user_detail");
    expect(result.rows).toBe(5); // duplicate UPN collapsed
    expect(result.draft.enabled_users).toBe(5);
    expect(result.draft.active_users).toBe(3);
    expect(result.draft.week).toBe("2026-W39");
    expect(result.draft.period_days).toBe(28);
    expect(result.draft.report_refresh_date).toBe("2026-09-25");
    expect(JSON.stringify(result.draft)).not.toMatch(/DC8C64D6|AAAA|BBBB/);
  });

  it("counts active users per app inside the window (chat columns deduplicated)", () => {
    expect(result.draft.active_by_app).toEqual({
      teams: 1,
      word: 1,
      excel: 0,
      powerpoint: 0,
      outlook: 1,
      onenote: 0,
      loop: 0,
      chat_work: 2,
      chat_web: 0,
      m365_app: 0,
      edge: 0,
      agents: 0,
    });
  });

  it("sums prompts and averages active days over active users", () => {
    expect(result.draft.prompts_total).toBe(50);
    expect(result.draft.prompts_per_active_user).toBeCloseTo(16.7, 1);
    expect(result.draft.active_days_avg).toBe(6);
    expect(result.draft.active_days_buckets).toEqual({ "1-2": 1, "3-5": 1, "6-10": 0, "11+": 1 });
    expect(result.draft.assisted_hours).toBeNull();
    expect(result.warnings).toEqual([]);
  });
});

describe("importCopilotCsv · variants", () => {
  it("reads a version 1 report and flags the missing prompt columns", () => {
    const header =
      "Report Refresh Date,User Principal Name,Display Name,Last Activity Date," +
      "Copilot Chat Last Activity Date,Microsoft Teams Copilot Last Activity Date," +
      "Word Copilot Last Activity Date,Report Period";
    const csv = [
      header,
      "2026-09-25,u1,n1,2026-09-20,2026-09-20,,2026-09-01,30",
      "2026-09-25,u2,n2,2026-07-01,,,,30",
    ].join("\n");
    const result = importCopilotCsv(csv);
    expect(result.draft.period_days).toBe(30);
    expect(result.draft.enabled_users).toBe(2);
    expect(result.draft.active_users).toBe(1);
    expect(result.draft.active_by_app).toEqual({ chat_work: 1, teams: 0, word: 1 });
    expect(result.draft.prompts_total).toBeNull();
    expect(result.draft.active_days_avg).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/Version 1/);
  });

  it("accepts a semicolon-separated export with German dates", () => {
    const csv = [
      "Report Refresh Date;User Principal Name;Last Activity Date;Word Copilot Last Activity Date;Report Period",
      "25.09.2026;u1;24.09.2026;24.09.2026;28",
      "25.09.2026;u2;01.08.2026;;28",
    ].join("\n");
    const result = importCopilotCsv(csv);
    expect(result.draft.report_refresh_date).toBe("2026-09-25");
    expect(result.draft.active_users).toBe(1);
    expect(result.draft.active_by_app).toEqual({ word: 1 });
  });

  it("takes the refresh date from the options when the column is missing", () => {
    const csv = ["User Principal Name,Last Activity Date", "u1,2026-09-20", "u2,2026-05-01"].join("\n");
    expect(() => importCopilotCsv(csv)).toThrow(CopilotImportError);
    const result = importCopilotCsv(csv, { refreshDate: new Date("2026-09-25T00:00:00Z") });
    expect(result.draft.week).toBe("2026-W39");
    expect(result.draft.period_days).toBe(28);
    expect(result.draft.active_users).toBe(1);
    expect(result.warnings.join(" ")).toMatch(/Berichtsdatum aus dem Formular übernommen: 2026-09-25/);
    expect(result.warnings.join(" ")).toMatch(/28 Tage angenommen/);
  });

  it("reads the user count summary and picks the requested window", () => {
    const csv = [
      "Report Refresh Date,Report Period,Any App Enabled Users,Any App Active Users," +
        "Microsoft Teams Enabled Users,Microsoft Teams Active Users,Word Enabled Users,Word Active Users," +
        "Copilot Chat (work) Enabled Users,Copilot Chat (work) Active Users,Edge Enabled Users,Edge Active Users," +
        "Total prompts submitted,Average prompts submitted",
      "2026-09-25,7,48,20,48,12,48,9,48,15,48,2,310,15.5",
      "2026-09-25,28,48,33,48,25,48,18,48,29,48,4,1240,37.6",
    ].join("\n");
    const result = importCopilotCsv(csv, { periodDays: 28 });
    expect(result.kind).toBe("summary");
    expect(result.draft.period_days).toBe(28);
    expect(result.draft.enabled_users).toBe(48);
    expect(result.draft.active_users).toBe(33);
    expect(result.draft.active_by_app).toEqual({ teams: 25, word: 18, chat_work: 29, edge: 4 });
    expect(result.draft.prompts_total).toBe(1240);
    expect(result.draft.prompts_per_active_user).toBe(37.6);
  });

  it("rejects files that are not a Copilot usage report", () => {
    expect(() => importCopilotCsv("Name,Email\nAnna,anna@firma.at")).toThrow(CopilotImportError);
    expect(() => importCopilotCsv("")).toThrow(CopilotImportError);
    try {
      importCopilotCsv("Name,Email\nAnna,anna@firma.at");
    } catch (err) {
      expect((err as CopilotImportError).headers).toEqual(["Name", "Email"]);
    }
  });
});

const snapshot: CopilotUsageSnapshot = {
  org_id: "org",
  week: "2026-W39",
  source: "csv",
  period_days: 28,
  report_refresh_date: "2026-09-25",
  enabled_users: 48,
  active_users: 30,
  active_by_app: { teams: 20 },
  prompts_total: 900,
  prompts_per_active_user: 30,
  active_days_avg: 8,
  active_days_buckets: null,
  assisted_hours: null,
  imported_at: "2026-09-28T08:00:00.000Z",
};

describe("metrics", () => {
  const tool: OrgToolSetting = {
    id: "t",
    org_id: "org",
    tool_value: "copilot365",
    tool_label: "Microsoft Copilot",
    monthly_license_cost_eur: 1440,
    seats: 48,
    active: true,
  };

  it("computes the active rate and the licence check from the seat count", () => {
    expect(activeRate(snapshot)).toBeCloseTo(0.625);
    expect(activeRate({ enabled_users: 0, active_users: 0 })).toBeNull();
    expect(licenseCheck(snapshot, tool)).toEqual({
      seats: 48,
      basis: "seats",
      costPerSeatEur: 30,
      unusedSeats: 18,
      unusedCostEur: 540,
    });
  });

  it("falls back to the report's licensed users without a seat count or tool", () => {
    expect(licenseCheck(snapshot, { ...tool, seats: null })).toMatchObject({
      seats: 48,
      basis: "report",
      costPerSeatEur: 30,
    });
    expect(licenseCheck(snapshot, null)).toEqual({
      seats: 48,
      basis: "report",
      costPerSeatEur: null,
      unusedSeats: 18,
      unusedCostEur: null,
    });
  });

  it("labels the telemetry share for R5", () => {
    expect(copilotTelemetryUsage(snapshot)).toEqual({
      tool_value: "copilot365",
      share: 0.625,
      label: "Microsoft-Nutzungsdaten (28 Tage bis 25.09.2026)",
    });
  });

  it("keeps one point per week in the trend, the latest import winning", () => {
    const older = { ...snapshot, active_users: 10, imported_at: "2026-09-27T08:00:00.000Z" };
    const previousWeek = { ...snapshot, week: "2026-W38", active_users: 25 };
    const trend = weeklyTrend([snapshot, older, previousWeek]);
    expect(trend.map((t) => t.week)).toEqual(["2026-W38", "2026-W39"]);
    expect(trend[1]?.activeRate).toBeCloseTo(0.625);
  });
});
