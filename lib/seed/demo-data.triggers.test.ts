/**
 * End-to-end trigger composite over the generated demo data (SPEC.md §13
 * Phase 2): runs the REAL pipeline — KPI engine (§10) + trigger engine (§11)
 * with the seeded rules — against `generateAllDemoData` and asserts that
 * EXACTLY the intended recommendation story fires per org, nothing more:
 *
 * - Merlin: only R5 (context "copilot365")
 * - SPAR:   only R4 (context "prompt_engineering") and R6 (context "strategy")
 * - REWE:   only R1, R3 and R7 (context "")
 *
 * A second case extends the window by two weeks via `generateOrgWeek`
 * ("Woche simulieren" semantics: base rows stay, new weeks are appended) and
 * asserts the composite is UNCHANGED — the anomalies are keyed by absolute
 * week index, so simulating weeks must neither extinguish REWE's R3 nor let
 * a new R5/R4 creep in anywhere.
 */

import { describe, expect, it } from "vitest";

import type {
  NewSurveyResponse,
  ParticipationStat,
  SurveyResponse,
} from "@/lib/types";
import {
  computeGapPairs,
  computeKpiHistory,
  computeToolUsage,
  computeTrainingWishes,
} from "@/lib/domain/kpi";
import { evaluateTriggers } from "@/lib/domain/triggers";
import { RECOMMENDATION_RULES } from "./rules";
import {
  DEMO_ORGS,
  DEMO_ORG_DEPARTMENTS,
  DEMO_ORG_HEADCOUNTS,
  DEMO_ORG_TOOL_SETTINGS,
  MERLIN_ORG_ID,
  REWE_ORG_ID,
  SPAR_ORG_ID,
} from "./orgs-demo";
import { generateAllDemoData, generateOrgWeek } from "./demo-data";

// Six consecutive ISO weeks — the SPEC.md §16.3 demo window.
const WEEKS = [
  "2026-W23",
  "2026-W24",
  "2026-W25",
  "2026-W26",
  "2026-W27",
  "2026-W28",
];

// The same window after two "Woche simulieren" clicks.
const EXTENDED_WEEKS = [...WEEKS, "2026-W29", "2026-W30"];

/** The intended trigger composite (SPEC.md §13 Phase 2 demo story). */
const EXPECTED_COMPOSITE: Record<string, string[]> = {
  [MERLIN_ORG_ID]: ["R5:copilot365"],
  [SPAR_ORG_ID]: ["R4:prompt_engineering", "R6:strategy"],
  [REWE_ORG_ID]: ["R1:", "R3:", "R7:"],
};

/**
 * Run the real dashboard pipeline for one org and return the fired rules as
 * "key:context" strings (evaluateTriggers orders them deterministically).
 */
function firedRules(
  orgId: string,
  responses: readonly NewSurveyResponse[],
  participation: readonly ParticipationStat[],
  weeks: readonly string[],
): string[] {
  // The store assigns ids in production; the pipeline only needs the shape.
  const orgResponses: SurveyResponse[] = responses
    .filter((row) => row.org_id === orgId)
    .map((row, index) => ({ ...row, id: `row-${index}` }));
  const weekly = computeKpiHistory({
    responses: orgResponses,
    weeks: [...weeks],
    participations: participation.filter((stat) => stat.org_id === orgId),
  });
  const fired = evaluateTriggers(
    {
      weekly,
      gapPairs: computeGapPairs(orgResponses),
      toolUsage: computeToolUsage({ responses: orgResponses, weeks: [...weeks] }),
      toolSettings: DEMO_ORG_TOOL_SETTINGS.filter(
        (setting) => setting.org_id === orgId,
      ),
      trainingWishes: computeTrainingWishes(orgResponses),
    },
    RECOMMENDATION_RULES,
  );
  return fired.map((hit) => `${hit.rule_key}:${hit.context}`);
}

describe("trigger composite on the seed window", () => {
  const data = generateAllDemoData({ weeks: WEEKS });

  it.each(DEMO_ORGS.map((org) => [org.slug, org.id] as const))(
    "%s fires exactly the intended rules",
    (_slug, orgId) => {
      expect(firedRules(orgId, data.responses, data.participation, WEEKS)).toEqual(
        EXPECTED_COMPOSITE[orgId],
      );
    },
  );
});

describe("trigger composite after two simulated weeks", () => {
  // Simulate-week semantics: the base window's rows are kept as-is and the
  // two new weeks are generated against the EXTENDED weeks array.
  const base = generateAllDemoData({ weeks: WEEKS });
  const responses = [...base.responses];
  const participation = [...base.participation];
  for (const org of DEMO_ORGS) {
    for (const weekIndex of [WEEKS.length, WEEKS.length + 1]) {
      const generated = generateOrgWeek({
        org,
        departments: DEMO_ORG_DEPARTMENTS.filter(
          (dept) => dept.org_id === org.id,
        ),
        headcounts: DEMO_ORG_HEADCOUNTS[org.id] ?? {},
        toolSettings: DEMO_ORG_TOOL_SETTINGS.filter(
          (setting) => setting.org_id === org.id,
        ),
        weeks: EXTENDED_WEEKS,
        weekIndex,
      });
      responses.push(...generated.responses);
      participation.push(...generated.participation);
    }
  }

  it.each(DEMO_ORGS.map((org) => [org.slug, org.id] as const))(
    "%s composite is unchanged (REWE keeps R3, no new R5 anywhere)",
    (_slug, orgId) => {
      expect(
        firedRules(orgId, responses, participation, EXTENDED_WEEKS),
      ).toEqual(EXPECTED_COMPOSITE[orgId]);
    },
  );
});
