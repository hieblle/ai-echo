import { describe, expect, it } from "vitest";

import { MemoryStore, type MemoryStoreSeed } from "@/lib/data/memory-store";
import {
  DEMO_DEPARTMENTS,
  DEMO_ORG,
  DEMO_ORG_ID,
  DEMO_PERSONAS,
} from "@/lib/seed/demo-org";
import type {
  DemoPersona,
  Department,
  NewSurveyResponse,
  Organization,
  OrgToolSetting,
  ParticipationStat,
  Question,
  RecommendationRule,
  RecommendationState,
  RespondentProfile,
} from "@/lib/types";

// --- Fixtures ---------------------------------------------------------------
// Small inline fixtures — deliberately NOT lib/seed/questions or other seed
// modules, which are built concurrently by other modules.

function makeQuestion(overrides: Partial<Question> & { id: string }): Question {
  return {
    template_key: "weekly",
    code: overrides.id.toUpperCase(),
    dimension: "adoption",
    type: "scale_1_10",
    text: "Testfrage",
    text_sie: null,
    options: null,
    condition: null,
    is_gap_pair_with: null,
    sort_order: 0,
    active: true,
    ...overrides,
  };
}

const FIXTURE_QUESTIONS: Question[] = [
  // Deliberately out of order to exercise sorting.
  makeQuestion({ id: "q-w2", template_key: "weekly", sort_order: 2 }),
  makeQuestion({ id: "q-w1", template_key: "weekly", sort_order: 1 }),
  makeQuestion({ id: "q-w3-inactive", template_key: "weekly", sort_order: 3, active: false }),
  makeQuestion({ id: "q-o1", template_key: "onboarding", sort_order: 1 }),
];

const OTHER_ORG: Organization = {
  ...DEMO_ORG,
  id: "org-other",
  name: "Andere GmbH",
  slug: "andere",
};

const OTHER_DEPARTMENT: Department = {
  id: "other-org-it",
  org_id: OTHER_ORG.id,
  name: "IT",
};

const OTHER_PERSONA: DemoPersona = {
  id: "p-other",
  org_id: OTHER_ORG.id,
  label: "Mitarbeiter",
  role: "employee",
  role_scope: "employee",
  department_id: OTHER_DEPARTMENT.id,
  default_tools: [],
};

function makeToolSetting(
  overrides: Partial<OrgToolSetting> & { id: string },
): OrgToolSetting {
  return {
    org_id: DEMO_ORG_ID,
    tool_value: "chatgpt",
    tool_label: "ChatGPT",
    monthly_license_cost_eur: 20,
    active: true,
    ...overrides,
  };
}

const FIXTURE_TOOL_SETTINGS: OrgToolSetting[] = [
  makeToolSetting({ id: "ts-demo-chatgpt" }),
  // Inactive on purpose: listToolSettings must NOT filter — callers do.
  makeToolSetting({
    id: "ts-demo-copilot",
    tool_value: "copilot365",
    tool_label: "Microsoft 365 Copilot",
    monthly_license_cost_eur: 28.1,
    active: false,
  }),
  makeToolSetting({ id: "ts-other-chatgpt", org_id: OTHER_ORG.id }),
];

function makeRule(
  overrides: Partial<RecommendationRule> & { key: string },
): RecommendationRule {
  return {
    title: "Testregel",
    description: "Beschreibung",
    action_type: "course",
    course_url: null,
    active: true,
    ...overrides,
  };
}

const FIXTURE_RULES: RecommendationRule[] = [
  // Deliberately out of order + one inactive to exercise filter and sort.
  makeRule({ key: "R3" }),
  makeRule({ key: "R1" }),
  makeRule({ key: "R2", active: false }),
];

function makeSeed(): MemoryStoreSeed {
  return {
    organizations: [DEMO_ORG, OTHER_ORG],
    departments: [...DEMO_DEPARTMENTS, OTHER_DEPARTMENT],
    personas: [...DEMO_PERSONAS, OTHER_PERSONA],
    questions: FIXTURE_QUESTIONS,
    toolSettings: structuredClone(FIXTURE_TOOL_SETTINGS),
    rules: structuredClone(FIXTURE_RULES),
  };
}

