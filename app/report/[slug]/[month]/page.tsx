import { notFound } from "next/navigation";
import { ReportView } from "@/components/dashboard/report-view";
import { getCopilotPageData } from "@/lib/server/copilot-service";
import { getReportData } from "@/lib/server/dashboard-service";
import { getDemoStore } from "@/lib/server/store-instance";

// Stateful in-memory demo data — always render fresh.
export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ slug: string; month: string }>;
}) {
  const { slug, month } = await params;
  const store = await getDemoStore();
  const data = await getReportData(store, slug, month);
  if (!data) notFound();
  const copilot = await getCopilotPageData(store, data.org, "org_admin");
  return (
    <ReportView
      data={data}
      dashboardHref={`/dashboard/${data.org.slug}`}
      copilot={copilot}
    />
  );
}
