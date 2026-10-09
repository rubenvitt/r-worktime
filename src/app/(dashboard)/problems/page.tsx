import { Suspense } from "react";
import { PageContainer } from "@/components/app/page-container";
import { SkeletonRows } from "@/components/app/skeletons";
import { ProblemsView } from "@/components/problems/problems-view";

export default function ProblemsPage() {
  // useSearchParams (?month) braucht eine Suspense-Grenze
  return (
    <Suspense
      fallback={
        <PageContainer>
          <div className="rounded-lg border bg-card">
            <SkeletonRows count={6} height={44} />
          </div>
        </PageContainer>
      }
    >
      <ProblemsView />
    </Suspense>
  );
}
