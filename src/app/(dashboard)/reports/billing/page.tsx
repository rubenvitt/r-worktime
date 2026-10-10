import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { ReportsNav } from "@/components/reports/reports-nav";

export default function BillingReportPage() {
  return (
    <>
      <PageHeader
        title="Abrechnung"
        description="Abrechenbare Stunden nach Abrechnungsstatus."
        toolbar={<ReportsNav />}
      />
      <Panel>
        <EmptyState title="Folgt" description="Dieser Bericht ist in Arbeit." />
      </Panel>
    </>
  );
}
