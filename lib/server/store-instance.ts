/**
 * Server-side store singletons.
 *
 * Two stores coexist from Phase 4 (DECISIONS D3.3):
 *
 *   - `getDemoStore()` — the seeded `MemoryStore` behind the demo routes
 *     (/demo, /dashboard, /report). Lives on globalThis so the in-memory
 *     state survives Next.js dev HMR reloads within one server process.
 *     On first access it is seeded with six completed weeks of deterministic
 *     demo data for the three SPEC §16.3 orgs; the interactive survey demo
 *     org (Musterwerk) starts empty.
 *   - `getAppStore()` — the `SupabaseStore` behind the product routes
 *     (/app, /admin, /api/cron). Null while Supabase is not configured, so
 *     callers can render a setup hint instead of crashing.
 *
 * Server-only: never import from client components. Callers only see the
 * `Store` interface (CLAUDE.md architecture rule 2).
 */

import type { Store } from "@/lib/data/store";
import { MemoryStore } from "@/lib/data/memory-store";
import { SupabaseStore } from "@/lib/data/supabase-store";
import { getIsoWeek, previousIsoWeek } from "@/lib/domain/isoWeek";
import {
  DEMO_DEPARTMENTS,
  DEMO_ORG,
  DEMO_PERSONAS,
} from "@/lib/seed/demo-org";
import { generateAllDemoData } from "@/lib/seed/demo-data";
import {
  DEMO_ORG_DEPARTMENTS,
  DEMO_ORG_TOOL_SETTINGS,
  DEMO_ORGS,
} from "@/lib/seed/orgs-demo";
import { QUESTIONS } from "@/lib/seed/questions";
import { RECOMMENDATION_RULES } from "@/lib/seed/rules";
import { getSupabaseEnv } from "./env";

const DEMO_WEEK_COUNT = 6;

/** The last `count` COMPLETED ISO weeks (excluding the current one). */
export function lastCompletedWeeks(now: Date, count: number): string[] {
  const weeks: string[] = [];
  let week = previousIsoWeek(getIsoWeek(now));
  for (let i = 0; i < count; i++) {
    weeks.unshift(week);
    week = previousIsoWeek(week);
  }
  return weeks;
}

async function buildSeededStore(): Promise<Store> {
  const store = new MemoryStore({
    organizations: [DEMO_ORG, ...DEMO_ORGS],
    departments: [...DEMO_DEPARTMENTS, ...DEMO_ORG_DEPARTMENTS],
    personas: DEMO_PERSONAS,
    questions: QUESTIONS,
    toolSettings: DEMO_ORG_TOOL_SETTINGS,
    rules: RECOMMENDATION_RULES,
  });

  const weeks = lastCompletedWeeks(new Date(), DEMO_WEEK_COUNT);
  const { responses, participation } = generateAllDemoData({ weeks });
  await store.submitResponses(responses);
  await store.addParticipationStats(participation);
  return store;
}

const globalForStore = globalThis as unknown as {
  __kiBarometerDemoStore?: Promise<Store>;
  __kiBarometerAppStore?: Store;
};

export function getDemoStore(): Promise<Store> {
  // A failed seed attempt must not be memoized forever (permanent 500s) —
  // clear the slot on rejection so the next request retries.
  globalForStore.__kiBarometerDemoStore ??= buildSeededStore().catch((err) => {
    globalForStore.__kiBarometerDemoStore = undefined;
    throw err;
  });
  return globalForStore.__kiBarometerDemoStore;
}

/** The product store, or null while Supabase is not configured. */
export function getAppStore(): Store | null {
  if (globalForStore.__kiBarometerAppStore) {
    return globalForStore.__kiBarometerAppStore;
  }
  const env = getSupabaseEnv();
  if (!env) return null;
  globalForStore.__kiBarometerAppStore = new SupabaseStore({
    url: env.url,
    serviceRoleKey: env.serviceRoleKey,
    questions: QUESTIONS,
    rules: RECOMMENDATION_RULES,
  });
  return globalForStore.__kiBarometerAppStore;
}

/** Like `getAppStore`, but throws a clear error for code paths that need it. */
export function requireAppStore(): Store {
  const store = getAppStore();
  if (!store) {
    throw new Error(
      "Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  return store;
}
