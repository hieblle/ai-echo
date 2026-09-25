/**
 * Survey cycles (SPEC §8 F3/F4): opening, inviting, reminding, closing.
 * Server-only, store/mailer-agnostic. The cron routes and the org admin's
 * "jetzt öffnen" button both call these.
 *
 * Schedule (SPEC): weekly pulse opens Monday 09:00 with a mail, one reminder
 * Thursday 10:00 to everyone still `invited`; monthly (+ leadership block)
 * opens on the last working day of the month. Everything is idempotent —
 * running a step twice never invites or mails anyone twice.
 */

import type { Store } from "@/lib/data/store";
import type { Mailer } from "@/lib/mail/mailer";
import { getIsoWeek } from "@/lib/domain/isoWeek";
import type {
  Membership,
  Organization,
  SurveyCycle,
  TemplateKey,
} from "@/lib/types";
import { mondayOfIsoWeek } from "./dashboard-service";

export type CycleTemplate = Exclude<TemplateKey, "onboarding">;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Week + period of a cycle opened at `now`. */
export function cyclePeriod(
  template: CycleTemplate,
  now: Date,
): { week: string; period_start: string; period_end: string } {
  const week = getIsoWeek(now);
  if (template === "weekly") {
    const monday = mondayOfIsoWeek(week);
    return {
      week,
      period_start: isoDate(monday),
      period_end: isoDate(new Date(monday.getTime() + 6 * 86_400_000)),
    };
  }
  // Monthly and leadership stay open for a week from the opening day.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    week,
    period_start: isoDate(start),
    period_end: isoDate(new Date(start.getTime() + 6 * 86_400_000)),
  };
}

/** Who takes part: everyone for weekly/monthly, leads for leadership. */
export function participantsFor(
  template: CycleTemplate,
  memberships: Membership[],
): Membership[] {
  return memberships.filter(
    (m) =>
      m.status !== "removed" &&
      (template !== "leadership" || m.role !== "employee"),
  );
}

export interface OpenCycleResult {
  cycle: SurveyCycle;
  created: boolean;
  /** Newly invited members (participation rows added). */
  invited: number;
  /** Invitations actually mailed (mail failures are logged, not fatal). */
  mailed: number;
}

/**
 * Open (or extend) this week's cycle: participation rows for everyone who
 * has none yet, one login-link mail per new row.
 */
export async function openCycle(
  store: Store,
  mailer: Mailer,
  org: Organization,
  template: CycleTemplate,
  now: Date,
): Promise<OpenCycleResult> {
  const period = cyclePeriod(template, now);
  const before = await store.listCycles(org.id, { template_key: template });
  const existed = before.some((c) => c.week === period.week);
  const cycle = await store.ensureCycle({
    org_id: org.id,
    template_key: template,
    ...period,
    status: "open",
    reminder_sent_at: null,
  });
  if (cycle.status !== "open") {
    // Closed earlier this week — never silently reopen.
    return { cycle, created: false, invited: 0, mailed: 0 };
  }

  const members = participantsFor(template, await store.listMemberships(org.id));
  const already = new Set(
    (await store.listParticipations(cycle.id)).map((p) => p.membership_id),
  );
  const fresh = members.filter((m) => !already.has(m.id));
  await store.addParticipations(
    fresh.map((m) => ({
      cycle_id: cycle.id,
      membership_id: m.id,
      status: "invited",
      completed_at: null,
    })),
  );

  let mailed = 0;
  for (const m of fresh) {
    try {
      await mailer.sendLoginLink({
        email: m.email,
        orgName: org.name,
        template,
        kind: "invitation",
      });
      mailed += 1;
    } catch (err) {
      console.error(`openCycle: mail to ${m.email} failed:`, err);
    }
  }
  return { cycle, created: !existed, invited: fresh.length, mailed };
}

export interface ReminderResult {
  cycles: number;
  mailed: number;
}

