import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/data/memory-store";
import { MemoryMailer } from "@/lib/mail/mailer";
import { QUESTIONS } from "@/lib/seed/questions";
import { RECOMMENDATION_RULES } from "@/lib/seed/rules";
import {
  createOrganizationWithSetup,
  inviteMembers,
  parseEmailList,
  slugify,
} from "./admin-service";

const NOW = new Date("2026-09-21T07:00:00.000Z");

let store: MemoryStore;
let mailer: MemoryMailer;

beforeEach(() => {
  store = new MemoryStore({
    organizations: [],
    departments: [],
    personas: [],
    questions: QUESTIONS,
    toolSettings: [],
    rules: RECOMMENDATION_RULES,
  });
  mailer = new MemoryMailer();
});

describe("slugify", () => {
  it("handles umlauts and punctuation", () => {
    expect(slugify("Merlin Technology GmbH")).toBe("merlin-technology-gmbh");
    expect(slugify("SPAR Österreich (Zentrale)")).toBe("spar-oesterreich-zentrale");
    expect(slugify("  Müller & Söhne ")).toBe("mueller-soehne");
  });
});

describe("createOrganizationWithSetup (F1)", () => {
  it("creates org, departments and tools; k never below 5", async () => {
    const org = await createOrganizationWithSetup(store, {
      name: "Merlin Technology GmbH",
      form_of_address: "sie",
      hourly_rate_default: 65,
      k_anonymity_min: 3,
      departments: ["Vertrieb & Export", "Technik", " Technik ", ""],
      tools: [
        { tool_value: "copilot365", tool_label: "Microsoft Copilot 365", monthly_license_cost_eur: 900 },
        { tool_value: "deepl", tool_label: "DeepL", monthly_license_cost_eur: -1 },
      ],
    });
    expect(org.slug).toBe("merlin-technology-gmbh");
    expect(org.k_anonymity_min).toBe(5);
    expect((await store.listDepartments(org.id)).map((d) => d.name)).toEqual([
      "Vertrieb & Export",
      "Technik",
    ]);
    expect(await store.listToolSettings(org.id)).toMatchObject([
      { tool_value: "copilot365", monthly_license_cost_eur: 900, active: true },
      { tool_value: "deepl", monthly_license_cost_eur: 0 },
    ]);
  });

  it("rejects an invalid explicit slug", async () => {
    await expect(
      createOrganizationWithSetup(store, {
        name: "X",
        slug: "Not Valid",
        form_of_address: "du",
        hourly_rate_default: 60,
        k_anonymity_min: 5,
        departments: [],
        tools: [],
      }),
    ).rejects.toThrow(/slug/);
  });
});

describe("parseEmailList", () => {
  it("accepts lines, commas, semicolons and quotes; dedupes case-insensitively", () => {
    const { valid, invalid } = parseEmailList(
      'Anna@Firma.at\n"bert@firma.at", carla@firma.at; anna@firma.at\nkaputt@\n',
    );
    expect(valid).toEqual(["anna@firma.at", "bert@firma.at", "carla@firma.at"]);
    expect(invalid).toEqual(["kaputt@"]);
  });
});

describe("inviteMembers (F2)", () => {
  it("invites new people, skips existing members, reports failures", async () => {
    const org = await createOrganizationWithSetup(store, {
      name: "Org",
      form_of_address: "du",
      hourly_rate_default: 60,
      k_anonymity_min: 5,
      departments: ["Vertrieb"],
      tools: [],
    });
    const dept = (await store.listDepartments(org.id))[0]!;
    mailer.failFor.add("broken@firma.at");

    const first = await inviteMembers(
      store,
      mailer,
      org,
      { emails: ["anna@firma.at", "broken@firma.at"], role: "employee", department_id: dept.id },
      NOW,
    );
    expect(first).toEqual({
      invited: ["anna@firma.at"],
      existing: [],
      failed: [{ email: "broken@firma.at", error: "smtp down" }],
    });
    expect(await store.listMemberships(org.id)).toMatchObject([
      { email: "anna@firma.at", role: "employee", department_id: dept.id, status: "invited", user_id: "user:anna@firma.at" },
    ]);

    const second = await inviteMembers(
      store,
      mailer,
      org,
      { emails: ["anna@firma.at", "bert@firma.at"], role: "team_lead", department_id: "unknown" },
      NOW,
    );
    expect(second.existing).toEqual(["anna@firma.at"]);
    expect(second.invited).toEqual(["bert@firma.at"]);
    const bert = (await store.listMemberships(org.id)).find((m) => m.email === "bert@firma.at");
    expect(bert).toMatchObject({ role: "team_lead", department_id: null });
    expect(mailer.invitations.map((i) => i.email)).toEqual(["anna@firma.at", "bert@firma.at"]);
  });

  it("re-activates a removed member instead of duplicating the row", async () => {
    const org = await createOrganizationWithSetup(store, {
      name: "Org",
      form_of_address: "du",
      hourly_rate_default: 60,
      k_anonymity_min: 5,
      departments: [],
      tools: [],
    });
    await inviteMembers(store, mailer, org, { emails: ["anna@firma.at"], role: "employee", department_id: null }, NOW);
    const m = (await store.listMemberships(org.id))[0]!;
    await store.updateMembership(m.id, { status: "removed" });
    const again = await inviteMembers(store, mailer, org, { emails: ["anna@firma.at"], role: "org_admin", department_id: null }, NOW);
    expect(again.invited).toEqual(["anna@firma.at"]);
    const rows = await store.listMemberships(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "invited", role: "org_admin" });
  });
});
