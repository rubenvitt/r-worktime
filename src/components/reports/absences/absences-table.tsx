import type * as React from "react";
import { formatMonth } from "@/lib/format";
import {
  ABSENCE_CATEGORIES,
  type AbsenceMonth,
  type CategoryValues,
} from "@/lib/reports/absences";
import { cn } from "@/lib/utils";
import { formatDayCount } from "./absence-style";

function sum(values: CategoryValues): number {
  return ABSENCE_CATEGORIES.reduce((total, c) => total + values[c], 0);
}

/** Sonder- und Bildungsurlaub teilen sich Spalte und Farbe. */
function special(values: CategoryValues): number {
  return values.specialLeave + values.educationalLeave;
}

function Cell({
  value,
  className,
  children,
}: {
  value?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <td
      className={cn(
        "num px-3 py-2 text-right",
        value === 0 && "text-muted-foreground",
        className,
      )}
    >
      {children ?? formatDayCount(value ?? 0)}
    </td>
  );
}

/** Abwesenheitstage je Monat als Tabelle; mobil horizontal scrollbar. */
export function AbsencesTable({
  months,
  totals,
  showUnpaid,
  showSpecial = false,
  showOvertimeReduction = false,
}: {
  months: AbsenceMonth[];
  totals: CategoryValues;
  showUnpaid: boolean;
  /** Spalte Sonder-/Bildungsurlaub */
  showSpecial?: boolean;
  /** Spalte Überstundenabbau */
  showOvertimeReduction?: boolean;
}) {
  const totalPlanned = months.reduce(
    (acc, m) => acc + m.plannedVacationDays,
    0,
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <caption className="sr-only">Abwesenheitstage je Monat</caption>
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Monat
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Urlaub
            </th>
            {showSpecial ? (
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Sonder-/Bildungsurlaub
              </th>
            ) : null}
            {showOvertimeReduction ? (
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Überstundenabbau
              </th>
            ) : null}
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Krankheit
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Feiertage
            </th>
            {showUnpaid ? (
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Unbezahlt
              </th>
            ) : null}
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Summe
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {months.map((month) => {
            const total = sum(month.days);
            return (
              <tr key={month.month}>
                <th
                  scope="row"
                  className={cn(
                    "px-3 py-2 text-left font-normal",
                    total === 0 && "text-muted-foreground",
                  )}
                >
                  {formatMonth(month.month).split(" ")[0]}
                </th>
                <Cell value={month.days.vacation}>
                  {month.days.vacation === 0 ? undefined : (
                    <>
                      {formatDayCount(month.days.vacation)}
                      {month.plannedVacationDays > 0 ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({formatDayCount(month.plannedVacationDays)} geplant)
                        </span>
                      ) : null}
                    </>
                  )}
                </Cell>
                {showSpecial ? <Cell value={special(month.days)} /> : null}
                {showOvertimeReduction ? (
                  <Cell value={month.days.overtimeReduction} />
                ) : null}
                <Cell value={month.days.sick} />
                <Cell value={month.days.holiday} />
                {showUnpaid ? <Cell value={month.days.unpaid} /> : null}
                <Cell value={total} className="font-medium" />
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <th scope="row" className="px-3 py-2 text-left">
              Jahr
            </th>
            <Cell value={totals.vacation}>
              {totals.vacation === 0 ? undefined : (
                <>
                  {formatDayCount(totals.vacation)}
                  {totalPlanned > 0 ? (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({formatDayCount(totalPlanned)} geplant)
                    </span>
                  ) : null}
                </>
              )}
            </Cell>
            {showSpecial ? <Cell value={special(totals)} /> : null}
            {showOvertimeReduction ? (
              <Cell value={totals.overtimeReduction} />
            ) : null}
            <Cell value={totals.sick} />
            <Cell value={totals.holiday} />
            {showUnpaid ? <Cell value={totals.unpaid} /> : null}
            <Cell value={sum(totals)} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
