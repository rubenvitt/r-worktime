import { Suspense } from "react";
import { Panel } from "@/components/app/panel";
import { SkeletonRows, SkeletonStatStrip } from "@/components/app/skeletons";
import { ReportFallback } from "@/components/reports/report-header";
import { TravelReport } from "@/components/reports/travel/travel-report";

export default function TravelReportPage() {
  // useSearchParams (?year) braucht eine Suspense-Grenze
  return (
    <Suspense
      fallback={
        <ReportFallback report="travel">
          <SkeletonStatStrip tiles={4} />
          <Panel>
            <SkeletonRows count={6} height={52} />
          </Panel>
        </ReportFallback>
      }
    >
      <TravelReport />
    </Suspense>
  );
}
