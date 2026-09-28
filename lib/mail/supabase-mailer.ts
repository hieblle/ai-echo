/**
 * Login links via Supabase Auth (Phase 4, DECISIONS D3.2).
 *
 * New people get Supabase's "Invite user" mail (creates the auth user);
 * existing people get a "Magic Link" mail. Both templates are edited in the
 * Supabase dashboard (Authentication → Email Templates); the redirect lands
 * on /auth/callback and continues to /app.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InviteInput, LoginLinkInput, Mailer } from "./mailer";

export class SupabaseAuthMailer implements Mailer {
  readonly provider = "supabase";

  constructor(
    private readonly admin: SupabaseClient,
    private readonly appUrl: string,
  ) {}

  private redirectTo(next = "/app"): string {
    return `${this.appUrl}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async inviteUser(input: InviteInput): Promise<{ userId: string }> {
    const invited = await this.admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: this.redirectTo(),
      data: { invited_org: input.orgName },
    });
    if (!invited.error && invited.data.user) {
      return { userId: invited.data.user.id };
    }
    if (invited.error && !/already|exists|registered/i.test(invited.error.message)) {
      throw new Error(`inviteUser: ${invited.error.message}`);
    }

    // Already an auth user (member of another org, or re-invited): resolve
    // the id without sending, then send an ordinary login link.
    const link = await this.admin.auth.admin.generateLink({
      type: "magiclink",
      email: input.email,
    });
    if (link.error || !link.data.user) {
      throw new Error(`inviteUser: ${link.error?.message ?? "user lookup failed"}`);
    }
    await this.sendLoginLink({
      email: input.email,
      orgName: input.orgName,
      template: "onboarding",
      kind: "invitation",
    });
    return { userId: link.data.user.id };
  }

  async sendLoginLink(input: LoginLinkInput): Promise<void> {
    const { error } = await this.admin.auth.signInWithOtp({
      email: input.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: this.redirectTo(),
      },
    });
    if (error) throw new Error(`sendLoginLink: ${error.message}`);
  }
}
