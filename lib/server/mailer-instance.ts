/**
 * Server-side mailer singleton, chosen by MAIL_PROVIDER (default: Supabase
 * Auth when Supabase is configured, console otherwise).
 */

import { ConsoleMailer, type Mailer } from "@/lib/mail/mailer";
import { SupabaseAuthMailer } from "@/lib/mail/supabase-mailer";
import { getAppUrl, getMailProvider } from "./env";
import { getAppSupabaseStore } from "./store-instance";

const globalForMailer = globalThis as unknown as {
  __kiBarometerMailer?: Mailer;
};

export function getMailer(): Mailer {
  if (globalForMailer.__kiBarometerMailer) {
    return globalForMailer.__kiBarometerMailer;
  }
  const provider = getMailProvider();
  const supabase = getAppSupabaseStore();
  const mailer: Mailer =
    provider === "supabase" && supabase
      ? new SupabaseAuthMailer(supabase.client, getAppUrl())
      : new ConsoleMailer();
  globalForMailer.__kiBarometerMailer = mailer;
  return mailer;
}
