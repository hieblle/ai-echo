/**
 * Weekly Copilot sync (Wed 06:00 UTC, after Microsoft's 48–72 h latency):
 * pulls the usage reports for every org with a connected Microsoft 365
 * integration and stores the org-level aggregates (D4.10).
 */

import { NextResponse } from "next/server";
import { runCopilotSyncSchedule } from "@/lib/server/copilot-service";
import { authorizeCron, cronContext } from "@/lib/server/cron";
import { getM365Env } from "@/lib/server/env";
import { GraphClient } from "@/lib/server/m365-graph";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const ctx = cronContext();
  if ("error" in ctx) return ctx.error;
  const env = getM365Env();
  if (!env) {
    return NextResponse.json(
      { error: "M365_CLIENT_ID / M365_CLIENT_SECRET are not configured" },
      { status: 503 },
    );
  }
  const result = await runCopilotSyncSchedule(ctx.store, new GraphClient(env), new Date());
  return NextResponse.json({ ok: result.failed.length === 0, ...result });
}
