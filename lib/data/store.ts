/**
 * Data-access interface (CLAUDE.md architecture rule 2 / SPEC.md §5, §13).
 *
 * The UI and the pure domain layer only ever talk to this `Store` interface —
 * never to a concrete backend. This keeps the migration to persistence a
 * drop-in change:
 *
 *   - Phase 1–3: `MemoryStore` — in-memory, seeded from `lib/seed/` (Repo data,
 *     no database, no auth, no secrets).
 *   - Phase 4:   `SupabaseStore` — implements the same interface; UI and domain
 *     stay unchanged.
 *
 * The concrete method surface is intentionally NOT guessed here in Phase 0.
 * It is defined together with the survey runner in Phase 1, once the UI's real
 * read/write needs are known (CLAUDE.md: "beste Annahme treffen, nicht raten").
 * Phase 0 only fixes the shape of the seam and the store discriminator.
 */

import type { Organization, Question, SurveyResponse } from "@/lib/types";

export type StoreMode = "memory" | "supabase";

export interface Store {
  /** Which backend implements this store; `memory` until Phase 4. */
  readonly mode: StoreMode;
}

// Re-exported so Phase 1 store methods can reference the core entities without
// reaching past this seam. Referenced here to keep the imports meaningful until
// the method surface lands.
export type { Organization, Question, SurveyResponse };
