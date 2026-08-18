import { describe, expect, it } from "vitest";
import { K_ANONYMITY_DEFAULT, meetsKAnonymity } from "./anonymity";

describe("k-anonymity", () => {
  it("defaults k to 5 (SPEC.md §6/§7)", () => {
    expect(K_ANONYMITY_DEFAULT).toBe(5);
  });

  it("reports a group at or above the threshold", () => {
    expect(meetsKAnonymity(5)).toBe(true);
    expect(meetsKAnonymity(6)).toBe(true);
  });

  it("suppresses a group below the threshold", () => {
    // The n = 4 department must never be reported on its own (SPEC.md §7).
    expect(meetsKAnonymity(4)).toBe(false);
    expect(meetsKAnonymity(0)).toBe(false);
  });

  it("honours a raised per-org threshold", () => {
    expect(meetsKAnonymity(5, 8)).toBe(false);
    expect(meetsKAnonymity(8, 8)).toBe(true);
  });

  it("rejects invalid inputs", () => {
    expect(() => meetsKAnonymity(-1)).toThrow(RangeError);
    expect(() => meetsKAnonymity(3.5)).toThrow(RangeError);
    expect(() => meetsKAnonymity(5, 0)).toThrow(RangeError);
  });
});