/** One reminder per open cycle to everyone still `invited` (SPEC §4.1). */
export async function sendReminders(
  store: Store,
  mailer: Mailer,
  org: Organization,
  now: Date,
): Promise<ReminderResult> {
  const result: ReminderResult = { cycles: 0, mailed: 0 };
  const open = await store.listCycles(org.id, { status: "open" });
  const members = new Map(
    (await store.listMemberships(org.id)).map((m) => [m.id, m]),
  );
  for (const cycle of open) {
    if (cycle.reminder_sent_at) continue;
    if (cycle.template_key === "onboarding") continue;
    const pending = (await store.listParticipations(cycle.id)).filter(
      (p) => p.status === "invited",
    );
    for (const p of pending) {
      const m = members.get(p.membership_id);
      if (!m || m.status === "removed") continue;
      try {
        await mailer.sendLoginLink({
          email: m.email,
          orgName: org.name,
          template: cycle.template_key,
          kind: "reminder",
        });
        result.mailed += 1;
      } catch (err) {
        console.error(`sendReminders: mail to ${m.email} failed:`, err);
      }
    }
    await store.updateCycle(cycle.id, { reminder_sent_at: now.toISOString() });
    result.cycles += 1;
  }
  return result;
}

export async function closeCycle(store: Store, cycleId: string): Promise<void> {
  await store.updateCycle(cycleId, { status: "closed" });
}

/** Close open cycles whose period ended before today. */
export async function closeExpiredCycles(
  store: Store,
  org: Organization,
  now: Date,
): Promise<number> {
  const today = isoDate(now);
  let closed = 0;
  for (const cycle of await store.listCycles(org.id, { status: "open" })) {
    if (cycle.period_end < today) {
      await store.updateCycle(cycle.id, { status: "closed" });
      closed += 1;
    }
  }
  return closed;
}

/** Last working day (Mon–Fri) of the month `now` is in, as YYYY-MM-DD. */
export function lastWorkingDayOfMonth(now: Date): string {
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const day = last.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const back = day === 0 ? 2 : day === 6 ? 1 : 0;
  return isoDate(new Date(last.getTime() - back * 86_400_000));
}

export interface ScheduleResult {
  opened: { org: string; template: CycleTemplate; invited: number; mailed: number }[];
  closed: number;
}

/**
 * The daily scheduler step (cron 09:00): Monday → weekly pulse; last working
 * day of the month → monthly + leadership; always close expired cycles.
 */
export async function runDailySchedule(
  store: Store,
  mailer: Mailer,
  now: Date,
): Promise<ScheduleResult> {
  const result: ScheduleResult = { opened: [], closed: 0 };
  const isMonday = now.getUTCDay() === 1;
  const isMonthEnd = isoDate(now) === lastWorkingDayOfMonth(now);
  for (const org of await store.listOrganizations()) {
    if (org.is_demo) continue;
    result.closed += await closeExpiredCycles(store, org, now);
    const templates: CycleTemplate[] = [];
    if (isMonday) templates.push("weekly");
    if (isMonthEnd) templates.push("monthly", "leadership");
    for (const template of templates) {
      const r = await openCycle(store, mailer, org, template, now);
      if (r.created || r.invited > 0) {
        result.opened.push({
          org: org.slug,
          template,
          invited: r.invited,
          mailed: r.mailed,
        });
      }
    }
  }
  return result;
}

/** The reminder step (cron Thursday 10:00): every open cycle, once. */
export async function runReminderSchedule(
  store: Store,
  mailer: Mailer,
  now: Date,
): Promise<ReminderResult> {
  const total: ReminderResult = { cycles: 0, mailed: 0 };
  for (const org of await store.listOrganizations()) {
    if (org.is_demo) continue;
    const r = await sendReminders(store, mailer, org, now);
    total.cycles += r.cycles;
    total.mailed += r.mailed;
  }
  return total;
}
