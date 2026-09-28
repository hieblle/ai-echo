import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseEnv } from "./env";

const ALL = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function setEnv(vars: Record<string, string>) {
  for (const name of ALL) vi.stubEnv(name, "");
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getSupabaseEnv", () => {
  it("reads the current key system (publishable + secret)", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
      SUPABASE_SECRET_KEY: "sb_secret_xyz",
    });
    expect(getSupabaseEnv()).toEqual({
      url: "https://x.supabase.co",
      publishableKey: "sb_publishable_abc",
      secretKey: "sb_secret_xyz",
    });
  });

  it("falls back to the legacy anon/service_role names", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJ.anon",
      SUPABASE_SERVICE_ROLE_KEY: "eyJ.service",
    });
    expect(getSupabaseEnv()).toMatchObject({
      publishableKey: "eyJ.anon",
      secretKey: "eyJ.service",
    });
  });

  it("prefers the new names when both are set", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_new",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJ.anon",
      SUPABASE_SECRET_KEY: "sb_secret_new",
      SUPABASE_SERVICE_ROLE_KEY: "eyJ.service",
    });
    expect(getSupabaseEnv()).toMatchObject({
      publishableKey: "sb_publishable_new",
      secretKey: "sb_secret_new",
    });
  });

  it("is null when a variable is missing", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
    });
    expect(getSupabaseEnv()).toBeNull();
  });

  it("refuses swapped keys (a secret key must never reach the browser)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_oops",
      SUPABASE_SECRET_KEY: "sb_secret_xyz",
    });
    expect(getSupabaseEnv()).toBeNull();
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
      SUPABASE_SECRET_KEY: "sb_publishable_oops",
    });
    expect(getSupabaseEnv()).toBeNull();
    expect(error).toHaveBeenCalled();
  });
});
