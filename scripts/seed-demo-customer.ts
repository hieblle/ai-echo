#!/usr/bin/env tsx
/**
 * Seeds the showcase customer "Moorbach Antriebstechnik GmbH" into the REAL
 * product database (Supabase) so the platform can be demonstrated with
 * login, admin pages and a filled dashboard.
 *
 *   pnpm seed:demo            create it (refuses when it already exists)
 *   pnpm seed:demo --reset    delete and recreate from scratch
 *   pnpm seed:demo --weeks 8  history length (default 6 completed weeks)
 *   pnpm seed:demo --admin you@dbrains.academy   org admin (default: first
 *                             PLATFORM_ADMIN_EMAILS entry)
 *
 * What it creates: the org (is_demo = true → the scheduler never mails it),
 * departments, tools, 47 placeholder members with auth users at
 * @moorbach-demo.example (a reserved, undeliverable domain), 6 closed weeks
 * of generated responses + participation (Merlin profile: healthy org, one
 * department below k, one paid but unused tool → R5), and an OPEN weekly
 * cycle for the current week so a live pulse can be shown.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (and the org admin's
 * address). Uses only the HTTPS API — no direct database connection.
 */

import { SupabaseStore } from "@/lib/data/supabase-store";
import { getIsoWeek } from "@/lib/domain/isoWeek";
import { generateOrgWeek } from "@/lib/seed/demo-data";
import { MERLIN_ORG_ID } from "@/lib/seed/orgs-demo";
import { QUESTIONS, TOOL_CATALOG } from "@/lib/seed/questions";
import { RECOMMENDATION_RULES } from "@/lib/seed/rules";
import { mondayOfIsoWeek } from "@/lib/server/dashboard-service";
import { getPlatformAdminEmails, getSupabaseEnv } from "@/lib/server/env";
import { lastCompletedWeeks } from "@/lib/server/store-instance";
import type { Membership, NewParticipation, OrgRole } from "@/lib/types";

const SLUG = "moorbach";
const NAME = "Moorbach Antriebstechnik GmbH";
const DOMAIN = "moorbach-demo.example";

/** Mirrors the Merlin §16.3 profile (47 office staff, Marketing < k). */
const DEPARTMENTS: [name: string, headcount: number][] = [
  ["Vertrieb & Export", 12],
  ["Konstruktion & Entwicklung", 14],
  ["Verwaltung & Finanzen", 8],
  ["Marketing", 4],
  ["Service-Innendienst", 9],
];

const TOOLS: [value: string, monthlyCostEur: number][] = [
  ["copilot365", 1440],
  ["chatgpt", 800],
  ["deepl_write", 350],
];

const FIRST_NAMES = [
  "Anna", "Bernhard", "Claudia", "David", "Elisabeth", "Florian", "Gerda",
  "Hannes", "Ingrid", "Jakob", "Katharina", "Lukas", "Maria", "Nikolaus",
  "Olivia", "Paul", "Regina", "Stefan", "Theresa", "Ulrich", "Verena",
  "Wolfgang", "Sophie", "Tobias",
];
const LAST_NAMES = [
  "Huber", "Gruber", "Bauer", "Wagner", "Müller", "Pichler", "Steiner",
  "Moser", "Mayer", "Hofer", "Leitner", "Berger", "Fuchs", "Eder",
  "Fischer", "Schmid", "Winkler", "Weber", "Schwarz", "Maier",
];

function parseArgs(argv: string[]) {
  const args = { reset: false, weeks: 6, admin: null as string | null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--reset") args.reset = true;
    else if (a === "--weeks") args.weeks = Math.max(4, Number(argv[++i] ?? 6));
    else if (a === "--admin") args.admin = (argv[++i] ?? "").toLowerCase();
  }
  return args;
}

function slugName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z]/g, "");
}

