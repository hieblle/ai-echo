/**
 * k-Anonymity primitives (SPEC.md §7, CLAUDE.md architecture rule 4).
 *
 * Pure functions, no IO. This module is the ONLY place the k-threshold is
 * decided — never the client. The full per-department aggregation filter is
 * built in Phase 2 on top of this primitive; Phase 0 establishes the threshold
 * check and the default k, both of which are covered by unit tests.
 */

/** Default minimum group size for k-anonymity (SPEC.md §6, §7). */
export const K_ANONYMITY_DEFAULT = 5;

/**
 * Whether a group of `n` responses may be reported at the given threshold `k`.
 *
 * A department-level aggregate is only ever computed and delivered when its
 * response count reaches `k`; smaller groups fold into the org-wide total only
 * (SPEC.md §7 rule 2). `k` is `organizations.k_anonymity_min` (default 5, per
 * org only raiseable).
 */
export function meetsKAnonymity(n: number, k: number = K_ANONYMITY_DEFAULT): boolean {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`n must be a non-negative integer, got ${n}`);
  }
  if (!Number.isInteger(k) || k < 1) {
    throw new RangeError(`k must be a positive integer, got ${k}`);
  }
  return n >= k;
}
