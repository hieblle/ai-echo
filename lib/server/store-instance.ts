/**
 * Server-side store singleton (Phase 1–3: MemoryStore on repo seeds).
 *
 * Lives on globalThis so the in-memory state survives Next.js dev HMR reloads
 * within one server process. Server-only: never import from client components.
 * Phase 4 swaps the construction for a SupabaseStore — callers only see the
 * `Store` interface (CLAUDE.md architecture rule 2).
 */

import type { Store } from "@/lib/data/store";
import { MemoryStore } from "@/lib/data/memory-store";
import {
  DEMO_DEPARTMENTS,
  DEMO_ORG,
  DEMO_PERSONAS,
} from "@/lib/seed/demo-org";
import { QUESTIONS } from "@/lib/seed/questions";

const globalForStore = globalThis as unknown as {
  __kiBarometerStore?: Store;
};

export function getStore(): Store {
  globalForStore.__kiBarometerStore ??= new MemoryStore({
    organizations: [DEMO_ORG],
    departments: DEMO_DEPARTMENTS,
    personas: DEMO_PERSONAS,
    questions: QUESTIONS,
  });
  return globalForStore.__kiBarometerStore;
}
