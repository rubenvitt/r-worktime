"use client";

import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  FileText,
  Info,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DetailedImportPreview } from "@/types/import";

interface ImportPreviewProps {
  preview: DetailedImportPreview;
  isDuplicate?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ImportPreview({
  preview,
  isDuplicate,
  onConfirm,
  onCancel,
  isLoading = false,
}: ImportPreviewProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const getWarningIcon = (severity: string) => {
    switch (severity) {
      case "error":
        return <AlertCircle className="h-4 w-4" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getWarningColor = (severity: string): "default" | "destructive" => {
    switch (severity) {
      case "error":
        return "destructive";
      default:
        return "default";
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, "EEEE, dd.MM.yyyy", { locale: de });
    } catch {
      return dateStr;
    }
  };

  const _formatTime = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, "HH:mm");
    } catch {
      return "";
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Import-Vorschau
            </CardTitle>
            {preview.metadata?.fileName && (
              <CardDescription className="mt-1">
                <span className="font-medium">{preview.metadata.fileName}</span>
              </CardDescription>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="summary">Übersicht</TabsTrigger>
            <TabsTrigger value="warnings">
              Warnungen
              {preview.warnings.length > 0 && (
                <Badge className="ml-2" variant="secondary">
                  {preview.warnings.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="entries">Einträge</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Import-Statistik
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Gesamteinträge:
                    </span>
                    <span className="font-medium">
                      {preview.summary.totalEntries}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Neue Einträge:
                    </span>
                    <span className="font-medium text-green-600">
                      {preview.summary.newEntries}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Ersetzte Einträge:
                    </span>
                    <span className="font-medium text-yellow-600">
                      {preview.summary.replacedEntries}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Betroffene Tage:
                    </span>
                    <span className="font-medium">
                      {preview.summary.affectedDays}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Arbeitszeiten
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Gesamtstunden:
                    </span>
                    <span className="font-medium">
                      {preview.summary.totalHours.toFixed(2)} h
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Durchschnitt/Tag:
                    </span>
                    <span className="font-medium">
                      {preview.summary.averageHoursPerDay.toFixed(2)} h
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Zeitraum:
                    </span>
                    <span className="font-medium">
                      {preview.summary.dateRange.from &&
                        format(
                          parseISO(preview.summary.dateRange.from),
                          "dd.MM.",
                        )}
                      {" - "}
                      {preview.summary.dateRange.to &&
                        format(
                          parseISO(preview.summary.dateRange.to),
                          "dd.MM.yyyy",
                        )}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Entry Type Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Eintragstypen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(preview.summary.entryTypeBreakdown).map(
                    ([type, count]) =>
                      count > 0 && (
                        <Badge key={type} variant="outline">
                          {type}: {count}
                        </Badge>
                      ),
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Warnings Tab */}
          <TabsContent value="warnings">
            <ScrollArea className="h-[400px] w-full">
              {preview.warnings.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mb-2" />
                  <p>Keine Warnungen gefunden</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {preview.warnings.map((warning, index) => (
                    <Alert
                      key={index}
                      variant={getWarningColor(warning.severity)}
                    >
                      <div className="flex items-start gap-2">
                        {getWarningIcon(warning.severity)}
                        <div className="flex-1">
                          <AlertTitle className="text-sm font-medium">
                            {warning.message}
                          </AlertTitle>
                          {warning.details && (
                            <AlertDescription className="text-xs mt-1">
                              {warning.details}
                            </AlertDescription>
                          )}
                          {warning.date && (
                            <Badge variant="outline" className="mt-2">
                              {formatDate(warning.date)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Alert>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Entries Tab */}
          <TabsContent value="entries">
            <ScrollArea className="h-[400px] w-full">
              <div className="space-y-2">
                {preview.entries.map((entry, index) => (
                  <Card
                    key={index}
                    className={`cursor-pointer transition-colors ${
                      selectedDate === entry.date ? "border-primary" : ""
                    }`}
                    onClick={() => setSelectedDate(entry.date)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">
                          {formatDate(entry.date)}
                        </CardTitle>
                        <Badge
                          variant={
                            entry.action === "CREATE" ? "default" : "secondary"
                          }
                        >
                          {entry.action === "CREATE" ? "Neu" : "Ersetzt"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {entry.totalHoursBefore !== undefined && (
                          <div>
                            <span className="text-muted-foreground">
                              Vorher:
                            </span>{" "}
                            <span className="font-medium">
                              {entry.totalHoursBefore.toFixed(2)} h
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">
                            Nachher:
                          </span>{" "}
                          <span className="font-medium">
                            {entry.totalHoursAfter.toFixed(2)} h
                          </span>
                        </div>
                      </div>
                      {entry.conflicts.length > 0 && (
                        <Alert variant="destructive" className="py-2">
                          <AlertCircle className="h-3 w-3" />
                          <AlertDescription className="text-xs">
                            {entry.conflicts.join(", ")}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Details Tab */}
          <TabsContent value="details">
            <div className="space-y-4">
              {/* Validation Status */}
              <Alert
                variant={preview.validation.isValid ? "default" : "destructive"}
              >
                <div className="flex items-start gap-2">
                  {preview.validation.isValid ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <div>
                    <AlertTitle>
                      {preview.validation.isValid
                        ? "Import bereit"
                        : "Validierungsfehler"}
                    </AlertTitle>
                    {preview.validation.errors.length > 0 && (
                      <AlertDescription className="mt-2">
                        <ul className="list-disc list-inside space-y-1">
                          {preview.validation.errors.map((error, i) => (
                            <li key={i} className="text-xs">
                              {error}
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    )}
                  </div>
                </div>
              </Alert>

              {/* Duplicate Warning */}
              {isDuplicate && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Duplikat erkannt</AlertTitle>
                  <AlertDescription>
                    Diese Datei wurde bereits importiert. Sie können den Import
                    trotzdem fortsetzen.
                  </AlertDescription>
                </Alert>
              )}

              {/* Metadata */}
              {preview.metadata && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      Datei-Informationen
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dateiname:</span>
                      <span className="font-mono text-xs">
                        {preview.metadata.fileName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Hash:</span>
                      <span className="font-mono text-xs">
                        {preview.metadata.fileHash.substring(0, 12)}...
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Analysiert am:
                      </span>
                      <span className="text-xs">
                        {format(
                          parseISO(preview.metadata.analyzedAt),
                          "dd.MM.yyyy HH:mm",
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Abbrechen
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading || !preview.validation.isValid}
          >
            {isLoading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Importiere...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import durchführen
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
