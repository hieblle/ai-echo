/**
 * Reminder step (Thu 10:00): one login-link reminder per open cycle to
 * everyone still `invited`. Idempotent per cycle.
 */

import { NextResponse } from "next/server";
import { authorizeCron, cronContext } from "@/lib/server/cron";
import { runReminderSchedule } from "@/lib/server/cycle-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const ctx = cronContext();
  if ("error" in ctx) return ctx.error;
  const result = await runReminderSchedule(ctx.store, ctx.mailer, new Date());
  return NextResponse.json({ ok: true, ...result });
}
