/**
 * Who is calling, and what may they touch (server-only).
 *
 * Every product route resolves a `Viewer` (verified auth user + memberships)
 * and, for org-scoped pages, an `OrgAccess` whose `role` decides what the
 * page renders. Tenant isolation lives HERE: the store is service-role and
 * only ever receives the org id of a verified membership (DECISIONS D4.3).
 * platform_admin (dbrains) is granted via PLATFORM_ADMIN_EMAILS, not via a
 * membership.
 */

import { redirect } from "next/navigation";
import type { Store } from "@/lib/data/store";
import type { Membership, Organization, Role, RoleScope } from "@/lib/types";
import { getPlatformAdminEmails, isSupabaseConfigured } from "./env";
import { getAppStore } from "./store-instance";
import { getAuthUser, type AuthUser } from "./supabase-auth";

export interface Viewer {
  user: AuthUser;
  isPlatformAdmin: boolean;
  /** Memberships that are not removed. */
  memberships: Membership[];
  store: Store;
}

export interface OrgAccess {
  viewer: Viewer;
  org: Organization;
  /** null for platform admins without a membership in this org. */
  membership: Membership | null;
  role: Role;
  store: Store;
}

export function roleScopeOf(role: Role): RoleScope {
  return role === "employee" ? "employee" : "lead";
}

export function canViewDashboard(role: Role): boolean {
  return role !== "employee";
}

export function canAdminOrg(role: Role): boolean {
  return role === "org_admin" || role === "platform_admin";
}

/** The calling user with memberships, or null when not logged in. */
export async function getViewer(): Promise<Viewer | null> {
  const store = getAppStore();
  if (!store) return null;
  const user = await getAuthUser();
  if (!user) return null;
  const memberships = (await store.listMembershipsByUser(user.id)).filter(
    (m) => m.status !== "removed",
  );
  return {
    user,
    isPlatformAdmin: getPlatformAdminEmails().includes(user.email),
    memberships,
    store,
  };
}

/** Redirects to /login (or the setup hint) when nobody is logged in. */
export async function requireViewer(nextPath = "/app"): Promise<Viewer> {
  if (!isSupabaseConfigured()) redirect("/app/setup");
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return viewer;
}

export async function requirePlatformAdmin(): Promise<Viewer> {
  const viewer = await requireViewer("/admin");
  if (!viewer.isPlatformAdmin) redirect("/app?denied=admin");
  return viewer;
}

/**
 * Resolve the org behind `slug` for the viewer. Returns null when the org
 * does not exist or the viewer has no membership in it (and is no platform
 * admin) — callers render notFound() so orgs are not enumerable.
 */
export async function getOrgAccess(
  viewer: Viewer,
  slug: string,
): Promise<OrgAccess | null> {
  const org = await viewer.store.getOrganizationBySlug(slug);
  if (!org) return null;
  const membership =
    viewer.memberships.find((m) => m.org_id === org.id) ?? null;
  if (!membership && !viewer.isPlatformAdmin) return null;
  const role: Role = viewer.isPlatformAdmin
    ? "platform_admin"
    : (membership?.role ?? "employee");
  return { viewer, org, membership, role, store: viewer.store };
}

/**
 * First login of an invited person: flip their memberships to active.
 * Idempotent; called from the /app home.
 */
export async function activateMemberships(viewer: Viewer): Promise<void> {
  const now = new Date().toISOString();
  for (const m of viewer.memberships) {
    if (m.status === "invited") {
      await viewer.store.updateMembership(m.id, {
        status: "active",
        joined_at: now,
      });
      m.status = "active";
      m.joined_at = now;
    }
  }
}
