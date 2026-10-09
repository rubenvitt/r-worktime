import { SkeletonRows, SkeletonStatStrip } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Platzhalter unter dem Seitenkopf: Kennzahlen, Tabs, 7 Tageszeilen. */
export function WeekViewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <SkeletonStatStrip tiles={4} />
      <div className="space-y-3">
        <Skeleton className="h-9 w-44" />
        <div className="rounded-lg border bg-card">
          <SkeletonRows count={7} height={44} />
        </div>
      </div>
    </div>
  );
}
