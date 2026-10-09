import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function SkeletonStatStrip({ tiles = 4 }: { tiles?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-px overflow-clip rounded-lg border bg-border md:grid-flow-col md:auto-cols-fr md:grid-cols-none"
    >
      {Array.from({ length: tiles }, (_, i) => (
        <div
          key={i}
          className={cn(
            "space-y-2 bg-card px-4 py-3",
            tiles % 2 === 1 && i === 0 && "col-span-2 md:col-span-1",
          )}
        >
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({
  count,
  height = 36,
}: {
  count: number;
  height?: number;
}) {
  return (
    <div aria-hidden="true" className="divide-y">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4"
          style={{ height }}
        >
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPanel({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-lg border bg-card", className)}
    >
      <div className="flex h-11 items-center border-b px-4">
        <Skeleton className="h-3.5 w-40" />
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton
            key={i}
            className="h-3"
            style={{ width: `${90 - ((i * 17) % 40)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** 2-px-Leiste beim Nachladen; sonst nichts. */
export function RefetchBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      role="progressbar"
      aria-label="Wird aktualisiert"
      className="relative h-0.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className="absolute inset-y-0 w-1/3 animate-refetch rounded-full bg-primary" />
    </div>
  );
}
