/**
 * Daily scheduler step (Mon 09:00 → weekly pulse; last working day →
 * monthly + leadership; always closes expired cycles). Idempotent.
 */

import { NextResponse } from "next/server";
import { authorizeCron, cronContext } from "@/lib/server/cron";
import { runDailySchedule } from "@/lib/server/cycle-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const ctx = cronContext();
  if ("error" in ctx) return ctx.error;
  const result = await runDailySchedule(ctx.store, ctx.mailer, new Date());
  return NextResponse.json({ ok: true, ...result });
}
