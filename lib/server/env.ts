/**
 * Typed access to the (few) environment variables of the app.
 *
 * Everything is optional at module load: the demo routes run with no
 * configuration at all, and the real product routes check
 * `isSupabaseConfigured()` and degrade to a setup hint instead of crashing.
 * Secrets never live in the repo — see `.env.example`.
 */

function read(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : null;
}

export interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = read("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = read("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return null;
  return { url, anonKey, serviceRoleKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

/** Public base URL used in magic links and mails (no trailing slash). */
export function getAppUrl(): string {
  const explicit = read("NEXT_PUBLIC_APP_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = read("VERCEL_PROJECT_PRODUCTION_URL") ?? read("VERCEL_URL");
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
