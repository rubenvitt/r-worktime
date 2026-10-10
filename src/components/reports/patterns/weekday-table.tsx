import { formatDuration } from "@/lib/format";
import {
  formatClock,
  WEEKDAY_SHORT,
  type WeekdayPattern,
} from "@/lib/reports/patterns";

const WEEKDAY_LONG: Record<number, string> = {
  0: "Sonntag",
  1: "Montag",
  2: "Dienstag",
  3: "Mittwoch",
  4: "Donnerstag",
  5: "Freitag",
  6: "Samstag",
};

function dash(value: number | null, format: (v: number) => string) {
  return value === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    format(value)
  );
}

/** Je Wochentag: Anzahl Tage, Ø Beginn/Ende, Ø Netto (mit Balken) und Ø Pause. */
export function WeekdayTable({ weekdays }: { weekdays: WeekdayPattern[] }) {
  const maxNet = Math.max(1, ...weekdays.map((w) => w.avgNetMinutes ?? 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <caption className="sr-only">Durchschnittswerte je Wochentag</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-2 font-normal">
              Tag
            </th>
            <th scope="col" className="px-2 py-2 text-right font-normal">
              Tage
            </th>
            <th scope="col" className="px-2 py-2 text-right font-normal">
              Ø Beginn
            </th>
            <th scope="col" className="px-2 py-2 text-right font-normal">
              Ø Ende
            </th>
            <th scope="col" className="px-2 py-2 font-normal">
              Ø Netto
            </th>
            <th scope="col" className="px-4 py-2 text-right font-normal">
              Ø Pause
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {weekdays.map((w) => (
            <tr
              key={w.weekday}
              className={w.days === 0 ? "text-muted-foreground" : undefined}
            >
              <th scope="row" className="px-4 py-2 text-left font-medium">
                <abbr title={WEEKDAY_LONG[w.weekday]} className="no-underline">
                  {WEEKDAY_SHORT[w.weekday]}
                </abbr>
              </th>
              <td className="num px-2 py-2 text-right">{w.days}</td>
              <td className="num px-2 py-2 text-right">
                {dash(w.avgStartMinute, formatClock)}
              </td>
              <td className="num px-2 py-2 text-right">
                {dash(w.avgEndMinute, formatClock)}
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <span className="num w-10 shrink-0 text-right">
                    {dash(w.avgNetMinutes, formatDuration)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-2 min-w-0 flex-1 overflow-hidden rounded-xs bg-muted"
                  >
                    <span
                      className="block h-full rounded-xs bg-chart-actual"
                      style={{
                        width: `${((w.avgNetMinutes ?? 0) / maxNet) * 100}%`,
                      }}
                    />
                  </span>
                </div>
              </td>
              <td className="num px-4 py-2 text-right">
                {dash(w.avgBreakMinutes, formatDuration)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
