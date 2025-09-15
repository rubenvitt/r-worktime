"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, formatHoursToTime, formatOvertimeHours } from "@/lib/utils";

interface OvertimeData {
  balance: number;
  details?: {
    actualHours: number;
    targetHours: number;
    overtimeHours: number;
  };
  lastUpdated: Date;
}

export function OvertimeCard() {
  const [overtimeData, setOvertimeData] = useState<OvertimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOvertimeData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        "/api/statistics/overtime?includeDetails=true",
      );
      if (!response.ok) throw new Error("Failed to fetch overtime data");

      const result = await response.json();
      setOvertimeData(result.data);
      setError(null);
    } catch (err) {
      setError("Fehler beim Laden der Überstunden");
      console.error("Error fetching overtime:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOvertimeData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchOvertimeData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchOvertimeData]);

  const isPositive = overtimeData?.balance ? overtimeData.balance >= 0 : true;

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-medium">
            Überstunden Gesamt
          </CardTitle>
          <CardDescription>Deine aktuelle Überstunden-Bilanz</CardDescription>
        </div>
        {isPositive ? (
          <TrendingUp className="h-5 w-5 text-green-600" />
        ) : (
          <TrendingDown className="h-5 w-5 text-red-600" />
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="animate-pulse">
            <div className="h-10 bg-gray-200 rounded w-32 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-48"></div>
          </div>
        ) : error ? (
          <div className="text-red-600">{error}</div>
        ) : overtimeData ? (
          <>
            <div
              className={cn(
                "text-3xl font-bold",
                isPositive ? "text-green-600" : "text-red-600",
              )}
            >
              {formatOvertimeHours(overtimeData.balance)}
            </div>
            {overtimeData.details && (
              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                <div>
                  Gearbeitet:{" "}
                  {formatHoursToTime(overtimeData.details.actualHours)}
                </div>
                <div>
                  Sollzeit:{" "}
                  {formatHoursToTime(overtimeData.details.targetHours)}
                </div>
                <div>
                  Differenz:{" "}
                  {formatOvertimeHours(overtimeData.details.overtimeHours)}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Zuletzt aktualisiert:{" "}
              {new Date(overtimeData.lastUpdated).toLocaleString("de-DE")}
            </p>
          </>
        ) : (
          <div>Keine Daten verfügbar</div>
        )}
      </CardContent>
    </Card>
  );
}
