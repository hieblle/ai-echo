import { notFound, redirect } from "next/navigation";
import { canAdminOrg, getOrgAccess, requireViewer } from "@/lib/server/auth";
import { monthOfIsoWeek } from "@/lib/server/dashboard-service";

export const dynamic = "force-dynamic";

/** "/app/<org>/report" → the report of the latest month with data. */
export default async function ReportIndexPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await requireViewer(`/app/${slug}/report`);
  const access = await getOrgAccess(viewer, slug);
  if (!access) notFound();
  if (!canAdminOrg(access.role)) redirect("/app?denied=dashboard");

  const stats = await access.store.listParticipationStats(access.org.id);
  const weeks = stats
    .filter((s) => s.template_key === "weekly")
    .map((s) => s.week)
    .sort();
  const latest = weeks[weeks.length - 1];
  if (!latest) redirect(`/app/${slug}/dashboard?report=empty`);
  redirect(`/app/${slug}/report/${monthOfIsoWeek(latest)}`);
}
