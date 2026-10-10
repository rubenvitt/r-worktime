import { Suspense } from "react";
import {
  PatternsSkeleton,
  PatternsView,
} from "@/components/reports/patterns/patterns-view";
import { ReportFallback } from "@/components/reports/report-header";

export default function PatternsReportPage() {
  // useSearchParams (?period, ?key) braucht eine Suspense-Grenze
  return (
    <Suspense
      fallback={
        <ReportFallback report="patterns">
          <PatternsSkeleton />
        </ReportFallback>
      }
    >
      <PatternsView />
    </Suspense>
  );
}
