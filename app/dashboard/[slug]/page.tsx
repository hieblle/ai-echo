import Link from "next/link";
import { notFound } from "next/navigation";
import { simulateWeek, updateRecommendationStatus } from "@/app/actions";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import {
  getDashboardData,
  monthOfIsoWeek,
} from "@/lib/server/dashboard-service";
import { getDemoStore } from "@/lib/server/store-instance";

// Stateful in-memory demo data — always render fresh.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getDashboardData(await getDemoStore(), slug);
  if (!data) notFound();

  const latestWeek = data.weeks[data.weeks.length - 1];
  const reportMonth = latestWeek ? monthOfIsoWeek(latestWeek) : null;
  const orgId = data.org.id;

  async function setStatus(formData: FormData) {
    "use server";
    await updateRecommendationStatus({
      orgId,
      ruleKey: formData.get("ruleKey"),
      context: formData.get("context"),
      status: formData.get("status"),
    });
  }

  return (
    <DashboardView
      data={data}
      orgSwitcher={data.orgs.map((o) => ({
        name: o.name,
        href: `/dashboard/${o.slug}`,
        active: o.id === data.org.id,
      }))}
      reportHref={reportMonth ? `/report/${data.org.slug}/${reportMonth}` : null}
      simulateAction={simulateWeek}
      recommendationAction={setStatus}
      emptyHint={
        <p>
          Für diese Organisation liegen noch keine Befragungsdaten vor.
          Spiele im <Link href="/demo" className="underline">Demo-Modus</Link>{" "}
          Befragungen durch oder wechsle zu einer der generierten Demo-Orgs.
        </p>
      }
      footer={
        <>
          <Link href="/" className="hover:underline">
            Startseite
          </Link>
          <Link href="/demo" className="hover:underline">
            Survey-Demo
          </Link>
          <span>
            Demo-Daten: deterministisch generiert, In-Memory (Neustart setzt
            zurück).
          </span>
        </>
      }
    />
  );
}
