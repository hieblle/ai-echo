import { AppShell } from "@/components/shell/app-shell";
import { getDemoShell } from "@/lib/server/demo-shell";

export const dynamic = "force-dynamic";

/** Survey routes render in the shell's focused mode (slim bar, no sidebar). */
export default async function DemoSurveyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell data={await getDemoShell()}>{children}</AppShell>;
}
