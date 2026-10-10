"use client";

import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Feiertage des laufenden Jahres importieren (im Abschnittsstil, ohne eigene Karte). */
export function HolidayImport() {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [holidaysExist, setHolidaysExist] = useState(false);
  const [holidayCount, setHolidayCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  const checkHolidaysExist = useCallback(async () => {
    try {
      setChecking(true);
      const response = await fetch(`/api/holidays?year=${currentYear}`);
      const data = await response.json();

      if (response.ok) {
        setHolidaysExist(data.exists);
        setHolidayCount(data.count);
      }
    } catch (err) {
      console.error("Error checking holidays:", err);
    } finally {
      setChecking(false);
    }
  }, [currentYear]);

  useEffect(() => {
    checkHolidaysExist();
  }, [checkHolidaysExist]);

  const importHolidays = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/holidays", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ year: currentYear }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.created > 0) {
          setSuccess(
            `${data.created} Feiertage für ${currentYear} importiert.`,
          );
          setHolidaysExist(true);
          setHolidayCount(data.created);
        } else if (data.skipped > 0) {
          setError(`Die Feiertage für ${currentYear} sind schon da.`);
          setHolidaysExist(true);
          setHolidayCount(data.skipped);
        } else {
          setError("Es gab keine Feiertage zum Importieren.");
        }
      } else {
        setError(
          data.error || "Die Feiertage konnten nicht importiert werden.",
        );
      }
    } catch (err) {
      console.error("Error importing holidays:", err);
      setError(
        "Die Feiertage konnten nicht importiert werden. Prüf deine Verbindung und versuch es noch einmal.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return <Skeleton className="h-5 w-64 max-w-full" />;
  }

  if (holidaysExist) {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm">
          <CircleCheck
            className="mt-0.5 size-4 shrink-0 text-positive"
            aria-hidden="true"
          />
          <span>
            {success ??
              `${holidayCount} Feiertage für ${currentYear} sind importiert.`}
          </span>
        </p>
        {error && !success ? (
          <p className="text-[13px] text-muted-foreground">{error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="max-w-prose text-sm text-muted-foreground">
        Offizielle Feiertage kommen automatisch aus dem Feiertags-Dienst und
        mindern das Soll. Der Import legt sie für {currentYear} zusätzlich als
        Einträge an – als Rückfall, falls der Dienst nicht erreichbar ist.
      </p>
      <Button
        type="button"
        onClick={importHolidays}
        disabled={loading}
        variant="outline"
        className="h-11 w-full sm:h-9 sm:w-auto"
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Importiere …
          </>
        ) : (
          `Feiertage ${currentYear} importieren`
        )}
      </Button>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
