import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/data/memory-store";
import { MemoryMailer } from "@/lib/mail/mailer";
import { QUESTIONS } from "@/lib/seed/questions";
import { RECOMMENDATION_RULES } from "@/lib/seed/rules";
import type { Membership, Organization } from "@/lib/types";
import {
  closeExpiredCycles,
  cyclePeriod,
  lastWorkingDayOfMonth,
  openCycle,
  runDailySchedule,
  runReminderSchedule,
  sendReminders,
} from "./cycle-service";

const ORG: Organization = {
  id: "org-a",
  name: "Org A",
  slug: "org-a",
  logo_url: null,
  primary_color: null,
  hourly_rate_default: 60,
  locale: "de",
  form_of_address: "du",
  k_anonymity_min: 5,
  is_demo: false,
};

const MONDAY = new Date("2026-09-21T07:00:00.000Z"); // 2026-W39
const THURSDAY = new Date("2026-09-24T08:00:00.000Z");

function member(id: string, role: Membership["role"], status: Membership["status"] = "active"): Omit<Membership, "id"> & { id?: string } {
  return {
    org_id: ORG.id,
    user_id: `u-${id}`,
    email: `${id}@firma.at`,
    department_id: null,
    role,
    status,
    invited_at: "2026-09-01T09:00:00.000Z",
    joined_at: null,
  };
}

let store: MemoryStore;
let mailer: MemoryMailer;

beforeEach(async () => {
  store = new MemoryStore({
    organizations: [ORG],
    departments: [],
    personas: [],
    questions: QUESTIONS,
    toolSettings: [],
    rules: RECOMMENDATION_RULES,
  });
  mailer = new MemoryMailer();
  await store.createMembership(member("anna", "employee"));
  await store.createMembership(member("bert", "team_lead"));
  await store.createMembership(member("carla", "org_admin", "invited"));
  await store.createMembership(member("gone", "employee", "removed"));
});

describe("cyclePeriod / lastWorkingDayOfMonth", () => {
  it("weekly covers Monday–Sunday of the ISO week", () => {
    expect(cyclePeriod("weekly", THURSDAY)).toEqual({
      week: "2026-W39",
      period_start: "2026-09-21",
      period_end: "2026-09-27",
    });
  });

  it("monthly stays open a week from the opening day", () => {
    expect(cyclePeriod("monthly", new Date("2026-09-30T07:00:00.000Z"))).toEqual({
      week: "2026-W40",
      period_start: "2026-09-30",
      period_end: "2026-10-06",
    });
  });

  it("finds the last working day (Oct 2026 ends on a Saturday)", () => {
    expect(lastWorkingDayOfMonth(new Date("2026-10-05T00:00:00.000Z"))).toBe("2026-10-30");
    expect(lastWorkingDayOfMonth(new Date("2026-09-05T00:00:00.000Z"))).toBe("2026-09-30");
  });
});