function makeStore(): MemoryStore {
  return new MemoryStore(makeSeed());
}

function makeResponse(
  overrides: Partial<NewSurveyResponse> = {},
): NewSurveyResponse {
  return {
    org_id: DEMO_ORG_ID,
    cycle_id: "cycle-1",
    department_id: "marketing",
    role_scope: "employee",
    question_code: "W1.1",
    answer: { kind: "scale", value: 7 },
    created_week: "2026-W29",
    ...overrides,
  };
}

function makeProfile(
  overrides: Partial<RespondentProfile> = {},
): RespondentProfile {
  return {
    respondent_key: "p-emp-marketing",
    org_id: DEMO_ORG_ID,
    department_id: "marketing",
    role_scope: "employee",
    tools_used: ["chatgpt"],
    uses_no_tools: false,
    ai_experience: null,
    question_history: null,
    onboarding_completed: true,
    completed_cycles: [],
    ...overrides,
  };
}

function makeStat(
  overrides: Partial<ParticipationStat> = {},
): ParticipationStat {
  return {
    org_id: DEMO_ORG_ID,
    cycle_id: "weekly-2026-W29",
    template_key: "weekly",
    week: "2026-W29",
    invited: 40,
    completed: 25,
    ...overrides,
  };
}

function makeRecState(
  overrides: Partial<RecommendationState> = {},
): RecommendationState {
  return {
    org_id: DEMO_ORG_ID,
    rule_key: "R1",
    context: "",
    status: "done",
    ...overrides,
  };
}

// --- Tests --------------------------------------------------------------------

