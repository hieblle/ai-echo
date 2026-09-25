import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import {
  canAdminOrg,
  canViewDashboard,
  getOrgAccess,
  requireViewer,
} from "@/lib/server/auth";
import {
  getDashboardData,
  monthOfIsoWeek,
  type DashboardScope,
} from "@/lib/server/dashboard-service";
import { updateMemberRecommendationStatusAction } from "@/lib/server/member-actions";

export const dynamic = "force-dynamic";

export default async function MemberDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await requireViewer(`/app/${slug}/dashboard`);
  const access = await getOrgAccess(viewer, slug);
  if (!access) notFound();
  if (!canViewDashboard(access.role)) redirect("/app?denied=dashboard");

  // team_lead: own department only (SPEC §7.4), k-guarded as a whole.
  let scope: DashboardScope | undefined;
  if (access.role === "team_lead") {
    const departments = await access.store.listDepartments(access.org.id);
    const own = departments.find(
      (d) => d.id === access.membership?.department_id,
    );
    if (!own) redirect("/app?denied=team");
    scope = { departmentId: own.id, departmentName: own.name };
  }

  const data = await getDashboardData(access.store, slug, scope);
  if (!data) notFound();

  const latestWeek = data.weeks[data.weeks.length - 1];
  const reportMonth = latestWeek ? monthOfIsoWeek(latestWeek) : null;

  // Orgs the viewer may switch between: all for platform admins, otherwise
  // the orgs where their membership grants a dashboard.
  const switchable = viewer.isPlatformAdmin
    ? data.orgs
    : data.orgs.filter((o) =>
        viewer.memberships.some(
          (m) => m.org_id === o.id && canViewDashboard(m.role),
        ),
      );

  async function setStatus(formData: FormData) {
    "use server";
    await updateMemberRecommendationStatusAction(slug, {
      ruleKey: formData.get("ruleKey"),
      context: formData.get("context"),
      status: formData.get("status"),
    });
  }

  return (
    <DashboardView
      data={data}
      orgSwitcher={switchable.map((o) => ({
        name: o.name,
        href: `/app/${o.slug}/dashboard`,
        active: o.id === data.org.id,
      }))}
      reportHref={
        reportMonth && canAdminOrg(access.role)
          ? `/app/${data.org.slug}/report/${reportMonth}`
          : null
      }
      recommendationAction={setStatus}
      emptyHint={
        <p>
          Noch keine Befragungsdaten. Sobald der erste Pulse-Zyklus geöffnet
          und beantwortet wurde, erscheinen hier die Kennzahlen.
        </p>
      }
      footer={
        <>
          <Link href="/app" className="hover:underline">
            Meine Befragungen
          </Link>
          {canAdminOrg(access.role) && (
            <Link href={`/app/${data.org.slug}/admin`} className="hover:underline">
              Verwaltung
            </Link>
          )}
          <span>
            Auswertungen nur ab n ≥ {data.org.k_anonymity_min} pro Abteilung.
          </span>
        </>
      }
    />
  );
}
