/**
 * Start of the Microsoft 365 admin-consent round trip (D4.10): the org
 * admin clicks "Microsoft 365 verbinden" → signed state → Microsoft's
 * consent page for the multi-tenant app → /api/integrations/m365/callback.
 */

import { NextResponse, type NextRequest } from "next/server";
import { canAdminOrg, getOrgAccess, getViewer } from "@/lib/server/auth";
import { getAppUrl, getM365Env, getPseudonymSecret } from "@/lib/server/env";
import { adminConsentUrl, signConsentState } from "@/lib/server/m365-graph";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("org") ?? "";
  const base = getAppUrl();
  const adminPath = `/app/${slug}/admin`;
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.redirect(`${base}/login?next=${encodeURIComponent(adminPath)}`);
  }
  const access = await getOrgAccess(viewer, slug);
  if (!access || !canAdminOrg(access.role)) {
    return NextResponse.redirect(`${base}/app?denied=admin`);
  }
  const env = getM365Env();
  const secret = getPseudonymSecret();
  if (!env || !secret) {
    return NextResponse.redirect(`${base}${adminPath}?err=m365config#integrationen`);
  }
  // Remember the pending connection so the admin page can show the state.
  const existing = await access.store.getIntegration(access.org.id, "m365");
  if (!existing) {
    await access.store.upsertIntegration({
      org_id: access.org.id,
      provider: "m365",
      tenant_id: null,
      status: "pending",
      names_concealed: null,
      consented_at: null,
      last_sync_at: null,
      last_error: null,
    });
  }
  const state = signConsentState(secret, access.org.slug);
  return NextResponse.redirect(
    adminConsentUrl(env, `${base}/api/integrations/m365/callback`, state),
  );
}
