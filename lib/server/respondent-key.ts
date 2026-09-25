/**
 * Respondent keys (SPEC §6/§7, DECISIONS D4.2).
 *
 * The pseudonymous survey state of a person (`respondent_profiles`) is keyed
 * by HMAC-SHA256(PSEUDONYM_SECRET, membership id). The membership id itself
 * never reaches that table, and linking a profile back to a person requires
 * BOTH the database and the app secret. Responses carry no key at all.
 */

import { createHmac } from "node:crypto";
import { getPseudonymSecret } from "./env";

export function respondentKeyFor(membershipId: string): string {
  const secret = getPseudonymSecret();
  if (!secret) {
    throw new Error("PSEUDONYM_SECRET is not set — see .env.example");
  }
  return createHmac("sha256", secret).update(membershipId).digest("hex");
}
