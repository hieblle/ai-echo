"use server";

/**
 * Server actions for org setup (F1, platform_admin) and org administration
 * (F2 invitations, settings, cycles — org_admin). Every action re-verifies
 * the caller; results travel back as short codes in the query string.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MigrationPendingError } from "@/lib/data/supabase-store";
import {
  canAdminOrg,
  getOrgAccess,
  requirePlatformAdmin,
  requireViewer,
  type OrgAccess,
} from "./auth";
import {
  createOrganizationWithSetup,
  inviteMembers,
  normalizeSeats,
  parseEmailList,
  resendInvitation,
  type ToolInput,
} from "./admin-service";
import {
  closeCycle,
  openCycle,
  sendReminders,
  type CycleTemplate,
} from "./cycle-service";
import { getMailer } from "./mailer-instance";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function number(formData: FormData, name: string, fallback: number): number {
  const value = Number(text(formData, name).replace(",", "."));
  return Number.isFinite(value) ? value : fallback;
}

function back(path: string, params: Record<string, string | number>): never {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) search.set(k, String(v));
  redirect(`${path}?${search.toString()}`);
}

async function requireOrgAdmin(slug: string): Promise<OrgAccess> {
  const viewer = await requireViewer(`/app/${slug}/admin`);
  const access = await getOrgAccess(viewer, slug);
  if (!access || !canAdminOrg(access.role)) redirect("/app?denied=admin");
  return access;
}

// --- Platform admin: F1 --------------------------------------------------------

const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().max(60).optional(),
  form_of_address: z.enum(["du", "sie"]),
  hourly_rate_default: z.number().min(0).max(10_000),
  k_anonymity_min: z.number().int().min(5).max(50),
});

export async function createOrgAction(formData: FormData): Promise<void> {
  const viewer = await requirePlatformAdmin();
  const parsed = createOrgSchema.safeParse({
    name: text(formData, "name"),
    slug: text(formData, "slug") || undefined,
    form_of_address: text(formData, "form_of_address"),
    hourly_rate_default: number(formData, "hourly_rate_default", 60),
    k_anonymity_min: number(formData, "k_anonymity_min", 5),
  });
  if (!parsed.success) back("/admin", { err: "invalid" });

  const departments = text(formData, "departments")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const tools: ToolInput[] = [];
  for (const [key, value] of formData.entries()) {
    const match = /^tool:(.+)$/.exec(key);
    if (!match || value !== "on") continue;
    const toolValue = match[1] ?? "";
    tools.push({
      tool_value: toolValue,
      tool_label: text(formData, `label:${toolValue}`) || toolValue,
      monthly_license_cost_eur: number(formData, `cost:${toolValue}`, 0),
      seats: number(formData, `seats:${toolValue}`, 0),
    });
  }

  try {
    const org = await createOrganizationWithSetup(viewer.store, {
      ...parsed.data,
      departments,
      tools,
    });
    revalidatePath("/admin");
    back("/admin", { ok: "created", org: org.slug });
  } catch (err) {
    if (err instanceof MigrationPendingError) {
      revalidatePath("/admin");
      back("/admin", { err: "migration" });
    }
    if (err instanceof Error && /slug|duplicate|unique/i.test(err.message)) {
      back("/admin", { err: "slug" });
    }
    throw err;
  }
}

export async function inviteOrgAdminAction(formData: FormData): Promise<void> {
  const viewer = await requirePlatformAdmin();
  const slug = text(formData, "slug");
  const org = await viewer.store.getOrganizationBySlug(slug);
  if (!org) back("/admin", { err: "org" });
  const { valid } = parseEmailList(text(formData, "email"));
  if (valid.length !== 1) back("/admin", { err: "email" });
  const result = await inviteMembers(
    viewer.store,
    getMailer(),
    org,
    { emails: valid, role: "org_admin", department_id: null },
    new Date(),
  );
  revalidatePath("/admin");
  if (result.failed.length > 0) back("/admin", { err: "send", org: org.slug });
  back("/admin", {
    ok: result.invited.length ? "invited" : "existing",
    org: org.slug,
  });
}

// --- Org admin: F2 invitations & members ---------------------------------------

const roleSchema = z.enum(["employee", "team_lead", "org_admin"]);

export async function inviteMembersAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const access = await requireOrgAdmin(slug);
  const path = `/app/${slug}/admin`;
  const role = roleSchema.safeParse(text(formData, "role"));
  if (!role.success) back(path, { err: "invalid" });
  const { valid, invalid } = parseEmailList(text(formData, "emails"));
  if (valid.length === 0) back(path, { err: "email" });

  const result = await inviteMembers(
    access.store,
    getMailer(),
    access.org,
    {
      emails: valid,
      role: role.data,
      department_id: text(formData, "department_id") || null,
    },
    new Date(),
  );
  revalidatePath(path);
  back(path, {
    ok: "invited",
    n: result.invited.length,
    e: result.existing.length,
    f: result.failed.length + invalid.length,
  });
}

export async function updateMemberAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const access = await requireOrgAdmin(slug);
  const path = `/app/${slug}/admin`;
  const membershipId = text(formData, "membership_id");
  const membership = await access.store.getMembership(membershipId);
  if (!membership || membership.org_id !== access.org.id) {
    back(path, { err: "member" });
  }
  const intent = text(formData, "intent");
  if (intent === "remove") {
    // An org must keep at least one admin, and nobody removes themselves.
    if (membership.user_id === access.viewer.user.id) back(path, { err: "self" });
    await access.store.updateMembership(membership.id, { status: "removed" });
    revalidatePath(path);
    back(path, { ok: "removed" });
  }
  if (intent === "resend") {
    await resendInvitation(getMailer(), access.org, membership);
    back(path, { ok: "resent" });
  }
  const role = roleSchema.safeParse(text(formData, "role"));
  if (!role.success) back(path, { err: "invalid" });
  if (
    membership.user_id === access.viewer.user.id &&
    role.data !== "org_admin" &&
    access.role !== "platform_admin"
  ) {
    back(path, { err: "self" });
  }
  const departmentId = text(formData, "department_id") || null;
  const departments = await access.store.listDepartments(access.org.id);
  await access.store.updateMembership(membership.id, {
    role: role.data,
    department_id:
      departmentId && departments.some((d) => d.id === departmentId)
        ? departmentId
        : null,
  });
  revalidatePath(path);
  back(path, { ok: "updated" });
}

// --- Org admin: settings -------------------------------------------------------

export async function updateOrgSettingsAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const access = await requireOrgAdmin(slug);
  const path = `/app/${slug}/admin`;
  const form = z.enum(["du", "sie"]).safeParse(text(formData, "form_of_address"));
  if (!form.success) back(path, { err: "invalid" });
  const k = Math.round(number(formData, "k_anonymity_min", access.org.k_anonymity_min));
  if (k < access.org.k_anonymity_min) back(path, { err: "k" });
  await access.store.updateOrganization(access.org.id, {
    form_of_address: form.data,
    hourly_rate_default: Math.max(0, number(formData, "hourly_rate_default", access.org.hourly_rate_default)),
    k_anonymity_min: Math.min(50, k),
  });
  revalidatePath(path);
  back(path, { ok: "settings" });
}

export async function upsertToolAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const access = await requireOrgAdmin(slug);
  const path = `/app/${slug}/admin`;
  const toolValue = text(formData, "tool_value");
  const label = text(formData, "tool_label") || toolValue;
  if (!toolValue || toolValue.length > 60) back(path, { err: "invalid" });
  try {
    await access.store.upsertToolSetting({
      org_id: access.org.id,
      tool_value: toolValue,
      tool_label: label,
      monthly_license_cost_eur: Math.max(0, number(formData, "cost", 0)),
      seats: normalizeSeats(number(formData, "seats", 0)),
      // Checkbox "on" next to a hidden "off" fallback for the unchecked case.
      active: formData.getAll("active").includes("on"),
    });
  } catch (err) {
    if (err instanceof MigrationPendingError) back(path, { err: "migration" });
    throw err;
  }
  revalidatePath(path);
  back(path, { ok: "tool" });
}

export async function deleteToolAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const access = await requireOrgAdmin(slug);
  await access.store.deleteToolSetting(access.org.id, text(formData, "tool_value"));
  revalidatePath(`/app/${slug}/admin`);
  back(`/app/${slug}/admin`, { ok: "tool" });
}

export async function addDepartmentAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const access = await requireOrgAdmin(slug);
  const name = text(formData, "name").replace(/\s+/g, " ");
  if (!name || name.length > 120) back(`/app/${slug}/admin`, { err: "invalid" });
  await access.store.createDepartment(access.org.id, name);
  revalidatePath(`/app/${slug}/admin`);
  back(`/app/${slug}/admin`, { ok: "department" });
}

export async function deleteDepartmentAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const access = await requireOrgAdmin(slug);
  await access.store.deleteDepartment(access.org.id, text(formData, "department_id"));
  revalidatePath(`/app/${slug}/admin`);
  back(`/app/${slug}/admin`, { ok: "department" });
}

// --- Org admin: cycles -----------------------------------------------------------

const cycleTemplateSchema = z.enum(["weekly", "monthly", "leadership"]);

export async function openCycleAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const access = await requireOrgAdmin(slug);
  const path = `/app/${slug}/admin`;
  const template = cycleTemplateSchema.safeParse(text(formData, "template"));
  if (!template.success) back(path, { err: "invalid" });
  const result = await openCycle(
    access.store,
    getMailer(),
    access.org,
    template.data as CycleTemplate,
    new Date(),
  );
  revalidatePath(path);
  revalidatePath("/app");
  back(path, { ok: "opened", n: result.invited, m: result.mailed });
}

export async function sendRemindersAction(slug: string): Promise<void> {
  const access = await requireOrgAdmin(slug);
  const result = await sendReminders(access.store, getMailer(), access.org, new Date());
  back(`/app/${slug}/admin`, { ok: "reminded", n: result.mailed });
}

export async function closeCycleAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const access = await requireOrgAdmin(slug);
  const cycleId = text(formData, "cycle_id");
  const cycle = await access.store.getCycle(cycleId);
  if (!cycle || cycle.org_id !== access.org.id) back(`/app/${slug}/admin`, { err: "invalid" });
  await closeCycle(access.store, cycleId);
  revalidatePath(`/app/${slug}/admin`);
  revalidatePath("/app");
  back(`/app/${slug}/admin`, { ok: "closed" });
}
