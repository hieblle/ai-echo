/**
 * Data-access interface (CLAUDE.md architecture rule 2 / SPEC.md §5, §13).
 *
 * The UI and the pure domain layer only ever talk to this `Store` interface —
 * never to a concrete backend. This keeps the migration to persistence a
 * drop-in change:
 *
 *   - Phase 1–3: `MemoryStore` (lib/data/memory-store.ts) — in-memory, seeded
 *     from `lib/seed/` (repo data, no database, no auth, no secrets).
 *   - Phase 4:   `SupabaseStore` — implements the same interface; UI and domain
 *     stay unchanged.
 *
 * Anonymity invariant (SPEC.md §7): `submitResponses` accepts rows WITHOUT any
 * respondent key — the store must never be able to join responses back to a
 * person. Profile updates travel separately via `saveProfile`.
 */

import type {
  DemoPersona,
  Department,
  FormOfAddress,
  NewSurveyResponse,
  OrgId,
  Organization,
  Question,
  RespondentProfile,
  SurveyResponse,
  TemplateKey,
} from "@/lib/types";

export type StoreMode = "memory" | "supabase";

export interface Store {
  /** Which backend implements this store; `memory` until Phase 4. */
  readonly mode: StoreMode;

  // --- Organization & catalog ------------------------------------------

  getOrganization(orgId: OrgId): Promise<Organization | null>;
  listDepartments(orgId: OrgId): Promise<Department[]>;
  /** Active questions of a template, ordered by sort_order. */
  listQuestions(templateKey: TemplateKey): Promise<Question[]>;
  /** Demo identities for the prototype's role switcher (Phase 1–3 only). */
  listPersonas(orgId: OrgId): Promise<DemoPersona[]>;
  /** Demo-only toggle for the Du/Sie org setting (SPEC.md §14). */
  setFormOfAddress(orgId: OrgId, form: FormOfAddress): Promise<void>;

  // --- Respondent profile (NEVER joinable with responses) ----------------

  getProfile(
    orgId: OrgId,
    respondentKey: string,
  ): Promise<RespondentProfile | null>;
  saveProfile(profile: RespondentProfile): Promise<void>;

  // --- Responses ----------------------------------------------------------

  /**
   * Persist a completed survey atomically — all rows or none
   * (SPEC.md §9: "Abbruch speichert nichts Halbes").
   */
  submitResponses(responses: NewSurveyResponse[]): Promise<void>;
  /** All stored responses of an org (dev/demo introspection; Phase 2 KPIs). */
  listResponses(orgId: OrgId): Promise<SurveyResponse[]>;
}
