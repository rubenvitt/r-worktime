import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { ReportsNav } from "@/components/reports/reports-nav";

export default function ProjectsReportPage() {
  return (
    <>
      <PageHeader
        title="Projekte"
        description="Stunden je Projekt und Kunde im gewählten Zeitraum."
        toolbar={<ReportsNav />}
      />
      <Panel>
        <EmptyState title="Folgt" description="Dieser Bericht ist in Arbeit." />
      </Panel>
    </>
  );
}
