"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, Calendar, CheckCircle, Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ProblemDayCard } from "@/components/problems/problem-day-card";
import { QuickEntryModal } from "@/components/problems/quick-entry-modal";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { ProblemDay, ProblemStats } from "@/types/problem";

export default function ProblemsPage() {
  const queryClient = useQueryClient();
  // Standard: Aktuelles Jahr vom 1. Januar bis heute
  const currentYear = new Date().getFullYear();
  const [filters, setFilters] = useState({
    problemType: "all",
    reviewStatus: "unreviewed",
    sortBy: "date_desc",
    startDate: format(
      new Date(currentYear, 0, 1), // 1. Januar des aktuellen Jahres
      "yyyy-MM-dd",
    ),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });

  const [selectedDay, setSelectedDay] = useState<ProblemDay | null>(null);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);

  // Fetch problems
  const { data, isLoading, error } = useQuery({
    queryKey: ["problems", filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters);
      const response = await fetch(`/api/problems?${params}`);
      if (!response.ok) throw new Error("Failed to fetch problems");
      return response.json();
    },
  });

  // Mark as reviewed mutation
  const markAsReviewedMutation = useMutation({
    mutationFn: async ({ date, reason }: { date: Date; reason?: string }) => {
      const response = await fetch("/api/problems/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: format(date, "yyyy-MM-dd"), reason }),
      });
      if (!response.ok) throw new Error("Failed to mark as reviewed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["problems"] });
      toast.success("Der Tag wurde als überprüft markiert.");
    },
    onError: () => {
      toast.error("Konnte den Tag nicht als überprüft markieren.");
    },
  });

  // Bulk review mutation
  const bulkReviewMutation = useMutation({
    mutationFn: async ({
      dates,
      reason,
    }: {
      dates: Date[];
      reason?: string;
    }) => {
      const response = await fetch("/api/problems/review", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dates: dates.map((d) => format(d, "yyyy-MM-dd")),
          reason,
        }),
      });
      if (!response.ok) throw new Error("Failed to mark as reviewed");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["problems"] });
      toast.success(data.message);
    },
    onError: () => {
      toast.error("Konnte die Tage nicht als überprüft markieren.");
    },
  });

  const problems: ProblemDay[] = data?.problems || [];
  const stats: ProblemStats = data?.stats || {
    totalProblems: 0,
    missingDays: 0,
    zeroHoursDays: 0,
    incompleteDays: 0,
  };

  const _getProblemTypeLabel = (type: string) => {
    switch (type) {
      case "missing":
        return "Fehlend";
      case "zero_hours":
        return "0 Stunden";
      case "incomplete":
        return "Unvollständig";
      default:
        return "Alle";
    }
  };

  const _getProblemTypeColor = (type: string) => {
    switch (type) {
      case "missing":
        return "destructive";
      case "zero_hours":
        return "secondary";
      case "incomplete":
        return "default";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Zeiterfassungsprobleme</h1>
        <p className="text-muted-foreground">
          Überprüfe und korrigiere Tage mit fehlenden oder unvollständigen
          Einträgen
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProblems}</div>
            <p className="text-xs text-muted-foreground">Problematische Tage</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fehlend</CardTitle>
            <Calendar className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.missingDays}</div>
            <p className="text-xs text-muted-foreground">Keine Einträge</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">0 Stunden</CardTitle>
            <Clock className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.zeroHoursDays}</div>
            <p className="text-xs text-muted-foreground">Keine Zeit erfasst</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unvollständig</CardTitle>
            <CheckCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.incompleteDays}</div>
            <p className="text-xs text-muted-foreground">Weniger als Soll</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>
            Zeitraum: {format(new Date(filters.startDate), "dd.MM.yyyy")} -{" "}
            {format(new Date(filters.endDate), "dd.MM.yyyy")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Zeitraum Quick-Filter */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              size="sm"
              variant={
                filters.startDate ===
                format(new Date(currentYear, 0, 1), "yyyy-MM-dd")
                  ? "default"
                  : "outline"
              }
              onClick={() =>
                setFilters({
                  ...filters,
                  startDate: format(new Date(currentYear, 0, 1), "yyyy-MM-dd"),
                  endDate: format(new Date(), "yyyy-MM-dd"),
                })
              }
            >
              Ganzes Jahr
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setFilters({
                  ...filters,
                  startDate: format(
                    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                    "yyyy-MM-dd",
                  ),
                  endDate: format(new Date(), "yyyy-MM-dd"),
                })
              }
            >
              Letzte 90 Tage
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setFilters({
                  ...filters,
                  startDate: format(
                    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                    "yyyy-MM-dd",
                  ),
                  endDate: format(new Date(), "yyyy-MM-dd"),
                })
              }
            >
              Letzte 30 Tage
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const now = new Date();
                const currentMonth = now.getMonth();
                setFilters({
                  ...filters,
                  startDate: format(
                    new Date(now.getFullYear(), currentMonth, 1),
                    "yyyy-MM-dd",
                  ),
                  endDate: format(new Date(), "yyyy-MM-dd"),
                });
              }}
            >
              Dieser Monat
            </Button>
          </div>

          {/* Filter-Optionen */}
          <div className="flex flex-wrap gap-4">
            <Select
              value={filters.problemType}
              onValueChange={(value) =>
                setFilters({ ...filters, problemType: value })
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Problem-Typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Probleme</SelectItem>
                <SelectItem value="missing">Fehlend</SelectItem>
                <SelectItem value="zero_hours">0 Stunden</SelectItem>
                <SelectItem value="incomplete">Unvollständig</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.reviewStatus}
              onValueChange={(value) =>
                setFilters({ ...filters, reviewStatus: value })
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Review-Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="unreviewed">Nicht überprüft</SelectItem>
                <SelectItem value="reviewed">Überprüft</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.sortBy}
              onValueChange={(value) =>
                setFilters({ ...filters, sortBy: value })
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sortierung" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date_desc">Neueste zuerst</SelectItem>
                <SelectItem value="date_asc">Älteste zuerst</SelectItem>
                <SelectItem value="type">Nach Typ</SelectItem>
              </SelectContent>
            </Select>

            {problems.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  const unreviewed = problems.filter(
                    (p) => p.type === "missing" && (p.isWeekend || p.isHoliday),
                  );
                  if (unreviewed.length > 0) {
                    bulkReviewMutation.mutate({
                      dates: unreviewed.map((p) => p.date),
                      reason: "Wochenende/Feiertag",
                    });
                  }
                }}
              >
                Wochenenden/Feiertage überprüfen
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Problem List */}
      <Card>
        <CardHeader>
          <CardTitle>Problematische Tage</CardTitle>
          <CardDescription>
            Klicke auf einen Tag um Details zu sehen und Aktionen durchzuführen
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton
                  key={`problem-skeleton-${i}`}
                  className="h-24 w-full"
                />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground">
              Fehler beim Laden der Daten
            </div>
          ) : problems.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium">Keine Probleme gefunden!</p>
              <p className="text-muted-foreground">
                Alle Tage im ausgewählten Zeitraum sind vollständig erfasst.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {problems.map((problem) => (
                <ProblemDayCard
                  key={format(problem.date, "yyyy-MM-dd")}
                  problem={problem}
                  onMarkAsReviewed={(reason) =>
                    markAsReviewedMutation.mutate({
                      date: problem.date,
                      reason,
                    })
                  }
                  onOpenQuickEntry={() => {
                    setSelectedDay(problem);
                    setQuickEntryOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Entry Modal */}
      {selectedDay && (
        <QuickEntryModal
          open={quickEntryOpen}
          onOpenChange={setQuickEntryOpen}
          date={selectedDay.date}
          suggestedHours={selectedDay.expectedHours - selectedDay.currentHours}
          onSuccess={() => {
            setQuickEntryOpen(false);
            queryClient.invalidateQueries({ queryKey: ["problems"] });
          }}
        />
      )}
    </div>
  );
}
