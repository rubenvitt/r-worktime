"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, ArrowRight, CheckCircle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProblemDay, ProblemStats } from "@/types/problem";

export function ProblemsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["problems-widget"],
    queryFn: async () => {
      const endDate = format(new Date(), "yyyy-MM-dd");
      const startDate = format(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        "yyyy-MM-dd",
      );

      const params = new URLSearchParams({
        startDate,
        endDate,
        reviewStatus: "unreviewed",
        sortBy: "date_desc",
      });

      const response = await fetch(`/api/problems?${params}`);
      if (!response.ok) throw new Error("Failed to fetch problems");
      return response.json();
    },
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  const problems: ProblemDay[] = data?.problems || [];
  const stats: ProblemStats = data?.stats || {
    totalProblems: 0,
    missingDays: 0,
    zeroHoursDays: 0,
    incompleteDays: 0,
  };
  const recentProblems = problems.slice(0, 5);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Zeiterfassungsprobleme</CardTitle>
          <CardDescription>Letzte 7 Tage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={`widget-skeleton-${i}`} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {stats.totalProblems > 0 ? (
                <>
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Zeiterfassungsprobleme
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Alles in Ordnung
                </>
              )}
            </CardTitle>
            <CardDescription>
              {stats.totalProblems > 0
                ? `${stats.totalProblems} Tage mit Problemen (letzte 7 Tage)`
                : "Keine Probleme in den letzten 7 Tagen"}
            </CardDescription>
          </div>
          {stats.totalProblems > 0 && (
            <Badge variant="destructive" className="text-lg px-3 py-1">
              {stats.totalProblems}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {stats.totalProblems === 0 ? (
          <div className="text-center py-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Alle Tage sind vollständig erfasst
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {recentProblems.map((problem) => {
                const typeLabel =
                  problem.type === "missing"
                    ? "Fehlend"
                    : problem.type === "zero_hours"
                      ? "0 Stunden"
                      : "Unvollständig";

                const typeColor =
                  problem.type === "missing"
                    ? "destructive"
                    : problem.type === "zero_hours"
                      ? "secondary"
                      : "default";

                return (
                  <div
                    key={format(new Date(problem.date), "yyyy-MM-dd")}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {format(new Date(problem.date), "dd.MM.")}
                      </span>
                      <Badge
                        variant={
                          typeColor as
                            | "default"
                            | "destructive"
                            | "secondary"
                            | "outline"
                            | null
                            | undefined
                        }
                        className="text-xs"
                      >
                        {typeLabel}
                      </Badge>
                      {problem.isWeekend && (
                        <Badge variant="outline" className="text-xs">
                          WE
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {problem.currentHours.toFixed(1)}/
                      {problem.expectedHours.toFixed(1)}h
                    </span>
                  </div>
                );
              })}
            </div>

            {problems.length > 5 && (
              <p className="text-xs text-muted-foreground text-center mb-3">
                +{problems.length - 5} weitere Probleme
              </p>
            )}

            <Link href="/problems" className="block">
              <Button className="w-full" variant="outline">
                Alle Probleme anzeigen
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
