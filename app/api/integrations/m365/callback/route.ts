/**
 * Return leg of the Microsoft 365 admin consent (D4.10). Microsoft sends
 * `tenant`, `state` and `admin_consent=True` (or `error`). The state must
 * verify AND the browser must still belong to an admin of that org — only
 * then is the tenant id stored. No secret is ever received here.
 */

import { NextResponse, type NextRequest } from "next/server";
import { canAdminOrg, getOrgAccess, getViewer } from "@/lib/server/auth";
import { getAppUrl, getPseudonymSecret } from "@/lib/server/env";
import { verifyConsentState } from "@/lib/server/m365-graph";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const base = getAppUrl();
  const secret = getPseudonymSecret();
  const verified = secret ? verifyConsentState(secret, params.get("state") ?? "") : null;
  if (!verified) {
    return NextResponse.redirect(`${base}/app?denied=admin`);
  }
  const adminPath = `/app/${verified.slug}/admin`;
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.redirect(`${base}/login?next=${encodeURIComponent(adminPath)}`);
  }
  const access = await getOrgAccess(viewer, verified.slug);
  if (!access || !canAdminOrg(access.role)) {
    return NextResponse.redirect(`${base}/app?denied=admin`);
  }

  const tenant = params.get("tenant") ?? "";
  const consented = (params.get("admin_consent") ?? "").toLowerCase() === "true";
  if (!consented || !/^[0-9a-f-]{36}$/i.test(tenant)) {
    const detail = (params.get("error_description") ?? params.get("error") ?? "").slice(0, 200);
    const search = new URLSearchParams({ err: "m365", ...(detail ? { d: detail } : {}) });
    return NextResponse.redirect(`${base}${adminPath}?${search.toString()}#integrationen`);
  }

  const existing = await access.store.getIntegration(access.org.id, "m365");
  await access.store.upsertIntegration({
    org_id: access.org.id,
    provider: "m365",
    tenant_id: tenant,
    status: "connected",
    names_concealed: existing?.names_concealed ?? null,
    consented_at: new Date().toISOString(),
    last_sync_at: existing?.last_sync_at ?? null,
    last_error: null,
  });
  return NextResponse.redirect(`${base}${adminPath}?ok=m365#integrationen`);
}
