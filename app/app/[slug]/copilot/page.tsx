import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CopilotView } from "@/components/copilot/copilot-view";
import {
  canAdminOrg,
  canViewDashboard,
  getOrgAccess,
  requireViewer,
} from "@/lib/server/auth";
import { getCopilotPageData } from "@/lib/server/copilot-service";

export const dynamic = "force-dynamic";

export default async function MemberCopilotPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await requireViewer(`/app/${slug}/copilot`);
  const access = await getOrgAccess(viewer, slug);
  if (!access) notFound();
  if (!canViewDashboard(access.role)) redirect("/app?denied=dashboard");

  const data = await getCopilotPageData(access.store, access.org, access.role);
  const admin = canAdminOrg(access.role);
  return (
    <CopilotView
      data={data}
      adminHref={admin ? `/app/${slug}/admin#integrationen` : null}
      dashboardHref={`/app/${slug}/dashboard`}
      footer={
        <>
          <Link href="/app" className="hover:underline">
            Meine Befragungen
          </Link>
          <span>
            Org-Werte aus dem Microsoft-Bericht; keine Team- oder Personenwerte.
          </span>
        </>
      }
    />
  );
}
