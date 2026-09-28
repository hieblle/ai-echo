import { AppShell } from "@/components/shell/app-shell";
import { signOut } from "@/lib/server/auth-actions";
import { getViewer } from "@/lib/server/auth";
import { buildProductShell } from "@/lib/server/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getViewer();
  // Not configured or not logged in: the pages redirect to /app/setup or
  // /login themselves — render them without the shell.
  if (!viewer) return <>{children}</>;
  const shell = await buildProductShell(viewer);
  return (
    <AppShell data={shell} signOut={signOut}>
      {children}
    </AppShell>
  );
}
