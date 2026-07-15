/**
 * ISO-8601 week handling (pure, no IO).
 *
 * `responses.created_week` stores ONLY the ISO week (e.g. "2026-W29"), never a
 * timestamp — part of the anonymity design (SPEC.md §6/§7).
 */

/** Format a date as its ISO-8601 week, e.g. "2026-W29" (UTC-based). */
export function getIsoWeek(date: Date): string {
  // Thursday trick: the ISO week-numbering year of a date is the calendar
  // year of the Thursday in the same week.
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - isoDay); // move to Thursday of this week
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** Parse "2026-W29" into its parts; throws on malformed input. */
export function parseIsoWeek(week: string): { year: number; week: number } {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new RangeError(`invalid ISO week: ${week}`);
  const year = Number(m[1]);
  const wk = Number(m[2]);
  if (wk < 1 || wk > 53) throw new RangeError(`invalid ISO week: ${week}`);
  return { year, week: wk };
}
