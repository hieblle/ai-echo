/**
 * What a member sees on their /app home: onboarding state and the open
 * survey cycles they have not completed yet (server-only).
 */

import type { Store } from "@/lib/data/store";
import type {
  Membership,
  Organization,
  RespondentProfile,
  SurveyCycle,
  TemplateKey,
} from "@/lib/types";
import { roleScopeOf } from "./auth";
import { respondentKeyFor } from "./respondent-key";

export interface DueSurvey {
  template: TemplateKey;
  cycle: SurveyCycle;
}

export interface MemberOverview {
  profile: RespondentProfile | null;
  onboardingDone: boolean;
  /** Open cycles for this member, not yet completed — onboarding first. */
  due: DueSurvey[];
  /** Cycles completed in the currently open set (for the "erledigt" state). */
  completed: DueSurvey[];
}

/** Templates a member with this role takes part in (SPEC §8 F3/F4). */
export function templatesFor(membership: Membership): TemplateKey[] {
  return roleScopeOf(membership.role) === "lead"
    ? ["weekly", "monthly", "leadership"]
    : ["weekly", "monthly"];
}

export async function getMemberOverview(
  store: Store,
  org: Organization,
  membership: Membership,
): Promise<MemberOverview> {
  const profile = await store.getProfile(org.id, respondentKeyFor(membership.id));
  const onboardingDone = profile?.onboarding_completed ?? false;

  const openCycles = await store.listCycles(org.id, { status: "open" });
  const mine = await store.listParticipationsByMembership(membership.id);
  const completedCycleIds = new Set(
    mine.filter((p) => p.status === "completed").map((p) => p.cycle_id),
  );
  const templates = new Set(templatesFor(membership));

  const due: DueSurvey[] = [];
  const completed: DueSurvey[] = [];
  for (const cycle of openCycles) {
    if (!templates.has(cycle.template_key)) continue;
    const entry = { template: cycle.template_key, cycle };
    (completedCycleIds.has(cycle.id) ? completed : due).push(entry);
  }
  return { profile, onboardingDone, due, completed };
}
