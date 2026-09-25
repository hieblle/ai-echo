/**
 * Org setup (flow F1) and invitations (flow F2), server-only and
 * store/mailer-agnostic so the rules are unit-testable with the MemoryStore.
 */

import type { Store } from "@/lib/data/store";
import type { Mailer } from "@/lib/mail/mailer";
import type {
  FormOfAddress,
  Membership,
  Organization,
  OrgRole,
} from "@/lib/types";

// --- Org setup ---------------------------------------------------------------

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export interface ToolInput {
  tool_value: string;
  tool_label: string;
  monthly_license_cost_eur: number;
}

export interface CreateOrgInput {
  name: string;
  /** Derived from the name when omitted. */
  slug?: string;
  form_of_address: FormOfAddress;
  hourly_rate_default: number;
  k_anonymity_min: number;
  departments: string[];
  tools: ToolInput[];
}

/** Org + departments + tools in one go (platform_admin, < 10 min, SPEC §8 F1). */
export async function createOrganizationWithSetup(
  store: Store,
  input: CreateOrgInput,
): Promise<Organization> {
  const slug = input.slug?.trim() || slugify(input.name);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`invalid slug "${slug}"`);
  }
  const org = await store.createOrganization({
    name: input.name.trim(),
    slug,
    logo_url: null,
    primary_color: null,
    hourly_rate_default: input.hourly_rate_default,
    locale: "de",
    form_of_address: input.form_of_address,
    k_anonymity_min: Math.max(5, input.k_anonymity_min),
    is_demo: false,
  });
  for (const name of dedupeNames(input.departments)) {
    await store.createDepartment(org.id, name);
  }
  for (const tool of input.tools) {
    await store.upsertToolSetting({
      org_id: org.id,
      tool_value: tool.tool_value,
      tool_label: tool.tool_label,
      monthly_license_cost_eur: Math.max(0, tool.monthly_license_cost_eur),
      active: true,
    });
  }
  return org;
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

// --- Invitations -------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a pasted list (one per line, comma/semicolon separated, or a CSV
 * column): lower-cased, de-duplicated, split into valid and invalid.
 */
export function parseEmailList(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const token of raw.split(/[\s,;]+/)) {
    const email = token.trim().replace(/^["']|["']$/g, "").toLowerCase();
    if (!email) continue;
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      invalid.push(email);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    valid.push(email);
  }
  return { valid, invalid };
}

export interface InviteInput {
  emails: string[];
  role: OrgRole;
  department_id: string | null;
}

export interface InviteResult {
  invited: string[];
  /** Already members of this org — untouched (SPEC §16.2: duplicates). */
  existing: string[];
  failed: { email: string; error: string }[];
}

/** Invite people to an org: auth user + login link + membership per address. */
export async function inviteMembers(
  store: Store,
  mailer: Mailer,
  org: Organization,
  input: InviteInput,
  now: Date,
): Promise<InviteResult> {
  const result: InviteResult = { invited: [], existing: [], failed: [] };
  const members = await store.listMemberships(org.id);
  const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), m]));
  const departments = await store.listDepartments(org.id);
  const departmentId =
    input.department_id && departments.some((d) => d.id === input.department_id)
      ? input.department_id
      : null;

  for (const email of input.emails) {
    const existing = byEmail.get(email);
    if (existing && existing.status !== "removed") {
      result.existing.push(email);
      continue;
    }
    try {
      const { userId } = await mailer.inviteUser({ email, orgName: org.name });
      if (existing) {
        // Removed earlier: re-activate instead of a second membership row.
        await store.updateMembership(existing.id, {
          status: "invited",
          role: input.role,
          department_id: departmentId,
          joined_at: null,
        });
      } else {
        await store.createMembership({
          org_id: org.id,
          user_id: userId,
          email,
          department_id: departmentId,
          role: input.role,
          status: "invited",
          invited_at: now.toISOString(),
          joined_at: null,
        });
      }
      result.invited.push(email);
    } catch (err) {
      result.failed.push({
        email,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}

/** Re-send the login link to an invited (or active) member. */
export async function resendInvitation(
  mailer: Mailer,
  org: Organization,
  membership: Membership,
): Promise<void> {
  await mailer.sendLoginLink({
    email: membership.email,
    orgName: org.name,
    template: "onboarding",
    kind: "invitation",
  });
}
