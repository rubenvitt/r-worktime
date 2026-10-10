import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { ReportsNav } from "@/components/reports/reports-nav";

export default function YearReportPage() {
  return (
    <>
      <PageHeader
        title="Jahr & Prognose"
        description="Jahresverlauf und Prognose für die nächsten Monate aus Urlaub, Feiertagen und Vergangenheit."
        toolbar={<ReportsNav />}
      />
      <Panel>
        <EmptyState title="Folgt" description="Dieser Bericht ist in Arbeit." />
      </Panel>
    </>
  );
}
