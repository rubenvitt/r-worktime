"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface HolidayStatus {
  year: number;
  exists: boolean;
  count: number;
}

interface ImportResult {
  created: number;
  skipped?: number;
  error?: string;
}

async function fetchStatus(year: number): Promise<HolidayStatus> {
  const response = await fetch(`/api/holidays?year=${year}`);
  if (!response.ok) {
    throw new Error("Der Stand der Feiertage konnte nicht geladen werden.");
  }
  return response.json();
}

async function importYear(year: number): Promise<ImportResult> {
  const response = await fetch("/api/holidays", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ year }),
  });
  const data = (await response.json().catch(() => ({}))) as ImportResult;
  if (!response.ok) {
    throw new Error(
      data.error || "Die Feiertage konnten nicht importiert werden.",
    );
  }
  return data;
}

/** Eine Zeile je Jahr: Stand und Import-Button. */
function HolidayYearRow({ year }: { year: number }) {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["holidays", "status", year],
    queryFn: () => fetchStatus(year),
  });
  const mutation = useMutation({
    mutationFn: () => importYear(year),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays", "status", year] });
      // Planer und Berichte zeigen importierte Feiertage
      queryClient.invalidateQueries({ queryKey: ["vacation-planner"] });
    },
  });

  if (status.isPending) {
    return <Skeleton className="h-9 w-64 max-w-full" />;
  }

  const imported = status.data?.exists ?? false;
  const count = status.data?.count ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm">
          {imported ? (
            <CircleCheck
              className="mt-0.5 size-4 shrink-0 text-positive"
              aria-hidden="true"
            />
          ) : null}
          <span>
            <span className="font-medium tabular-nums">{year}</span>
            {" · "}
            {status.isError
              ? "Stand unbekannt"
              : imported
                ? `${count} Feiertage importiert`
                : "noch nicht importiert"}
          </span>
        </p>
        {imported ? null : (
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            variant="outline"
            className="h-11 w-full sm:h-9 sm:w-auto"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Importiere …
              </>
            ) : (
              `Feiertage ${year} importieren`
            )}
          </Button>
        )}
      </div>
      {mutation.isSuccess && mutation.data.created === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {mutation.data.skipped
            ? `Die Feiertage für ${year} sind schon da.`
            : "Es gab keine Feiertage zum Importieren."}
        </p>
      ) : null}
      {mutation.isError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/** Feiertage des laufenden und des nächsten Jahres importieren (im Abschnittsstil, ohne eigene Karte). */
export function HolidayImport() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-3">
      <p className="max-w-prose text-sm text-muted-foreground">
        Offizielle Feiertage kommen automatisch aus dem Feiertags-Dienst und
        mindern das Soll. Der Import legt sie zusätzlich als Einträge an – als
        Rückfall, falls der Dienst nicht erreichbar ist, und als Grundlage für
        Feiertage in Timing.
      </p>
      <HolidayYearRow year={currentYear} />
      <HolidayYearRow year={currentYear + 1} />
    </div>
  );
}