describe("MemoryStore", () => {
  it("exposes mode 'memory'", () => {
    expect(makeStore().mode).toBe("memory");
  });

  describe("submitResponses", () => {
    it("stores nothing when one row of a batch is invalid (atomicity)", async () => {
      const store = makeStore();
      expect(await store.listResponses(DEMO_ORG_ID)).toEqual([]);

      const batch = [
        makeResponse(),
        makeResponse({ created_week: "not-a-week" }),
        makeResponse(),
      ];
      await expect(store.submitResponses(batch)).rejects.toThrow(
        /created_week/,
      );

      expect(await store.listResponses(DEMO_ORG_ID)).toEqual([]);
    });

    it("throws on an empty submission", async () => {
      await expect(makeStore().submitResponses([])).rejects.toThrow(/empty/);
    });

    it("throws on an unknown org_id and stores nothing", async () => {
      const store = makeStore();
      await expect(
        store.submitResponses([makeResponse({ org_id: "org-nope" })]),
      ).rejects.toThrow(/org_id/);
      expect(await store.listResponses("org-nope")).toEqual([]);
    });

    it("throws on an empty question_code", async () => {
      await expect(
        makeStore().submitResponses([makeResponse({ question_code: "" })]),
      ).rejects.toThrow(/question_code/);
    });

    it.each(["2026-29", "26-W29", "2026-W2", "2026-W299", " 2026-W29"])(
      "throws on malformed created_week %j",
      async (createdWeek) => {
        await expect(
          makeStore().submitResponses([
            makeResponse({ created_week: createdWeek }),
          ]),
        ).rejects.toThrow(/created_week/);
      },
    );

    it("assigns unique sequential ids and stores exactly the given fields", async () => {
      const store = makeStore();
      const first = makeResponse({ question_code: "W1.1" });
      const second = makeResponse({
        question_code: "W2.1",
        answer: { kind: "choice", value: "daily" },
      });

      await store.submitResponses([first, second]);
      await store.submitResponses([makeResponse({ question_code: "W3.1" })]);

      const stored = await store.listResponses(DEMO_ORG_ID);
      expect(stored.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
      expect(stored[0]).toEqual({ ...first, id: "r1" });
      expect(stored[1]).toEqual({ ...second, id: "r2" });
    });
  });

  describe("listResponses", () => {
    it("returns only the requested org's rows", async () => {
      const store = makeStore();
      await store.submitResponses([
        makeResponse(),
        makeResponse({
          org_id: OTHER_ORG.id,
          department_id: OTHER_DEPARTMENT.id,
        }),
      ]);

      const demoRows = await store.listResponses(DEMO_ORG_ID);
      const otherRows = await store.listResponses(OTHER_ORG.id);
      expect(demoRows.map((r) => r.org_id)).toEqual([DEMO_ORG_ID]);
      expect(otherRows.map((r) => r.org_id)).toEqual([OTHER_ORG.id]);
    });

    it("returns copies — mutating the result does not affect the store", async () => {
      const store = makeStore();
      await store.submitResponses([makeResponse()]);

      const rows = await store.listResponses(DEMO_ORG_ID);
      rows[0]!.question_code = "HACKED";
      rows[0]!.answer = { kind: "text", value: "hacked" };
      rows.push(makeResponse() as never);

      const fresh = await store.listResponses(DEMO_ORG_ID);
      expect(fresh).toHaveLength(1);
      expect(fresh[0]!.question_code).toBe("W1.1");
      expect(fresh[0]!.answer).toEqual({ kind: "scale", value: 7 });
    });
  });

  describe("profiles", () => {
    it("returns null for an unknown respondent", async () => {
      expect(await makeStore().getProfile(DEMO_ORG_ID, "nobody")).toBeNull();
    });

    it("round-trips a profile and upserts on repeated save", async () => {
      const store = makeStore();
      const profile = makeProfile();

      await store.saveProfile(profile);
      expect(await store.getProfile(DEMO_ORG_ID, profile.respondent_key)).toEqual(
        profile,
      );

      const updated = makeProfile({
        tools_used: ["chatgpt", "deepl_write"],
        onboarding_completed: true,
        question_history: { week: "2026-W29", codes: ["W1.1", "W2.1"] },
      });
      await store.saveProfile(updated);
      expect(await store.getProfile(DEMO_ORG_ID, profile.respondent_key)).toEqual(
        updated,
      );
    });

    it("stores and returns copies — callers cannot alias internal state", async () => {
      const store = makeStore();
      const profile = makeProfile();
      await store.saveProfile(profile);

      // Mutating the saved object after the fact must not leak in.
      profile.tools_used.push("hacked");
      profile.onboarding_completed = false;

      const loaded = await store.getProfile(DEMO_ORG_ID, "p-emp-marketing");
      expect(loaded!.tools_used).toEqual(["chatgpt"]);
      expect(loaded!.onboarding_completed).toBe(true);

      // Mutating a loaded copy must not leak in either.
      loaded!.tools_used.push("hacked-too");
      const reloaded = await store.getProfile(DEMO_ORG_ID, "p-emp-marketing");
      expect(reloaded!.tools_used).toEqual(["chatgpt"]);
    });

    it("keys profiles by org_id AND respondent_key", async () => {
      const store = makeStore();
      await store.saveProfile(makeProfile());
      expect(
        await store.getProfile(OTHER_ORG.id, "p-emp-marketing"),
      ).toBeNull();
    });
  });

  describe("listQuestions", () => {
    it("returns only active questions of the template, sorted by sort_order", async () => {
      const store = makeStore();
      const weekly = await store.listQuestions("weekly");
      expect(weekly.map((q) => q.id)).toEqual(["q-w1", "q-w2"]);

      const onboarding = await store.listQuestions("onboarding");
      expect(onboarding.map((q) => q.id)).toEqual(["q-o1"]);

      expect(await store.listQuestions("monthly")).toEqual([]);
    });

    it("returns copies — mutating a question does not affect the store", async () => {
      const store = makeStore();
      const [first] = await store.listQuestions("weekly");
      first!.text = "HACKED";

      const [fresh] = await store.listQuestions("weekly");
      expect(fresh!.text).toBe("Testfrage");
    });
  });

  describe("org-scoped catalog", () => {
    it("getOrganization returns the org, and null for unknown ids", async () => {
      const store = makeStore();
      expect((await store.getOrganization(DEMO_ORG_ID))?.name).toBe(
        "Musterwerk GmbH",
      );
      expect(await store.getOrganization("org-nope")).toBeNull();
    });

    it("listDepartments is org-scoped", async () => {
      const store = makeStore();
      const demo = await store.listDepartments(DEMO_ORG_ID);
      expect(demo).toHaveLength(DEMO_DEPARTMENTS.length);
      expect(demo.every((d) => d.org_id === DEMO_ORG_ID)).toBe(true);

      expect(await store.listDepartments(OTHER_ORG.id)).toEqual([
        OTHER_DEPARTMENT,
      ]);
      expect(await store.listDepartments("org-nope")).toEqual([]);
    });

    it("listPersonas is org-scoped", async () => {
      const store = makeStore();
      const demo = await store.listPersonas(DEMO_ORG_ID);
      expect(demo.map((p) => p.id)).toEqual(DEMO_PERSONAS.map((p) => p.id));

      expect(await store.listPersonas(OTHER_ORG.id)).toEqual([OTHER_PERSONA]);
      expect(await store.listPersonas("org-nope")).toEqual([]);
    });
  });

  describe("getOrganizationBySlug", () => {
    it("returns the matching org", async () => {
      const store = makeStore();
      expect((await store.getOrganizationBySlug("musterwerk"))?.id).toBe(
        DEMO_ORG_ID,
      );
      expect((await store.getOrganizationBySlug("andere"))?.id).toBe(
        OTHER_ORG.id,
      );
    });

    it("returns null for an unknown slug", async () => {
      expect(await makeStore().getOrganizationBySlug("nope")).toBeNull();
    });

    it("returns a copy — mutating the result does not affect the store", async () => {
      const store = makeStore();
      const org = await store.getOrganizationBySlug("musterwerk");
      org!.name = "HACKED";

      expect((await store.getOrganizationBySlug("musterwerk"))?.name).toBe(
        "Musterwerk GmbH",
      );
    });
  });

  describe("listOrganizations", () => {
    it("returns all orgs sorted by name ascending", async () => {
      const orgs = await makeStore().listOrganizations();
      expect(orgs.map((o) => o.name)).toEqual([
        "Andere GmbH",
        "Musterwerk GmbH",
      ]);
    });

    it("returns copies — mutating the result does not affect the store", async () => {
      const store = makeStore();
      const orgs = await store.listOrganizations();
      orgs[0]!.name = "HACKED";
      orgs.length = 0;

      const fresh = await store.listOrganizations();
      expect(fresh).toHaveLength(2);
      expect(fresh[0]!.name).toBe("Andere GmbH");
    });
  });

  describe("listToolSettings", () => {
    it("is org-scoped and includes inactive settings (callers filter)", async () => {
      const store = makeStore();
      const demo = await store.listToolSettings(DEMO_ORG_ID);
      expect(demo.map((t) => t.id)).toEqual([
        "ts-demo-chatgpt",
        "ts-demo-copilot",
      ]);
      expect(demo.map((t) => t.active)).toEqual([true, false]);

      const other = await store.listToolSettings(OTHER_ORG.id);
      expect(other.map((t) => t.id)).toEqual(["ts-other-chatgpt"]);

      expect(await store.listToolSettings("org-nope")).toEqual([]);
    });

    it("returns copies — mutating the result does not affect the store", async () => {
      const store = makeStore();
      const [first] = await store.listToolSettings(DEMO_ORG_ID);
      first!.monthly_license_cost_eur = 9999;

      const [fresh] = await store.listToolSettings(DEMO_ORG_ID);
      expect(fresh!.monthly_license_cost_eur).toBe(20);
    });
  });

  describe("participation stats", () => {
    it("appends and lists org-scoped", async () => {
      const store = makeStore();
      expect(await store.listParticipationStats(DEMO_ORG_ID)).toEqual([]);

      const demoStat = makeStat();
      const otherStat = makeStat({
        org_id: OTHER_ORG.id,
        cycle_id: "weekly-2026-W30",
        week: "2026-W30",
      });
      await store.addParticipationStats([demoStat, otherStat]);

      expect(await store.listParticipationStats(DEMO_ORG_ID)).toEqual([
        demoStat,
      ]);
      expect(await store.listParticipationStats(OTHER_ORG.id)).toEqual([
        otherStat,
      ]);
      expect(await store.listParticipationStats("org-nope")).toEqual([]);
    });

    it("throws on an empty batch", async () => {
      await expect(makeStore().addParticipationStats([])).rejects.toThrow(
        /empty/,
      );
    });

    it("stores nothing when one entry of a batch is invalid (atomicity)", async () => {
      const store = makeStore();
      const batch = [
        makeStat(),
        makeStat({ week: "not-a-week" }),
        makeStat({ cycle_id: "weekly-2026-W31", week: "2026-W31" }),
      ];
      await expect(store.addParticipationStats(batch)).rejects.toThrow(/week/);

      expect(await store.listParticipationStats(DEMO_ORG_ID)).toEqual([]);
    });

    it("rejects completed > invited", async () => {
      const store = makeStore();
      await expect(
        store.addParticipationStats([makeStat({ invited: 10, completed: 11 })]),
      ).rejects.toThrow(/exceeds invited/);
      expect(await store.listParticipationStats(DEMO_ORG_ID)).toEqual([]);
    });

    it("rejects negative invited and completed", async () => {
      await expect(
        makeStore().addParticipationStats([makeStat({ invited: -1 })]),
      ).rejects.toThrow(/invited/);
      await expect(
        makeStore().addParticipationStats([
          makeStat({ completed: -1, invited: 5 }),
        ]),
      ).rejects.toThrow(/completed/);
    });

    it.each(["2026-29", "26-W29", "2026-W2", " 2026-W29"])(
      "rejects malformed week %j",
      async (week) => {
        await expect(
          makeStore().addParticipationStats([makeStat({ week })]),
        ).rejects.toThrow(/week/);
      },
    );

    it("rejects an unknown org_id", async () => {
      await expect(
        makeStore().addParticipationStats([makeStat({ org_id: "org-nope" })]),
      ).rejects.toThrow(/org_id/);
    });

    it("rejects an empty cycle_id", async () => {
      await expect(
        makeStore().addParticipationStats([makeStat({ cycle_id: "" })]),
      ).rejects.toThrow(/cycle_id/);
    });

    it("stores and returns copies — callers cannot alias internal state", async () => {
      const store = makeStore();
      const stat = makeStat();
      await store.addParticipationStats([stat]);

      // Mutating the input after the fact must not leak in.
      stat.completed = 0;

      const listed = await store.listParticipationStats(DEMO_ORG_ID);
      expect(listed[0]!.completed).toBe(25);

      // Mutating a listed copy must not leak in either.
      listed[0]!.invited = 0;
      const fresh = await store.listParticipationStats(DEMO_ORG_ID);
      expect(fresh[0]!.invited).toBe(40);
    });
  });

  describe("listRules", () => {
    it("returns only active rules, sorted by key ascending", async () => {
      const rules = await makeStore().listRules();
      expect(rules.map((r) => r.key)).toEqual(["R1", "R3"]);
    });

    it("returns copies — mutating the result does not affect the store", async () => {
      const store = makeStore();
      const [first] = await store.listRules();
      first!.title = "HACKED";

      const [fresh] = await store.listRules();
      expect(fresh!.title).toBe("Testregel");
    });
  });

  describe("recommendation states", () => {
    it("starts empty and round-trips a state", async () => {
      const store = makeStore();
      expect(await store.listRecommendationStates(DEMO_ORG_ID)).toEqual([]);

      const state = makeRecState();
      await store.setRecommendationState(state);
      expect(await store.listRecommendationStates(DEMO_ORG_ID)).toEqual([
        state,
      ]);
    });

    it("upserts — same (org, rule_key, context) overwrites the status", async () => {
      const store = makeStore();
      await store.setRecommendationState(makeRecState({ status: "done" }));
      await store.setRecommendationState(makeRecState({ status: "dismissed" }));

      const states = await store.listRecommendationStates(DEMO_ORG_ID);
      expect(states).toHaveLength(1);
      expect(states[0]!.status).toBe("dismissed");
    });

    it("keeps states with different contexts side by side", async () => {
      const store = makeStore();
      await store.setRecommendationState(
        makeRecState({ rule_key: "R4", context: "chatgpt", status: "done" }),
      );
      await store.setRecommendationState(
        makeRecState({ rule_key: "R4", context: "copilot365", status: "dismissed" }),
      );
      // Empty context is a valid, distinct key of its own.
      await store.setRecommendationState(
        makeRecState({ rule_key: "R4", context: "", status: "open" }),
      );

      const states = await store.listRecommendationStates(DEMO_ORG_ID);
      expect(states).toHaveLength(3);
      expect(
        states.map((s) => [s.context, s.status]).sort(),
      ).toEqual([
        ["", "open"],
        ["chatgpt", "done"],
        ["copilot365", "dismissed"],
      ]);
    });

    it("is org-scoped", async () => {
      const store = makeStore();
      await store.setRecommendationState(makeRecState());
      await store.setRecommendationState(
        makeRecState({ org_id: OTHER_ORG.id, status: "dismissed" }),
      );

      const demo = await store.listRecommendationStates(DEMO_ORG_ID);
      const other = await store.listRecommendationStates(OTHER_ORG.id);
      expect(demo.map((s) => s.org_id)).toEqual([DEMO_ORG_ID]);
      expect(other.map((s) => s.org_id)).toEqual([OTHER_ORG.id]);
      expect(await store.listRecommendationStates("org-nope")).toEqual([]);
    });

    it("throws on an unknown org_id", async () => {
      await expect(
        makeStore().setRecommendationState(makeRecState({ org_id: "org-nope" })),
      ).rejects.toThrow(/org_id/);
    });

    it("throws on an empty rule_key", async () => {
      await expect(
        makeStore().setRecommendationState(makeRecState({ rule_key: "" })),
      ).rejects.toThrow(/rule_key/);
    });

    it("stores and returns copies — callers cannot alias internal state", async () => {
      const store = makeStore();
      const state = makeRecState();
      await store.setRecommendationState(state);

      state.status = "open";
      const listed = await store.listRecommendationStates(DEMO_ORG_ID);
      expect(listed[0]!.status).toBe("done");

      listed[0]!.status = "open";
      const fresh = await store.listRecommendationStates(DEMO_ORG_ID);
      expect(fresh[0]!.status).toBe("done");
    });
  });

  describe("setFormOfAddress", () => {
    it("updates the org's form_of_address", async () => {
      const store = makeStore();
      await store.setFormOfAddress(DEMO_ORG_ID, "sie");
      expect((await store.getOrganization(DEMO_ORG_ID))?.form_of_address).toBe(
        "sie",
      );
      // Other orgs stay untouched.
      expect((await store.getOrganization(OTHER_ORG.id))?.form_of_address).toBe(
        "du",
      );
    });

    it("throws on an unknown org", async () => {
      await expect(
        makeStore().setFormOfAddress("org-nope", "sie"),
      ).rejects.toThrow(/org_id/);
    });
  });

  describe("seed isolation", () => {
    it("mutating the seed after construction does not affect the store", async () => {
      const seed = makeSeed();
      const store = new MemoryStore(seed);

      seed.organizations[0]!.name = "HACKED";
      seed.departments.push({ id: "hacked", org_id: DEMO_ORG_ID, name: "X" });
      seed.personas[0]!.default_tools.push("hacked");
      seed.questions.length = 0;

      expect((await store.getOrganization(DEMO_ORG_ID))?.name).toBe(
        "Musterwerk GmbH",
      );
      expect(await store.listDepartments(DEMO_ORG_ID)).toHaveLength(
        DEMO_DEPARTMENTS.length,
      );
      const [persona] = await store.listPersonas(DEMO_ORG_ID);
      expect(persona!.default_tools).toEqual(["chatgpt", "deepl_write"]);
      expect(await store.listQuestions("weekly")).toHaveLength(2);
    });

    it("mutating seed toolSettings and rules after construction does not affect the store", async () => {
      const seed = makeSeed();
      const store = new MemoryStore(seed);

      seed.toolSettings[0]!.monthly_license_cost_eur = 9999;
      seed.toolSettings.length = 0;
      seed.rules[1]!.title = "HACKED";
      seed.rules.push(makeRule({ key: "R0" }));

      const tools = await store.listToolSettings(DEMO_ORG_ID);
      expect(tools).toHaveLength(2);
      expect(tools[0]!.monthly_license_cost_eur).toBe(20);

      const rules = await store.listRules();
      expect(rules.map((r) => r.key)).toEqual(["R1", "R3"]);
      expect(rules[0]!.title).toBe("Testregel");
    });
  });
});
