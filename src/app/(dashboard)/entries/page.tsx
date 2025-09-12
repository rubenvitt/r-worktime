"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Filter, RefreshCw, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { EntryType, type TimeEntry } from "@/types/database";

interface TimeEntriesResponse {
  entries: TimeEntry[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

const entryTypeLabels: Record<EntryType, string> = {
  [EntryType.WORK]: "Arbeit",
  [EntryType.OVERTIME]: "Überstunden",
  [EntryType.VACATION]: "Urlaub",
  [EntryType.SICK]: "Krank",
  [EntryType.HOLIDAY]: "Feiertag",
};

export default function EntriesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntryType | "all">("all");
  const [sortBy, setSortBy] = useState<"date" | "duration">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const limit = 20;

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch time entries
  const { data, isLoading, error, refetch } = useQuery<TimeEntriesResponse>({
    queryKey: ["time-entries", page, search, typeFilter, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder,
        ...(search && { search }),
        ...(typeFilter !== "all" && { type: typeFilter }),
      });

      const response = await fetch(`/api/time-entries?${params}`);
      if (!response.ok) throw new Error("Failed to fetch entries");
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  // Delete entry mutation
  const deleteMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const response = await fetch(`/api/time-entries/${entryId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete entry");
    },
    onSuccess: () => {
      toast({
        title: "Eintrag gelöscht",
        description: "Der Zeiteintrag wurde erfolgreich gelöscht.",
      });
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["statistics"] });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Fehler beim Löschen",
        description:
          error instanceof Error ? error.message : "Ein Fehler ist aufgetreten",
      });
    },
  });

  const formatDuration = (duration: number) => {
    const hours = Math.floor(duration);
    const minutes = Math.round((duration - hours) * 60);
    return `${hours}h ${minutes}m`;
  };

  const formatTime = (dateTime: Date) => {
    return format(new Date(dateTime), "HH:mm", { locale: de });
  };

  const formatDate = (date: Date) => {
    return format(new Date(date), "dd.MM.yyyy", { locale: de });
  };

  const handleSort = (column: "date" | "duration") => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Zeiteinträge
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Verwalten Sie Ihre importierten Zeiteinträge
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Zeiteinträge</CardTitle>
          <CardDescription>
            Durchsuchen und verwalten Sie alle Zeiteinträge
          </CardDescription>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Nach Beschreibung suchen..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setTypeFilter(value as EntryType | "all")
              }
            >
              <SelectTrigger className="w-40">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Typ filtern" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                {Object.entries(entryTypeLabels).map(([type, label]) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Aktualisieren
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {error ? (
            <div className="text-center py-8">
              <p className="text-red-600 mb-4">Fehler beim Laden der Daten</p>
              <Button onClick={() => refetch()}>Erneut versuchen</Button>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        onClick={() => handleSort("date")}
                      >
                        Datum{" "}
                        {sortBy === "date" && (sortOrder === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead>Startzeit</TableHead>
                      <TableHead>Endzeit</TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        onClick={() => handleSort("duration")}
                      >
                        Dauer{" "}
                        {sortBy === "duration" &&
                          (sortOrder === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead className="w-[50px]">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      // Loading skeleton
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={`skeleton-row-${i}`}>
                          {Array.from({ length: 7 }).map((_, j) => (
                            <TableCell key={`skeleton-cell-${j}`}>
                              <div className="h-4 bg-gray-200 rounded animate-pulse" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : data?.entries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <p className="text-gray-500">
                            Keine Einträge gefunden
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      data?.entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">
                            {formatDate(entry.date)}
                          </TableCell>
                          <TableCell>{formatTime(entry.startTime)}</TableCell>
                          <TableCell>{formatTime(entry.endTime)}</TableCell>
                          <TableCell className="font-medium">
                            {formatDuration(Number(entry.duration))}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              {entryTypeLabels[entry.type]}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {entry.description || "-"}
                          </TableCell>
                          <TableCell>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Eintrag löschen
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Sind Sie sicher, dass Sie diesen Zeiteintrag
                                    löschen möchten? Diese Aktion kann nicht
                                    rückgängig gemacht werden.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    Abbrechen
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-red-600 hover:bg-red-700"
                                    onClick={() =>
                                      deleteMutation.mutate(entry.id)
                                    }
                                    disabled={deleteMutation.isPending}
                                  >
                                    {deleteMutation.isPending
                                      ? "Lösche..."
                                      : "Löschen"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-4">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    Zeige {(page - 1) * limit + 1} bis{" "}
                    {Math.min(page * limit, data.totalCount)} von{" "}
                    {data.totalCount} Einträgen
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page <= 1}
                    >
                      Vorherige
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= data.totalPages}
                    >
                      Nächste
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
