import { describe, expect, it } from "vitest";
import {
  getIsoWeek,
  parseIsoWeek,
  previousIsoWeek,
  weeksInIsoYear,
} from "./isoWeek";

describe("getIsoWeek", () => {
  it("formats a mid-year date", () => {
    // 2026-07-14 is a Tuesday in ISO week 29.
    expect(getIsoWeek(new Date(Date.UTC(2026, 6, 14)))).toBe("2026-W29");
  });

  it("handles year boundaries (week belongs to previous year)", () => {
    // 2027-01-01 is a Friday — still ISO week 53 of 2026.
    expect(getIsoWeek(new Date(Date.UTC(2027, 0, 1)))).toBe("2026-W53");
    // 2005-01-01 is a Saturday — ISO week 53 of 2004.
    expect(getIsoWeek(new Date(Date.UTC(2005, 0, 1)))).toBe("2004-W53");
  });

  it("handles year boundaries (week belongs to next year)", () => {
    // 2025-12-29 is a Monday — already ISO week 1 of 2026.
    expect(getIsoWeek(new Date(Date.UTC(2025, 11, 29)))).toBe("2026-W01");
  });

  it("pads single-digit weeks", () => {
    expect(getIsoWeek(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-W02");
  });
});

describe("parseIsoWeek", () => {
  it("parses a valid week", () => {
    expect(parseIsoWeek("2026-W29")).toEqual({ year: 2026, week: 29 });
  });

  it("rejects malformed input", () => {
    expect(() => parseIsoWeek("2026-29")).toThrow(RangeError);
    expect(() => parseIsoWeek("2026-W54")).toThrow(RangeError);
    expect(() => parseIsoWeek("2026-W00")).toThrow(RangeError);
  });
});

describe("weeksInIsoYear", () => {
  it("distinguishes 52- and 53-week years", () => {
    expect(weeksInIsoYear(2026)).toBe(53);
    expect(weeksInIsoYear(2025)).toBe(52);
    expect(weeksInIsoYear(2020)).toBe(53);
  });
});

describe("previousIsoWeek", () => {
  it("steps back within a year", () => {
    expect(previousIsoWeek("2026-W29")).toBe("2026-W28");
    expect(previousIsoWeek("2026-W02")).toBe("2026-W01");
  });

  it("rolls over the year boundary with the correct week count", () => {
    expect(previousIsoWeek("2027-W01")).toBe("2026-W53");
    expect(previousIsoWeek("2026-W01")).toBe("2025-W52");
  });
});
