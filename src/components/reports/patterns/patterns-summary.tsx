import Link from "next/link";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import { isoWeekOf } from "@/lib/dates";
import { formatDateShort, formatDuration } from "@/lib/format";
import {
  type DayMinute,
  formatClock,
  type PatternSummary,
} from "@/lib/reports/patterns";

/** Kennzahlen des Zeitraums. */
export function PatternsSummary({
  summary,
  findingDays,
}: {
  summary: PatternSummary;
  findingDays: number;
}) {
  const latest = summary.latestEnds[0];
  return (
    <StatStrip>
      <Stat
        label="Ø Beginn"
        value={formatClock(summary.avgStartMinute)}
        hint={`Median ${formatClock(summary.medianStartMinute)} · frühester ${formatClock(summary.earliestStart.minute)}`}
      />
      <Stat
        label="Ø Ende"
        value={formatClock(summary.avgEndMinute)}
        hint={`Median ${formatClock(summary.medianEndMinute)}${latest ? ` · spätestes ${formatClock(latest.minute)}` : ""}`}
      />
      <Stat
        label="Ø Netto je Tag"
        value={formatDuration(summary.avgNetMinutes)}
        hint={`${summary.days} ${summary.days === 1 ? "Tag" : "Tage"} · gesamt ${formatDuration(summary.totalNetMinutes)}`}
      />
      <Stat
        label="Ø Pause"
        value={formatDuration(summary.avgBreakMinutes)}
        hint={`Ø Anwesenheit ${formatDuration(summary.avgSpanMinutes)}`}
      />
      <Stat
        label="Hinweise ArbZG"
        value={findingDays}
        tone={findingDays > 0 ? "warning" : "neutral"}
        hint={
          findingDays === 0
            ? "keine Auffälligkeiten"
            : findingDays === 1
              ? "Tag mit Hinweis"
              : "Tage mit Hinweis"
        }
        href="#arbzg"
      />
    </StatStrip>
  );
}

/** Extreme: früheste Beginne sind selten interessant, späte Enden schon. */
export function ExtremesList({ summary }: { summary: PatternSummary }) {
  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-xs text-muted-foreground">Späteste Enden</h3>
        <ol className="mt-2 space-y-1">
          {summary.latestEnds.map((item, index) => (
            <ExtremeRow key={item.date} item={item} rank={index + 1} />
          ))}
        </ol>
      </div>
      <div>
        <h3 className="text-xs text-muted-foreground">Frühester Beginn</h3>
        <ol className="mt-2">
          <ExtremeRow item={summary.earliestStart} />
        </ol>
      </div>
    </div>
  );
}

function ExtremeRow({ item, rank }: { item: DayMinute; rank?: number }) {
  const { year, week } = isoWeekOf(item.date);
  return (
    <li>
      <Link
        href={`/week/${year}/${week}`}
        className="-mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 text-sm transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring md:min-h-8"
      >
        {rank ? (
          <span className="num w-4 text-xs text-muted-foreground">{rank}</span>
        ) : null}
        <span className="num flex-1">{formatDateShort(item.date)}</span>
        <span className="num font-medium">{formatClock(item.minute)}</span>
      </Link>
    </li>
  );
}
