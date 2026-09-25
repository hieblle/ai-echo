import { redirect } from "next/navigation";
import { FinishLogin } from "@/components/auth/finish-login";
import { safeNextPath } from "@/lib/server/auth-actions";
import { getSupabaseEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

interface FinishPageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * Client-side fallback for implicit-flow links: Supabase puts the session
 * tokens into the URL fragment, which only the browser can read.
 */
export default async function FinishPage({ searchParams }: FinishPageProps) {
  const env = getSupabaseEnv();
  if (!env) redirect("/app/setup");
  const next = await safeNextPath((await searchParams).next);
  return (
    <FinishLogin url={env.url} publishableKey={env.publishableKey} next={next} />
  );
}
