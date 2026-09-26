/**
 * Typed access to the (few) environment variables of the app.
 *
 * Everything is optional at module load: the demo routes run with no
 * configuration at all, and the real product routes check
 * `isSupabaseConfigured()` and degrade to a setup hint instead of crashing.
 * Secrets never live in the repo — see `.env.example`.
 *
 * Supabase API keys: the project uses the current key system —
 * `sb_publishable_…` (safe for browsers, replaces the legacy `anon` JWT)
 * and `sb_secret_…` (server-only, replaces the legacy `service_role` JWT).
 * supabase-js ≥ 2.7x sends both formats correctly (`apikey` header, never a
 * secret key as Bearer). The legacy variable names are still read as a
 * fallback so an older `.env.local` keeps working.
 *
 * No Node-only imports here: the middleware (edge runtime) uses this too.
 */

function read(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== "") return value.trim();
  }
  return null;
}

export interface SupabaseEnv {
  url: string;
  /** `sb_publishable_…` (or legacy anon JWT): browser + user sessions. */
  publishableKey: string;
  /** `sb_secret_…` (or legacy service_role JWT): server-only store/admin. */
  secretKey: string;
}

export const SUPABASE_URL_VARS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"];
export const SUPABASE_PUBLISHABLE_KEY_VARS = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  // legacy
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];
export const SUPABASE_SECRET_KEY_VARS = [
  "SUPABASE_SECRET_KEY",
  // legacy
  "SUPABASE_SERVICE_ROLE_KEY",
];

let warned = false;
function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.error(`[env] ${message}`);
}

/**
 * The Supabase connection, or null when incomplete or obviously swapped
 * (a secret key in the publishable slot would be handed to browsers).
 */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = read(...SUPABASE_URL_VARS);
  const publishableKey = read(...SUPABASE_PUBLISHABLE_KEY_VARS);
  const secretKey = read(...SUPABASE_SECRET_KEY_VARS);
  if (!url || !publishableKey || !secretKey) return null;
  if (publishableKey.startsWith("sb_secret_")) {
    warnOnce(
      "a secret key is set as the publishable key — refusing to start the product routes",
    );
    return null;
  }
  if (secretKey.startsWith("sb_publishable_")) {
    warnOnce(
      "a publishable key is set as the secret key — the server store needs sb_secret_…",
    );
    return null;
  }
  return { url, publishableKey, secretKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

/** Public base URL used in magic links and mails (no trailing slash). */
export function getAppUrl(): string {
  const explicit = read("NEXT_PUBLIC_APP_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = read("VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL");
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** dbrains staff with platform_admin rights (comma-separated, lower-cased). */
export function getPlatformAdminEmails(): string[] {
  const raw = read("PLATFORM_ADMIN_EMAILS");
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== "");
}

/** Secret for the keyed hash that derives respondent keys (SPEC §7, D4.2). */
export function getPseudonymSecret(): string | null {
  return read("PSEUDONYM_SECRET");
}

/** Bearer secret the scheduler sends to /api/cron/* (Vercel sets it, too). */
export function getCronSecret(): string | null {
  return read("CRON_SECRET");
}

export type MailProvider = "console" | "supabase";

/** Which mailer the app uses; defaults to Supabase when it is configured. */
export function getMailProvider(): MailProvider {
  const raw = read("MAIL_PROVIDER");
  if (raw === "console" || raw === "supabase") return raw;
  return isSupabaseConfigured() ? "supabase" : "console";
}
