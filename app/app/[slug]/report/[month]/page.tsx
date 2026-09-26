import { notFound, redirect } from "next/navigation";
import { ReportView } from "@/components/dashboard/report-view";
import { canAdminOrg, getOrgAccess, requireViewer } from "@/lib/server/auth";
import { getReportData } from "@/lib/server/dashboard-service";

export const dynamic = "force-dynamic";

export default async function MemberReportPage({
  params,
}: {
  params: Promise<{ slug: string; month: string }>;
}) {
  const { slug, month } = await params;
  const viewer = await requireViewer(`/app/${slug}/report/${month}`);
  const access = await getOrgAccess(viewer, slug);
  if (!access) notFound();
  if (!canAdminOrg(access.role)) redirect("/app?denied=dashboard");

  const data = await getReportData(access.store, slug, month);
  if (!data) notFound();
  return <ReportView data={data} dashboardHref={`/app/${data.org.slug}/dashboard`} />;
}
