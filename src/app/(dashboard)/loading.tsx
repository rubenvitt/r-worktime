import { PageContainer } from "@/components/app/page-container";
import { SkeletonRows, SkeletonStatStrip } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <PageContainer>
      <div className="mb-6 border-b pb-4" aria-hidden="true">
        <Skeleton className="h-7 w-60 max-w-full" />
      </div>
      <div className="space-y-6">
        <SkeletonStatStrip />
        <div className="rounded-lg border bg-card">
          <SkeletonRows count={8} />
        </div>
      </div>
      <span className="sr-only" role="status">
        Seite wird geladen …
      </span>
    </PageContainer>
  );
}
