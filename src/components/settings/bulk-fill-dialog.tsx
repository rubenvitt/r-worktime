"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
        title: "Fehler",
        description: "Bitte wähle Start- und Enddatum",
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
        throw new Error(error.error || "Fehler beim Laden der Vorschau");
      }

      const data = await response.json();
      setPreview(data);
    } catch (error) {
      console.error("Preview error:", error);
      toast({
        title: "Fehler",
        description:
          error instanceof Error
            ? error.message
            : "Fehler beim Laden der Vorschau",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!startDate || !endDate) {
      toast({
        title: "Fehler",
        description: "Bitte wähle Start- und Enddatum",
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
        throw new Error(error.error || "Fehler beim Erstellen der Einträge");
      }

      const data = await response.json();

      toast({
        title: "Erfolg",
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
        title: "Fehler",
        description:
          error instanceof Error
            ? error.message
            : "Fehler beim Erstellen der Einträge",
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Arbeitstage automatisch befüllen</DialogTitle>
          <DialogDescription>
            Fülle alle Arbeitstage in einem Zeitraum mit Standard-Arbeitszeiten.
            Wochenenden und Feiertage werden automatisch übersprungen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Von Datum</Label>
              <div className="flex gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground mt-2" />
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Bis Datum</Label>
              <div className="flex gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground mt-2" />
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>
          </div>

          {/* Work Hours */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dailyHours">Stunden pro Tag</Label>
              <Input
                id="dailyHours"
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={dailyHours}
                onChange={(e) => setDailyHours(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startTime">Arbeitszeit von</Label>
              <div className="flex gap-2">
                <Clock className="h-5 w-5 text-muted-foreground mt-2" />
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">Arbeitszeit bis</Label>
              <div className="flex gap-2">
                <Clock className="h-5 w-5 text-muted-foreground mt-2" />
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Beschreibung</Label>
            <Input
              id="description"
              type="text"
              placeholder="z.B. Manuelle Arbeitszeit"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Options */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="skipExisting"
              checked={skipExisting}
              onCheckedChange={(checked) => setSkipExisting(checked as boolean)}
            />
            <Label
              htmlFor="skipExisting"
              className="text-sm font-normal cursor-pointer"
            >
              Existierende Einträge überspringen
            </Label>
          </div>

          {/* Preview Results */}
          {preview && (
            <Alert className="mt-4">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Vorschau:</strong> {preview.message}
                <div className="mt-2 text-sm">
                  <div>✓ {preview.created} Arbeitstage werden befüllt</div>
                  {preview.skipReasons.weekend > 0 && (
                    <div>
                      - {preview.skipReasons.weekend} Wochenendtage übersprungen
                    </div>
                  )}
                  {preview.skipReasons.holiday > 0 && (
                    <div>
                      - {preview.skipReasons.holiday} Feiertage übersprungen
                    </div>
                  )}
                  {preview.skipReasons.existing > 0 && (
                    <div>
                      - {preview.skipReasons.existing} existierende Einträge
                      übersprungen
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Info Alert */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Hinweis:</strong> Diese Funktion erstellt Zeiteinträge für
              alle Arbeitstage (Mo-Fr) im gewählten Zeitraum. Wochenenden und
              bereits eingetragene Feiertage werden automatisch übersprungen.
              Ideal zum Nachtragen historischer Arbeitszeiten.
            </AlertDescription>
          </Alert>
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Lade Vorschau...
                </>
              ) : (
                "Vorschau anzeigen"
              )}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Erstelle Einträge...
                </>
              ) : (
                `${preview.created} Einträge erstellen`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
