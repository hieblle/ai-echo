/**
 * Shared guard for /api/cron/*: the scheduler must present CRON_SECRET as a
 * bearer token (Vercel Cron does this automatically when the variable
 * exists; any other scheduler sets the header itself — DECISIONS D3.1).
 */

import { NextResponse } from "next/server";
import { getCronSecret } from "./env";
import { getMailer } from "./mailer-instance";
import { getAppStore } from "./store-instance";

export function authorizeCron(request: Request): NextResponse | null {
  const secret = getCronSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export function cronContext() {
  const store = getAppStore();
  if (!store) {
    return {
      error: NextResponse.json(
        { error: "Supabase is not configured" },
        { status: 503 },
      ),
    };
  }
  return { store, mailer: getMailer() };
}
