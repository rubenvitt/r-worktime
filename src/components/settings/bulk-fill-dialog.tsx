"use client";

import { CircleCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface BulkFillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weeklyWorkHours?: number;
}

interface PreviewData {
  created: number;
  skipped: number;
  skipReasons: {
    weekend: number;
    holiday: number;
    existing: number;
  };
  totalDays: number;
  message: string;
}

export function BulkFillDialog({
  open,
  onOpenChange,
  weeklyWorkHours = 40,
}: BulkFillDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  // Form State
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dailyHours, setDailyHours] = useState(
    (weeklyWorkHours / 5).toFixed(2),
  );
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [description, setDescription] = useState("Manuelle Arbeitszeit");
  const [skipExisting, setSkipExisting] = useState(true);

  const handlePreview = async () => {
    if (!startDate || !endDate) {
      toast({
        title: "Zeitraum fehlt",
        description: "Wähl ein Start- und ein Enddatum.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/time-entries/bulk-fill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dailyHours: parseFloat(dailyHours),
          startTime,
          endTime,
          description,
          skipExisting,
          preview: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Die Vorschau konnte nicht geladen werden.",
        );
      }

      const data = await response.json();
      setPreview(data);
    } catch (error) {
      console.error("Preview error:", error);
      toast({
        title: "Auffüllen fehlgeschlagen",
        description:
          error instanceof Error
            ? error.message
            : "Die Vorschau konnte nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!startDate || !endDate) {
      toast({
        title: "Zeitraum fehlt",
        description: "Wähl ein Start- und ein Enddatum.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/time-entries/bulk-fill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dailyHours: parseFloat(dailyHours),
          startTime,
          endTime,
          description,
          skipExisting,
          preview: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Die Einträge konnten nicht angelegt werden.",
        );
      }

      const data = await response.json();

      toast({
        title: "Arbeitstage aufgefüllt",
        description: data.message,
      });

      // Reset form und schließe Dialog
      setPreview(null);
      onOpenChange(false);

      // Optional: Reload page to show new entries
      window.location.reload();
    } catch (error) {
      console.error("Submit error:", error);
      toast({
        title: "Auffüllen fehlgeschlagen",
        description:
          error instanceof Error
            ? error.message
            : "Die Einträge konnten nicht angelegt werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPreview(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Arbeitstage auffüllen</DialogTitle>
          <DialogDescription>
            Trägt an jedem Arbeitstag im Zeitraum einen Eintrag mit deinen
            Standardzeiten ein. Gut zum Nachtragen von Wochen vor deinem ersten
            Sync.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="startDate">Von</Label>
              <Input
                id="startDate"
                type="date"
                className="num w-full min-w-0"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="endDate">Bis</Label>
              <Input
                id="endDate"
                type="date"
                className="num w-full min-w-0"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="dailyHours">Stunden pro Tag</Label>
              <Input
                id="dailyHours"
                type="number"
                inputMode="decimal"
                className="num"
                step="0.25"
                min="0.25"
                max="24"
                value={dailyHours}
                onChange={(e) => setDailyHours(e.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="startTime">Start</Label>
              <Input
                id="startTime"
                type="time"
                className="num"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="endTime">Ende</Label>
              <Input
                id="endTime"
                type="time"
                className="num"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Beschreibung</Label>
            <Input
              id="description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex min-h-11 items-center gap-2 sm:min-h-0">
            <Checkbox
              id="skipExisting"
              checked={skipExisting}
              onCheckedChange={(checked) => setSkipExisting(checked as boolean)}
            />
            <Label
              htmlFor="skipExisting"
              className="cursor-pointer text-sm font-normal"
            >
              Tage mit vorhandenen Einträgen überspringen
            </Label>
          </div>

          <div className="space-y-1 text-[13px] text-muted-foreground">
            <p>
              Übersprungen werden immer Wochenenden und Tage, an denen schon ein
              Feiertag eingetragen ist. Der Zeitraum darf höchstens ein Jahr
              lang sein.
            </p>
            <p>
              Erst siehst du eine Vorschau, danach legst du die Einträge an.
            </p>
          </div>

          {preview && (
            <Alert variant="info">
              <CircleCheck />
              <AlertTitle>Vorschau</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 space-y-0.5">
                  <li>
                    <span className="num font-medium">{preview.created}</span>{" "}
                    Arbeitstage werden aufgefüllt
                  </li>
                  {preview.skipReasons.weekend > 0 && (
                    <li>
                      <span className="num">{preview.skipReasons.weekend}</span>{" "}
                      Wochenendtage übersprungen
                    </li>
                  )}
                  {preview.skipReasons.holiday > 0 && (
                    <li>
                      <span className="num">{preview.skipReasons.holiday}</span>{" "}
                      Feiertage übersprungen
                    </li>
                  )}
                  {preview.skipReasons.existing > 0 && (
                    <li>
                      <span className="num">
                        {preview.skipReasons.existing}
                      </span>{" "}
                      Tage mit Einträgen übersprungen
                    </li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Abbrechen
          </Button>
          {!preview ? (
            <Button
              onClick={handlePreview}
              disabled={loading || !startDate || !endDate}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Lade Vorschau …
                </>
              ) : (
                "Vorschau anzeigen"
              )}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Lege Einträge an …
                </>
              ) : (
                `${preview.created} Einträge anlegen`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
