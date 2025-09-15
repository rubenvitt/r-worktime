"use client";

import { Calendar } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatHoursToTime, formatOvertimeHours } from "@/lib/utils";

interface YearlyOvertimeData {
  balance: number;
  details?: {
    actualHours: number;
    targetHours: number;
    overtimeHours: number;
  };
}

export function OvertimeYearSelector() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [overtimeData, setOvertimeData] = useState<YearlyOvertimeData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const fetchYearlyOvertime = useCallback(async (year: string) => {
    try {
      setLoading(true);
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const response = await fetch(
        `/api/statistics/overtime?startDate=${startDate}&endDate=${endDate}&includeDetails=true`,
      );

      if (!response.ok) throw new Error("Failed to fetch overtime data");

      const result = await response.json();
      setOvertimeData(result.data);
    } catch (err) {
      console.error("Error fetching yearly overtime:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchYearlyOvertime(selectedYear);
  }, [selectedYear, fetchYearlyOvertime]);

  const isPositive = overtimeData?.balance ? overtimeData.balance >= 0 : true;

  // Generate year options (current year and 5 years back)
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">
              Jahres-Überstunden
            </CardTitle>
            <CardDescription>
              Überstunden für ein spezifisches Jahr
            </CardDescription>
          </div>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-24 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-32"></div>
          </div>
        ) : overtimeData ? (
          <>
            <div
              className={cn(
                "text-2xl font-bold mb-2",
                isPositive ? "text-green-600" : "text-red-600",
              )}
            >
              {formatOvertimeHours(overtimeData.balance)}
            </div>
            {overtimeData.details && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <div>
                  Gearbeitet:{" "}
                  {formatHoursToTime(overtimeData.details.actualHours)}
                </div>
                <div>
                  Sollzeit:{" "}
                  {formatHoursToTime(overtimeData.details.targetHours)}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Keine Daten</div>
        )}
      </CardContent>
    </Card>
  );
}
