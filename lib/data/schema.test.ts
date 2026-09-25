/**
 * Static guards over the SQL migrations: the anonymity invariants of SPEC §6/§7
 * must hold in the schema itself, not only in TypeScript types.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

function allSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

/** Body of `create table public.<name> ( … );` (first definition). */
function tableBody(sql: string, table: string): string {
  const match = sql.match(
    new RegExp(`create table public\\.${table}\\s*\\(([\\s\\S]*?)\\);`, "i"),
  );
  if (!match) throw new Error(`table ${table} not found in migrations`);
  return match[1] ?? "";
}

const sql = allSql();

describe("schema · responses carry no person link (SPEC §6/§7, D1.17)", () => {
  const body = tableBody(sql, "responses");
  const columns = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("--"))
    .map((l) => l.split(/\s+/)[0] ?? "");

  it.each(["user_id", "membership_id", "respondent_key", "pseudonym_token", "created_at", "updated_at"])(
    "has no %s column",
    (forbidden) => {
      expect(columns).not.toContain(forbidden);
    },
  );

  it("uses random uuids and only the ISO week", () => {
    expect(body).toMatch(/id\s+uuid primary key default gen_random_uuid\(\)/);
    expect(body).toMatch(/created_week\s+text not null/);
  });

  it("does not reference memberships or auth.users", () => {
    expect(body).not.toMatch(/references public\.memberships/);
    expect(body).not.toMatch(/auth\.users/);
  });
});

describe("schema · respondent_profiles", () => {
  const body = tableBody(sql, "respondent_profiles");

  it("stores only the keyed hash and no timestamps", () => {
    expect(body).toMatch(/respondent_key\s+text not null/);
    expect(body).not.toMatch(/membership_id|user_id|created_at|updated_at/);
  });
});

describe("schema · tenant isolation and k-anonymity", () => {
  it("enforces k >= 5 in the database", () => {
    expect(tableBody(sql, "organizations")).toMatch(
      /k_anonymity_min\s+integer not null default 5 check \(k_anonymity_min >= 5\)/,
    );
  });

  it.each([
    "organizations",
    "departments",
    "org_settings_tools",
    "memberships",
    "survey_cycles",
    "participations",
    "respondent_profiles",
    "responses",
    "recommendation_states",
  ])("enables row level security on %s", (table) => {
    expect(sql).toMatch(
      new RegExp(`alter table public\\.${table}\\s+enable row level security`),
    );
  });

  it.each(["responses", "respondent_profiles", "recommendation_states"])(
    "defines no client policy on %s (server-only)",
    (table) => {
      expect(sql).not.toMatch(new RegExp(`on public\\.${table} for`));
    },
  );

  it("locks anonymous clients out entirely", () => {
    expect(sql).toMatch(/revoke all on all tables in schema public from anon/);
  });

  it("carries org_id on every tenant table", () => {
    for (const table of [
      "departments",
      "org_settings_tools",
      "memberships",
      "survey_cycles",
      "respondent_profiles",
      "responses",
      "recommendation_states",
    ]) {
      expect(tableBody(sql, table)).toMatch(/org_id\s+uuid not null references public\.organizations/);
    }
  });
});
