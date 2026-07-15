/**
 * Server-side store singleton (Phase 1–3: MemoryStore on repo seeds).
 *
 * Lives on globalThis so the in-memory state survives Next.js dev HMR reloads
 * within one server process. Server-only: never import from client components.
 * Phase 4 swaps the construction for a SupabaseStore — callers only see the
 * `Store` interface (CLAUDE.md architecture rule 2).
 *
 * On first access the store is seeded with six completed weeks of
 * deterministic demo data for the three SPEC §16.3 orgs, so the dashboard has
 * something to show (SPEC §13 Phase 2). The interactive survey demo org
 * (Musterwerk) starts empty.
 */

import type { Store } from "@/lib/data/store";
import { MemoryStore } from "@/lib/data/memory-store";
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
  __kiBarometerStore?: Promise<Store>;
};

export function getStore(): Promise<Store> {
  globalForStore.__kiBarometerStore ??= buildSeededStore();
  return globalForStore.__kiBarometerStore;
}
