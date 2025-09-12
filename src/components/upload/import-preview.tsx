"use client";

import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  FileText,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ImportPreviewProps {
  preview: {
    totalEntries: number;
    newEntries: number;
    replacedEntries: number;
    affectedDates: string[];
    duplicateWarnings: string[];
    entryTypeBreakdown: Record<string, number>;
    estimatedHours: number;
  };
  isDuplicate?: boolean;
  onConfirm: () => void;
  onForceImport?: () => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export function ImportPreview({
  preview,
  isDuplicate = false,
  onConfirm,
  onForceImport,
  onCancel,
  isProcessing = false,
}: ImportPreviewProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getEntryTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      WORK: "Arbeit",
      OVERTIME: "Überstunden",
      VACATION: "Urlaub",
      SICK: "Krankheit",
      HOLIDAY: "Feiertag",
    };
    return labels[type] || type;
  };

  const getEntryTypeColor = (
    type: string,
  ): "default" | "secondary" | "destructive" | "outline" => {
    const colors: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      WORK: "default",
      OVERTIME: "secondary",
      VACATION: "outline",
      SICK: "destructive",
      HOLIDAY: "outline",
    };
    return colors[type] || "default";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Import-Vorschau
        </CardTitle>
        <CardDescription>
          Überprüfen Sie die Details vor dem Import
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Duplicate Warning */}
        {isDuplicate && (
          <Alert className="border-yellow-200 bg-yellow-50">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertTitle>Duplikat erkannt</AlertTitle>
            <AlertDescription>
              Diese Datei wurde bereits importiert. Sie können den Import
              erzwingen, um die Daten erneut zu verarbeiten.
            </AlertDescription>
          </Alert>
        )}

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Gesamt Einträge</p>
            <p className="text-2xl font-bold">{preview.totalEntries}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Neue Einträge</p>
            <p className="text-2xl font-bold text-green-600">
              {preview.newEntries}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Ersetzte Einträge</p>
            <p className="text-2xl font-bold text-orange-600">
              {preview.replacedEntries}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Geschätzte Stunden</p>
            <p className="text-2xl font-bold">{preview.estimatedHours}h</p>
          </div>
        </div>

        <Separator />

        {/* Entry Type Breakdown */}
        <div>
          <h4 className="text-sm font-medium mb-2">Eintragstypen</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(preview.entryTypeBreakdown).map(
              ([type, count]) =>
                count > 0 && (
                  <Badge
                    key={type}
                    variant={getEntryTypeColor(type)}
                    className="px-3 py-1"
                  >
                    {getEntryTypeLabel(type)}: {count}
                  </Badge>
                ),
            )}
          </div>
        </div>

        <Separator />

        {/* Affected Dates */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Betroffene Tage ({preview.affectedDates.length})
          </h4>
          <div className="max-h-32 overflow-y-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {preview.affectedDates.slice(0, 9).map((date) => (
                <div key={date} className="flex items-center gap-1">
                  <span className="text-muted-foreground">•</span>
                  {formatDate(date)}
                </div>
              ))}
              {preview.affectedDates.length > 9 && (
                <div className="text-muted-foreground">
                  ... und {preview.affectedDates.length - 9} weitere
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Duplicate Warnings */}
        {preview.duplicateWarnings.length > 0 && (
          <>
            <Separator />
            <Alert className="border-orange-200 bg-orange-50">
              <RefreshCw className="h-4 w-4 text-orange-600" />
              <AlertTitle>Einträge werden ersetzt</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 space-y-1 text-sm">
                  {preview.duplicateWarnings.slice(0, 3).map((warning) => (
                    <li key={warning}>• {warning}</li>
                  ))}
                  {preview.duplicateWarnings.length > 3 && (
                    <li className="text-muted-foreground">
                      ... und {preview.duplicateWarnings.length - 3} weitere
                    </li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
      <CardFooter className="flex justify-between gap-4">
        <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
          <XCircle className="mr-2 h-4 w-4" />
          Abbrechen
        </Button>
        <div className="flex gap-2">
          {isDuplicate && onForceImport && (
            <Button
              variant="secondary"
              onClick={onForceImport}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird importiert...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Trotzdem importieren
                </>
              )}
            </Button>
          )}
          {!isDuplicate && (
            <Button onClick={onConfirm} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird importiert...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Import starten
                </>
              )}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
