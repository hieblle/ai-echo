import Link from "next/link";
import { notFound } from "next/navigation";
import { CopilotView } from "@/components/copilot/copilot-view";
import { getCopilotPageData } from "@/lib/server/copilot-service";
import { getDemoStore } from "@/lib/server/store-instance";

// Stateful in-memory demo data — always render fresh.
export const dynamic = "force-dynamic";

export default async function DemoCopilotPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getDemoStore();
  const org = await store.getOrganizationBySlug(slug);
  if (!org) notFound();
  const data = await getCopilotPageData(store, org, "org_admin");
  return (
    <CopilotView
      data={data}
      adminHref={null}
      dashboardHref={`/dashboard/${org.slug}`}
      footer={
        <>
          <Link href="/" className="hover:underline">
            Startseite
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
