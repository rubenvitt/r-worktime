import { Suspense } from "react";
import { PageContainer } from "@/components/app/page-container";
import { SkeletonRows } from "@/components/app/skeletons";
import { EntriesView } from "@/components/entries/entries-view";

export default function EntriesPage() {
  // useSearchParams (?dateFrom, ?dateTo) braucht eine Suspense-Grenze
  return (
    <Suspense
      fallback={
        <PageContainer width="wide">
          <div className="rounded-lg border bg-card">
            <SkeletonRows count={10} />
          </div>
        </PageContainer>
      }
    >
      <EntriesView />
    </Suspense>
  );
}
