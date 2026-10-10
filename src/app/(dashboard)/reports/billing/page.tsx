import { Suspense } from "react";
import {
  BillingSkeleton,
  BillingView,
} from "@/components/reports/billing/billing-view";
import { ReportFallback } from "@/components/reports/report-header";

export default function BillingReportPage() {
  // useSearchParams (?period, ?key, ?depth) braucht eine Suspense-Grenze
  return (
    <Suspense
      fallback={
        <ReportFallback report="billing">
          <BillingSkeleton />
        </ReportFallback>
      }
    >
      <BillingView />
    </Suspense>
  );
}
