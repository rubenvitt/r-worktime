import { cn } from "@/lib/utils";

function pct(value: number, scale: number): number {
  if (scale <= 0) return 0;
  return Math.max(0, Math.min(100, (value / scale) * 100));
}

/**
 * Soll-Balken: Ist bis Soll gefüllt, fehlendes Stück gedämpft, Mehrarbeit
 * in --positive, Soll als senkrechter Strich. Rein dekorativ (aria-hidden).
 */
export function TargetBar({
  actualMinutes,
  targetMinutes,
  scaleMinutes,
  running,
  className,
}: {
  actualMinutes: number;
  targetMinutes: number;
  scaleMinutes: number;
  running?: boolean;
  className?: string;
}) {
  const scale = Math.max(scaleMinutes, 1);
  const actual = Math.max(0, actualMinutes);
  const target = Math.max(0, targetMinutes);
  const hasTarget = target > 0;

  const filled = hasTarget ? Math.min(actual, target) : actual;
  const filledPct = pct(filled, scale);
  const missingPct =
    hasTarget && actual < target ? pct(target - actual, scale) : 0;
  const overPct =
    hasTarget && actual > target ? pct(actual, scale) - pct(target, scale) : 0;
  const targetPct = pct(target, scale);
  const endPct = filledPct + overPct;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative flex h-3 w-full min-w-12 items-center",
        className,
      )}
    >
      <div className="relative h-1.5 w-full overflow-hidden rounded-full">
        {filledPct > 0 ? (
          <div
            className={cn(
              "absolute inset-y-0 left-0",
              hasTarget ? "bg-foreground/70" : "bg-muted-foreground/50",
            )}
            style={{ width: `${filledPct}%` }}
          />
        ) : null}
        {missingPct > 0 ? (
          <div
            className="absolute inset-y-0 bg-muted"
            style={{ left: `${filledPct}%`, width: `${missingPct}%` }}
          />
        ) : null}
        {overPct > 0 ? (
          <div
            className="absolute inset-y-0 bg-positive"
            style={{ left: `${targetPct}%`, width: `${overPct}%` }}
          />
        ) : null}
        {running && endPct > 0 ? (
          <div
            className="absolute inset-y-0 w-1.5 bg-[repeating-linear-gradient(90deg,var(--card)_0_1px,transparent_1px_3px)]"
            style={{ left: `calc(${endPct}% - 6px)` }}
          />
        ) : null}
      </div>
      {hasTarget ? (
        <div
          className="absolute top-0 h-3 w-[1.5px] rounded-full bg-foreground"
          style={{ left: `calc(${targetPct}% - 0.75px)` }}
        />
      ) : null}
    </div>
  );
}
