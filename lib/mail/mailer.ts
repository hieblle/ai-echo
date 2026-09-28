/**
 * Mail abstraction (DECISIONS D3.2): the flows only know this interface, so
 * the provider can change later without touching them.
 *
 * Phase 4 sends nothing but LOGIN LINKS: an invitation is the person's first
 * login link, a pulse invitation or reminder is a login link that lands on
 * /app where the open survey waits. Supabase Auth delivers them
 * (lib/mail/supabase-mailer.ts); the console mailer logs instead.
 */

import type { TemplateKey } from "@/lib/types";

export interface InviteInput {
  email: string;
  orgName: string;
}

export interface LoginLinkInput {
  email: string;
  orgName: string;
  template: TemplateKey;
  kind: "invitation" | "reminder";
}

export interface Mailer {
  readonly provider: string;
  /**
   * Make sure an auth user exists for the address and send the first login
   * link. Returns the auth user id the membership will reference.
   */
  inviteUser(input: InviteInput): Promise<{ userId: string }>;
  /** Login link for an existing user (pulse invitation / reminder). */
  sendLoginLink(input: LoginLinkInput): Promise<void>;
}

/** Development fallback without Supabase: logs, never sends. */
export class ConsoleMailer implements Mailer {
  readonly provider = "console";

  async inviteUser(input: InviteInput): Promise<{ userId: string }> {
    console.info(`[mail] invitation → ${input.email} (${input.orgName})`);
    return { userId: `console:${input.email}` };
  }

  async sendLoginLink(input: LoginLinkInput): Promise<void> {
    console.info(
      `[mail] ${input.kind} (${input.template}) → ${input.email} (${input.orgName})`,
    );
  }
}

/** Test double that records what would have been sent. */
export class MemoryMailer implements Mailer {
  readonly provider = "memory";
  readonly invitations: InviteInput[] = [];
  readonly loginLinks: LoginLinkInput[] = [];
  /** Addresses whose sends should fail (to test partial failures). */
  readonly failFor = new Set<string>();

  async inviteUser(input: InviteInput): Promise<{ userId: string }> {
    if (this.failFor.has(input.email)) throw new Error("smtp down");
    this.invitations.push(input);
    return { userId: `user:${input.email}` };
  }

  async sendLoginLink(input: LoginLinkInput): Promise<void> {
    if (this.failFor.has(input.email)) throw new Error("smtp down");
    this.loginLinks.push(input);
  }
}
