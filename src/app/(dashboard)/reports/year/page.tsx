import { Suspense } from "react";
import { SkeletonPanel, SkeletonStatStrip } from "@/components/app/skeletons";
import { ReportFallback } from "@/components/reports/report-header";
import { YearView } from "@/components/reports/year/year-view";

export default function YearReportPage() {
  // useSearchParams (?year, ?horizon, ?base) braucht eine Suspense-Grenze
  return (
    <Suspense
      fallback={
        <ReportFallback report="year">
          <SkeletonStatStrip tiles={4} />
          <SkeletonPanel lines={5} />
          <SkeletonPanel lines={8} />
        </ReportFallback>
      }
    >
      <YearView />
    </Suspense>
  );
}
