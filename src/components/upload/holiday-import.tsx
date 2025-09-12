"use client";

import { AlertCircle, CalendarDays, CheckCircle, InfoIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
    console.log("Starting holiday import for year:", currentYear);
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

      console.log("Response status:", response.status);
      const data = await response.json();
      console.log("Response data:", data);

      if (response.ok) {
        if (data.created > 0) {
          setSuccess(data.message);
          setHolidaysExist(true);
          setHolidayCount(data.created);
        } else if (data.skipped > 0) {
          setError(`Feiertage für ${currentYear} existieren bereits.`);
          setHolidaysExist(true);
          setHolidayCount(data.skipped);
        } else {
          setError("Keine Feiertage zum Importieren gefunden.");
        }
      } else {
        setError(data.error || "Fehler beim Importieren der Feiertage");
      }
    } catch (err) {
      console.error("Error importing holidays:", err);
      setError("Netzwerkfehler beim Importieren der Feiertage");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return null;
  }

  if (holidaysExist && !success) {
    return (
      <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertTitle className="text-green-800 dark:text-green-300">
          Feiertage bereits importiert
        </AlertTitle>
        <AlertDescription className="text-green-700 dark:text-green-400">
          Es wurden bereits {holidayCount} Feiertage für {currentYear}{" "}
          importiert.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {!holidaysExist && !success && (
        <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
          <InfoIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertTitle className="text-blue-800 dark:text-blue-300">
            Feiertage importieren
          </AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-400">
            Die Feiertage für {currentYear} wurden noch nicht importiert. Klicke
            auf den Button, um deutsche Feiertage (Niedersachsen) automatisch zu
            laden.
          </AlertDescription>
          <div className="mt-4">
            <Button
              onClick={importHolidays}
              disabled={loading}
              variant="outline"
              className="gap-2"
            >
              <CalendarDays className="h-4 w-4" />
              {loading
                ? "Importiere..."
                : `Feiertage ${currentYear} importieren`}
            </Button>
          </div>
        </Alert>
      )}

      {error && (
        <Alert className="bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <AlertTitle className="text-red-800 dark:text-red-300">
            Fehler
          </AlertTitle>
          <AlertDescription className="text-red-700 dark:text-red-400">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle className="text-green-800 dark:text-green-300">
            Erfolgreich importiert
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-400">
            {success}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
