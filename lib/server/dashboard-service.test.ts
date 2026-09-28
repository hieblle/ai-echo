import { beforeEach, describe, expect, it } from "vitest";
import { getDashboardData, getPublicOrgKpis } from "./dashboard-service";
import { getDemoStore } from "./store-instance";

function resetStore() {
  (globalThis as { __kiBarometerDemoStore?: unknown }).__kiBarometerDemoStore =
    undefined;
}

beforeEach(resetStore);

describe("getDashboardData · team scope (SPEC §7.4)", () => {
  it("suppresses the whole view for a department below k (Merlin Marketing, n = 4)", async () => {
    const store = await getDemoStore();
    const departments = await store.listDepartments(
      (await store.getOrganizationBySlug("merlin"))!.id,
    );
    const marketing = departments.find((d) => d.name === "Marketing")!;
    const data = await getDashboardData(store, "merlin", {
      departmentId: marketing.id,
      departmentName: marketing.name,
    });
    expect(data?.scope).toEqual({
      departmentId: marketing.id,
      departmentName: "Marketing",
      suppressed: true,
    });
    expect(data?.freeTexts).toEqual([]);
    expect(data?.heatmap.every((c) => c.department_id === null || c.department_id === marketing.id)).toBe(true);
  });

  it("shows a qualified team only its own row plus the org total, k-guarded per week", async () => {
    const store = await getDemoStore();
    const org = (await store.getOrganizationBySlug("merlin"))!;
    const departments = await store.listDepartments(org.id);
    const sales = departments.find((d) => d.name.startsWith("Vertrieb"))!;
    const full = await getDashboardData(store, "merlin");
    const data = await getDashboardData(store, "merlin", {
      departmentId: sales.id,
      departmentName: sales.name,
    });
    expect(data?.scope?.suppressed).toBe(false);
    expect(data?.departments.map((d) => d.id)).toEqual([sales.id]);
    expect(new Set(data?.heatmap.map((c) => c.department_id))).toEqual(
      new Set([null, sales.id]),
    );
    // Team indices rest on the team's rows only — never more respondents
    // than the org-wide week, and never a value from < k respondents.
    for (const [i, week] of (data?.history ?? []).entries()) {
      expect(week.n_pulse).toBeLessThanOrEqual(full!.history[i]!.n_pulse);
      if (week.n_pulse < org.k_anonymity_min) {
        expect(week.sentiment_index).toBeNull();
        expect(week.trust_index).toBeNull();
      }
    }
    // Org-level sections are not part of a team view.
    expect(data?.freeTexts).toEqual([]);
  });
});

describe("getPublicOrgKpis", () => {
  it("returns org-wide participation and sentiment for generated orgs", async () => {
    const store = await getDemoStore();
    const org = (await store.getOrganizationBySlug("merlin"))!;
    const kpis = await getPublicOrgKpis(store, org);
    expect(kpis.weeks).toBe(6);
    expect(kpis.participationRate).toBeGreaterThan(0);
    expect(kpis.sentimentIndex).toBeGreaterThan(0);
  });

  it("is empty for an org without cycles", async () => {
    const store = await getDemoStore();
    const org = (await store.getOrganizationBySlug("musterwerk"))!;
    expect(await getPublicOrgKpis(store, org)).toEqual({
      weeks: 0,
      latestWeek: null,
      participationRate: null,
      sentimentIndex: null,
    });
  });
});