/** Small deterministic PRNG so reruns produce the same member set. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = getSupabaseEnv();
  if (!env) {
    console.error("Supabase is not configured — see .env.example");
    process.exit(1);
  }
  const adminEmail = args.admin ?? getPlatformAdminEmails()[0] ?? null;
  if (!adminEmail) {
    console.error("No org admin: pass --admin <email> or set PLATFORM_ADMIN_EMAILS");
    process.exit(1);
  }

  const store = new SupabaseStore({
    url: env.url,
    secretKey: env.secretKey,
    questions: QUESTIONS,
    rules: RECOMMENDATION_RULES,
  });
  const auth = store.client.auth.admin;

  // --- Reset ------------------------------------------------------------------
  const existing = await store.getOrganizationBySlug(SLUG);
  if (existing && !args.reset) {
    console.log(`"${NAME}" already exists (/${SLUG}). Use --reset to recreate it.`);
    return;
  }
  if (existing) {
    console.log("Removing existing showcase org and its placeholder users …");
    const { error } = await store.client.from("organizations").delete().eq("id", existing.id);
    if (error) throw new Error(`delete org: ${error.message}`);
    let page = 1;
    for (;;) {
      const { data, error: listError } = await auth.listUsers({ page, perPage: 200 });
      if (listError) throw new Error(`listUsers: ${listError.message}`);
      const placeholders = data.users.filter((u) => u.email?.endsWith(`@${DOMAIN}`));
      for (const u of placeholders) await auth.deleteUser(u.id);
      if (data.users.length < 200) break;
      page += 1;
    }
  }

  // --- Org, departments, tools -------------------------------------------------
  const org = await store.createOrganization({
    name: NAME,
    slug: SLUG,
    logo_url: null,
    primary_color: null,
    hourly_rate_default: 65,
    locale: "de",
    form_of_address: "sie",
    k_anonymity_min: 5,
    is_demo: true,
  });
  const departments = [];
  const headcounts: Record<string, number> = {};
  for (const [name, headcount] of DEPARTMENTS) {
    const dept = await store.createDepartment(org.id, name);
    departments.push(dept);
    headcounts[dept.id] = headcount;
  }
  for (const [value, cost] of TOOLS) {
    const label = TOOL_CATALOG.find((c) => c.value === value)?.label ?? value;
    await store.upsertToolSetting({
      org_id: org.id,
      tool_value: value,
      tool_label: label,
      monthly_license_cost_eur: cost,
      active: true,
    });
  }
  const toolSettings = await store.listToolSettings(org.id);
  console.log(`Created ${NAME} with ${departments.length} departments and ${toolSettings.length} tools.`);

  // --- Placeholder members ---------------------------------------------------------
  const random = rng("moorbach-members");
  const used = new Set<string>();
  const members: Membership[] = [];
  const now = new Date();
  const joined = new Date(now.getTime() - 8 * 7 * 86_400_000).toISOString();
  for (const dept of departments) {
    for (let i = 0; i < (headcounts[dept.id] ?? 0); i++) {
      let email = "";
      do {
        const first = FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)]!;
        const last = LAST_NAMES[Math.floor(random() * LAST_NAMES.length)]!;
        email = `${slugName(first)}.${slugName(last)}@${DOMAIN}`;
      } while (used.has(email));
      used.add(email);
      const role: OrgRole = i === 0 ? "team_lead" : "employee";
      const created = await auth.createUser({
        email,
        email_confirm: true,
        user_metadata: { showcase: SLUG },
      });
      if (created.error || !created.data.user) {
        throw new Error(`createUser ${email}: ${created.error?.message}`);
      }
      members.push(
        await store.createMembership({
          org_id: org.id,
          user_id: created.data.user.id,
          email,
          department_id: dept.id,
          role,
          status: "active",
          invited_at: joined,
          joined_at: joined,
        }),
      );
    }
  }
  console.log(`Created ${members.length} placeholder members.`);

  // --- The real org admin -----------------------------------------------------------
  let adminUserId: string | null = null;
  const adminCreate = await auth.createUser({ email: adminEmail, email_confirm: true });
  if (adminCreate.data.user) {
    adminUserId = adminCreate.data.user.id;
  } else {
    const link = await auth.generateLink({ type: "magiclink", email: adminEmail });
    adminUserId = link.data.user?.id ?? null;
  }
  if (!adminUserId) throw new Error(`could not resolve auth user for ${adminEmail}`);
  const adminMembership = await store.createMembership({
    org_id: org.id,
    user_id: adminUserId,
    email: adminEmail,
    department_id: departments[0]?.id ?? null,
    role: "org_admin",
    status: "active",
    invited_at: joined,
    joined_at: joined,
  });
  console.log(`${adminEmail} is org_admin of /${SLUG}.`);

  // --- History: generated responses + cycles + participations ------------------------
  const weeks = lastCompletedWeeks(now, args.weeks);
  const leads = members.filter((m) => m.role !== "employee");
  const pick = rng("moorbach-participation");
  let responseCount = 0;
  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
    const generated = generateOrgWeek({
      org,
      departments,
      headcounts,
      toolSettings,
      weeks,
      weekIndex,
      profileId: MERLIN_ORG_ID,
    });
    await store.submitResponses(generated.responses);
    responseCount += generated.responses.length;

    for (const stat of generated.participation) {
      if (stat.template_key === "onboarding") continue;
      const monday = mondayOfIsoWeek(stat.week);
      const cycle = await store.ensureCycle({
        org_id: org.id,
        template_key: stat.template_key,
        week: stat.week,
        period_start: isoDate(monday),
        period_end: isoDate(new Date(monday.getTime() + 6 * 86_400_000)),
        status: "closed",
        reminder_sent_at: new Date(monday.getTime() + 3 * 86_400_000 + 10 * 3_600_000).toISOString(),
      });
      const pool = stat.template_key === "leadership" ? leads : members;
      const shuffled = [...pool].sort(() => pick() - 0.5);
      const completed = new Set(shuffled.slice(0, Math.min(stat.completed, pool.length)).map((m) => m.id));
      const rows: NewParticipation[] = [...pool, adminMembership].map((m) => {
        const done = completed.has(m.id);
        const hour = 8 + Math.floor(pick() * 9);
        const day = Math.floor(pick() * 4);
        return {
          cycle_id: cycle.id,
          membership_id: m.id,
          status: done ? "completed" : "invited",
          completed_at: done
            ? new Date(monday.getTime() + day * 86_400_000 + hour * 3_600_000).toISOString()
            : null,
        };
      });
      await store.addParticipations(rows);
    }
  }
  console.log(`Generated ${responseCount} anonymous responses over ${weeks.length} weeks (${weeks[0]} – ${weeks[weeks.length - 1]}).`);

  // --- An open pulse for the current week (live demo) ---------------------------------
  const currentWeek = getIsoWeek(now);
  const monday = mondayOfIsoWeek(currentWeek);
  const open = await store.ensureCycle({
    org_id: org.id,
    template_key: "weekly",
    week: currentWeek,
    period_start: isoDate(monday),
    period_end: isoDate(new Date(monday.getTime() + 6 * 86_400_000)),
    status: "open",
    reminder_sent_at: null,
  });
  await store.addParticipations(
    [...members, adminMembership].map((m) => ({
      cycle_id: open.id,
      membership_id: m.id,
      status: "invited",
      completed_at: null,
    })),
  );
  console.log(`Open weekly pulse for ${currentWeek} (no mails: showcase org).`);
  console.log(`\nDashboard:   /app/${SLUG}/dashboard\nVerwaltung:  /app/${SLUG}/admin\nBefragungen: /app`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
