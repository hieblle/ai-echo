"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useEffect, useState } from "react";

interface FinishLoginProps {
  url: string;
  /** The publishable key — safe for browsers; never the secret key. */
  publishableKey: string;
  next: string;
}

/**
 * Lets the browser client pick up session tokens from the URL fragment
 * (implicit flow), persist them as cookies and continue to `next`.
 */
export function FinishLogin({ url, publishableKey, next }: FinishLoginProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserClient(url, publishableKey);
    const finish = async () => {
      // detectSessionInUrl (default) parses "#access_token=…" on creation;
      // getSession waits for that to complete.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        window.location.replace(next);
      } else {
        setFailed(true);
      }
    };
    void finish();
    return () => {
      cancelled = true;
    };
  }, [url, publishableKey, next]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-16 text-center">
      {failed ? (
        <>
          <h1 className="text-xl font-semibold">Login-Link ungültig</h1>
          <p className="text-sm text-muted-foreground">
            Der Link ist abgelaufen oder wurde schon verwendet.
          </p>
          <Link href="/login" className="text-sm underline-offset-4 hover:underline">
            Neuen Login-Link anfordern
          </Link>
        </>
      ) : (
        <p className="text-muted-foreground">Anmeldung wird abgeschlossen …</p>
      )}
    </main>
  );
}
