/**
 * Magic-link landing (Route Handler).
 *
 * Supports both link styles Supabase can generate:
 *   - PKCE:      ?code=…                 → exchangeCodeForSession
 *   - token hash: ?token_hash=…&type=…  → verifyOtp (templates using
 *                 {{ .TokenHash }}, works for admin-generated invites)
 * Anything else (implicit-flow tokens arrive in the URL fragment, which the
 * server cannot see) is handed to the client-side /auth/finish page.
 */

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNextPath } from "@/lib/server/auth-actions";
import { createSupabaseServerClient } from "@/lib/server/supabase-auth";

const OTP_TYPES: readonly EmailOtpType[] = [
  "magiclink",
  "invite",
  "email",
  "signup",
  "recovery",
  "email_change",
];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = await safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.redirect(`${origin}/app/setup`);

  const failed = () =>
    NextResponse.redirect(
      `${origin}/login?error=link&next=${encodeURIComponent(next)}`,
    );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? failed() : NextResponse.redirect(`${origin}${next}`);
  }
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    return error ? failed() : NextResponse.redirect(`${origin}${next}`);
  }
  if (searchParams.get("error")) return failed();

  return NextResponse.redirect(
    `${origin}/auth/finish?next=${encodeURIComponent(next)}`,
  );
}