describe("openCycle", () => {
  it("invites everyone except removed members, mails once, and is idempotent", async () => {
    const first = await openCycle(store, mailer, ORG, "weekly", MONDAY);
    expect(first).toMatchObject({ created: true, invited: 3, mailed: 3 });
    expect(first.cycle).toMatchObject({ week: "2026-W39", status: "open" });
    expect(mailer.loginLinks.map((l) => l.email).sort()).toEqual([
      "anna@firma.at",
      "bert@firma.at",
      "carla@firma.at",
    ]);

    const again = await openCycle(store, mailer, ORG, "weekly", THURSDAY);
    expect(again).toMatchObject({ created: false, invited: 0, mailed: 0 });
    expect(again.cycle.id).toBe(first.cycle.id);
    expect(mailer.loginLinks).toHaveLength(3);
  });

  it("invites a member who joined mid-week without re-mailing the others", async () => {
    const first = await openCycle(store, mailer, ORG, "weekly", MONDAY);
    await store.createMembership(member("dora", "employee"));
    const later = await openCycle(store, mailer, ORG, "weekly", THURSDAY);
    expect(later).toMatchObject({ created: false, invited: 1, mailed: 1 });
    expect(await store.listParticipations(first.cycle.id)).toHaveLength(4);
  });

  it("only invites leads to the leadership block", async () => {
    const r = await openCycle(store, mailer, ORG, "leadership", MONDAY);
    expect(r.invited).toBe(2);
    expect(mailer.loginLinks.map((l) => l.email).sort()).toEqual(["bert@firma.at", "carla@firma.at"]);
  });

  it("does not reopen a closed cycle of the same week", async () => {
    const first = await openCycle(store, mailer, ORG, "weekly", MONDAY);
    await store.updateCycle(first.cycle.id, { status: "closed" });
    const again = await openCycle(store, mailer, ORG, "weekly", THURSDAY);
    expect(again.cycle.status).toBe("closed");
    expect(again.invited).toBe(0);
  });

  it("keeps going when a single mail fails", async () => {
    mailer.failFor.add("bert@firma.at");
    const r = await openCycle(store, mailer, ORG, "weekly", MONDAY);
    expect(r).toMatchObject({ invited: 3, mailed: 2 });
  });
});

describe("sendReminders", () => {
  it("reminds only pending participants, once per cycle", async () => {
    const opened = await openCycle(store, mailer, ORG, "weekly", MONDAY);
    const anna = (await store.listMemberships(ORG.id)).find((m) => m.email === "anna@firma.at")!;
    await store.completeParticipation(opened.cycle.id, anna.id, "2026-09-22T10:00:00.000Z");
    mailer.loginLinks.length = 0;

    const r = await sendReminders(store, mailer, ORG, THURSDAY);
    expect(r).toEqual({ cycles: 1, mailed: 2 });
    expect(mailer.loginLinks.every((l) => l.kind === "reminder")).toBe(true);
    expect(mailer.loginLinks.map((l) => l.email).sort()).toEqual(["bert@firma.at", "carla@firma.at"]);
    expect((await store.getCycle(opened.cycle.id))?.reminder_sent_at).toBe(THURSDAY.toISOString());

    const again = await sendReminders(store, mailer, ORG, THURSDAY);
    expect(again).toEqual({ cycles: 0, mailed: 0 });
  });
});

describe("closeExpiredCycles / schedules", () => {
  it("closes cycles whose period ended", async () => {
    const opened = await openCycle(store, mailer, ORG, "weekly", MONDAY);
    expect(await closeExpiredCycles(store, ORG, THURSDAY)).toBe(0);
    expect(await closeExpiredCycles(store, ORG, new Date("2026-09-28T07:00:00.000Z"))).toBe(1);
    expect((await store.getCycle(opened.cycle.id))?.status).toBe("closed");
  });

  it("daily schedule opens weekly on Monday and monthly + leadership at month end", async () => {
    const monday = await runDailySchedule(store, mailer, MONDAY);
    expect(monday.opened).toEqual([{ org: "org-a", template: "weekly", invited: 3, mailed: 3 }]);

    const tuesday = await runDailySchedule(store, mailer, new Date("2026-09-22T07:00:00.000Z"));
    expect(tuesday.opened).toEqual([]);

    const monthEnd = await runDailySchedule(store, mailer, new Date("2026-09-30T07:00:00.000Z"));
    expect(monthEnd.opened.map((o) => o.template)).toEqual(["monthly", "leadership"]);
    expect(monthEnd.closed).toBe(1); // W39 weekly ended 2026-09-27
  });

  it("reminder schedule covers all open cycles of non-demo orgs", async () => {
    await runDailySchedule(store, mailer, MONDAY);
    mailer.loginLinks.length = 0;
    expect(await runReminderSchedule(store, mailer, THURSDAY)).toEqual({ cycles: 1, mailed: 3 });
  });
});
