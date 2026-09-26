/**
 * Cookie-based Supabase auth client for Server Components, Server Actions and
 * Route Handlers (@supabase/ssr). Uses the PUBLISHABLE key: it only ever
 * handles the session of the calling user. All data access goes through the
 * store (secret key) after the server verified who is calling.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

export type ServerSupabase = ReturnType<typeof createServerClient>;

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createSupabaseServerClient(): Promise<ServerSupabase | null> {
  const env = getSupabaseEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only there. The
          // middleware refreshes the session cookies on the next request.
        }
      },
    },
  });
}

export interface AuthUser {
  id: string;
  email: string;
}

/** The verified calling user (server-validated JWT), or null. */
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return { id: user.id, email: user.email.toLowerCase() };
}
