import { AppShell } from "@/components/shell/app-shell";
import { getDemoShell } from "@/lib/server/demo-shell";

export const dynamic = "force-dynamic";

export default async function DemoReportLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell data={await getDemoShell()}>{children}</AppShell>;
}
