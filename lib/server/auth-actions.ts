"use server";

/**
 * Auth server actions: magic-link request and sign-out.
 */

import { redirect } from "next/navigation";
import { z } from "zod";
import { getAppUrl } from "./env";
import { createSupabaseServerClient } from "./supabase-auth";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** Only paths on this site may be used as post-login targets. */
export async function safeNextPath(value: unknown): Promise<string> {
  return typeof value === "string" && /^\/(?!\/)[\w\-./?=&%]*$/.test(value)
    ? value
    : "/app";
}

export async function requestMagicLink(formData: FormData): Promise<void> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  const next = await safeNextPath(formData.get("next"));
  if (!parsed.success) {
    redirect(`/login?error=email&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/app/setup");

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      // Only invited people can log in — no self-service signup (SPEC §4.1).
      shouldCreateUser: false,
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    // Never reveal whether an address exists; only real delivery problems
    // (rate limit, SMTP) are surfaced generically.
    const enumeration = /signups not allowed|not found/i.test(error.message);
    if (!enumeration) {
      console.error("requestMagicLink failed:", error.message);
      redirect(`/login?error=send&next=${encodeURIComponent(next)}`);
    }
  }
  redirect(`/login?sent=1&next=${encodeURIComponent(next)}`);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
