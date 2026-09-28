"use server";

/**
 * Server actions for the "7 Integrationen" section of the org admin page
 * (D4.10): CSV import of a Copilot usage report, manual Graph sync,
 * disconnect. Results travel back as short codes in the query string.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isMigrationPendingError } from "@/lib/data/supabase-store";
import { isCopilotImportError, parseReportDate } from "@/lib/domain/copilot";
import { canAdminOrg, getOrgAccess, requireViewer, type OrgAccess } from "./auth";
import { importCopilotReport, syncCopilotFromGraph } from "./copilot-service";
import { getM365Env } from "./env";
import { GraphClient } from "./m365-graph";

/** Report files are small (one line per licensed user); refuse anything odd. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function back(path: string, params: Record<string, string | number>): never {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) search.set(k, String(v));
  redirect(`${path}?${search.toString()}#integrationen`);
}

async function requireOrgAdmin(slug: string): Promise<OrgAccess> {
  const viewer = await requireViewer(`/app/${slug}/admin`);
  const access = await getOrgAccess(viewer, slug);
  if (!access || !canAdminOrg(access.role)) redirect("/app?denied=admin");
  return access;
}

export async function importCopilotCsvAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const access = await requireOrgAdmin(slug);
  const path = `/app/${slug}/admin`;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back(path, { err: "copilot_file" });
  if (file.size > MAX_FILE_BYTES) back(path, { err: "copilot_size" });

  const periodRaw = Number(text(formData, "period_days"));
  const periodDays = [7, 28, 30, 90, 180].includes(periodRaw) ? periodRaw : undefined;
  const refreshRaw = text(formData, "refresh_date");
  const refreshDate = refreshRaw ? (parseReportDate(refreshRaw) ?? undefined) : undefined;
  if (refreshRaw && !refreshDate) back(path, { err: "copilot_date" });

  let content: string;
  try {
    content = await file.text();
  } catch {
    back(path, { err: "copilot_file" });
  }

  try {
    const { snapshot, result } = await importCopilotReport(
      access.store,
      access.org,
      content,
      { source: "csv", periodDays, refreshDate },
      new Date(),
    );
    revalidatePath(path);
    revalidatePath(`/app/${slug}/copilot`);
    revalidatePath(`/app/${slug}/dashboard`);
    back(path, {
      ok: "copilot",
      w: snapshot.week,
      e: snapshot.enabled_users,
      a: snapshot.active_users,
      p: snapshot.period_days,
      n: result.warnings.length,
      ...(result.warnings.length > 0 ? { d: result.warnings.join(" ").slice(0, 300) } : {}),
    });
  } catch (err) {
    if (isCopilotImportError(err)) {
      back(path, {
        err: "copilot_parse",
        d: `${err.message} Gefundene Spalten: ${err.headers.slice(0, 12).join(", ") || "keine"}`.slice(0, 400),
      });
    }
    if (isMigrationPendingError(err)) back(path, { err: "migration_copilot" });
    throw err;
  }
}

export async function syncCopilotNowAction(slug: string): Promise<void> {
  const access = await requireOrgAdmin(slug);
  const path = `/app/${slug}/admin`;
  const env = getM365Env();
  if (!env) back(path, { err: "m365config" });
  const integration = await access.store.getIntegration(access.org.id, "m365");
  if (!integration || !integration.tenant_id) back(path, { err: "m365notconnected" });
  try {
    const result = await syncCopilotFromGraph(
      access.store,
      access.org,
      integration,
      new GraphClient(env),
      new Date(),
    );
    revalidatePath(path);
    revalidatePath(`/app/${slug}/copilot`);
    revalidatePath(`/app/${slug}/dashboard`);
    back(path, { ok: "synced", w: result.weeks.join(" ") });
  } catch (err) {
    if (isMigrationPendingError(err)) back(path, { err: "migration_copilot" });
    const message = err instanceof Error ? err.message : String(err);
    await access.store.upsertIntegration({
      ...integration,
      status: "error",
      last_error: message.slice(0, 500),
    });
    revalidatePath(path);
    back(path, { err: "sync", d: message.slice(0, 300) });
  }
}

export async function disconnectM365Action(slug: string): Promise<void> {
  const access = await requireOrgAdmin(slug);
  const path = `/app/${slug}/admin`;
  const integration = await access.store.getIntegration(access.org.id, "m365");
  if (integration) {
    await access.store.upsertIntegration({
      ...integration,
      tenant_id: null,
      status: "pending",
      names_concealed: null,
      consented_at: null,
      last_error: null,
    });
  }
  revalidatePath(path);
  back(path, { ok: "disconnected" });
}
