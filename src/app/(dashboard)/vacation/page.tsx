import { Suspense } from "react";
import { PageContainer } from "@/components/app/page-container";
import { SkeletonPanel, SkeletonStatStrip } from "@/components/app/skeletons";
import { VacationPlannerView } from "@/components/vacation-planner/planner-view";

export default function VacationPlannerPage() {
  // useSearchParams (?year) braucht eine Suspense-Grenze
  return (
    <PageContainer width="wide">
      <Suspense
        fallback={
          <div className="space-y-6" aria-busy="true">
            <SkeletonStatStrip tiles={4} />
            <SkeletonPanel lines={10} />
          </div>
        }
      >
        <VacationPlannerView />
      </Suspense>
    </PageContainer>
  );
}
