import { Duration } from "@/components/app/duration";
import { formatPercent } from "@/lib/format";
import type { BillingStatusRow } from "@/lib/reports/billing";
import { BILLING_CLASS_LABELS } from "@/lib/reports/billing-status";
import { cn } from "@/lib/utils";
import { BILLING_STATUS_COLORS, rawValueLabel } from "./billing-format";

/** Anteile aller Status als eine gestapelte Leiste mit Legende. */
export function BillingShareBar({
  statuses,
  totalMinutes,
}: {
  statuses: BillingStatusRow[];
  totalMinutes: number;
}) {
  const visible = statuses.filter((s) => s.minutes > 0);
  return (
    <div className="space-y-3">
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={visible
          .map((s) => `${s.label} ${formatPercent(s.share)}`)
          .join(", ")}
      >
        {visible.map((s) => (
          <div
            key={s.status}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(s.minutes / totalMinutes) * 100}%`,
              background: BILLING_STATUS_COLORS[s.status],
            }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {visible.map((s) => (
          <li key={s.status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ background: BILLING_STATUS_COLORS[s.status] }}
            />
            {s.label}
            <span className="num text-foreground">
              {formatPercent(s.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Status mit Rohwerten und Projektgruppen; leere Status bleiben sichtbar. */
export function BillingStatusList({
  statuses,
  bulkFillMinutes,
}: {
  statuses: BillingStatusRow[];
  bulkFillMinutes: number;
}) {
  return (
    <ul className="divide-y">
      {statuses.map((row) => (
        <li key={row.status} className="px-4 py-3">
          <div className="flex items-baseline gap-3">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 translate-y-[-1px] rounded-full"
              style={{ background: BILLING_STATUS_COLORS[row.status] }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={cn(
                    "text-sm font-medium",
                    row.minutes === 0 && "text-muted-foreground",
                  )}
                >
                  {row.label}
                </span>
                {row.status !== "notBillable" && row.status !== "unknown" ? (
                  <span className="text-xs text-muted-foreground">
                    {BILLING_CLASS_LABELS[row.billingClass]}
                  </span>
                ) : null}
              </div>
              {row.rawValues.length > 0 ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="sr-only">Rohwerte aus Timing: </span>
                  {row.rawValues.map((raw, index) => (
                    <span key={raw.raw ?? "__null__"}>
                      {index > 0 ? " · " : ""}
                      <code className="font-mono text-[11px]">
                        {rawValueLabel(raw.raw)}
                      </code>{" "}
                      <span className="num">
                        <Duration minutes={raw.minutes} />
                      </span>
                    </span>
                  ))}
                </p>
              ) : null}
              {row.status === "unknown" && bulkFillMinutes > 0 ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  davon <Duration minutes={bulkFillMinutes} /> aus dem Auffüllen
                  (ohne Status und Projekt)
                </p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              {row.minutes > 0 ? (
                <>
                  <Duration minutes={row.minutes} className="text-sm" />
                  <div className="num text-xs text-muted-foreground">
                    {formatPercent(row.share)}
                  </div>
                </>
              ) : (
                <span className="num text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>

          {row.projects.length > 0 ? (
            <ul className="mt-2 space-y-1.5 pl-5">
              {row.projects.map((project) => (
                <li key={project.name} className="text-[13px]">
                  <div className="flex items-baseline gap-3">
                    <span
                      className="min-w-0 flex-1 truncate"
                      title={project.name}
                    >
                      {project.name}
                    </span>
                    <Duration
                      minutes={project.minutes}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="num w-10 shrink-0 text-right text-xs text-muted-foreground">
                      {formatPercent(project.share)}
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="mt-1 h-1 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full rounded-full opacity-70"
                      style={{
                        width: `${project.share * 100}%`,
                        background: BILLING_STATUS_COLORS[row.status],
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
