import { Suspense } from "react";
import { SkeletonPanel, SkeletonStatStrip } from "@/components/app/skeletons";
import { AbsencesView } from "@/components/reports/absences/absences-view";
import { ReportFallback } from "@/components/reports/report-header";

export default function AbsencesReportPage() {
  // useSearchParams (?year) braucht eine Suspense-Grenze
  return (
    <Suspense
      fallback={
        <ReportFallback report="absences">
          <SkeletonStatStrip tiles={4} />
          <SkeletonPanel lines={6} />
        </ReportFallback>
      }
    >
      <AbsencesView />
    </Suspense>
  );
}
