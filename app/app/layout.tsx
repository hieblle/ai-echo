import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/server/auth-actions";
import { getViewer } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getViewer();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <Link href="/app" className="font-semibold tracking-tight">
            KI-Barometer
          </Link>
          {viewer && (
            <div className="flex items-center gap-3 text-sm">
              {viewer.isPlatformAdmin && (
                <Link href="/admin" className="text-muted-foreground hover:underline">
                  Plattform-Admin
                </Link>
              )}
              <span className="hidden text-muted-foreground sm:inline">
                {viewer.user.email}
              </span>
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="sm">
                  Abmelden
                </Button>
              </form>
            </div>
          )}
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
