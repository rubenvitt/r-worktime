"use client";

import {
  Calendar,
  CheckCircle,
  Download,
  FileJson,
  FileSpreadsheet,
  Info,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntryType } from "@/types/database";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportFormat = "json" | "csv" | "excel";

const formatIcons = {
  json: FileJson,
  csv: FileSpreadsheet,
  excel: FileSpreadsheet,
};

const formatLabels = {
  json: "JSON (Timing-kompatibel)",
  csv: "CSV (Excel-kompatibel)",
  excel: "Excel Spreadsheet",
};

const formatDescriptions = {
  json: "Strukturierte Daten für Import in andere Systeme",
  csv: "Comma-separated values für Excel und andere Tools",
  excel: "Microsoft Excel Arbeitsmappe",
};

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("json");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [typeFilter, setTypeFilter] = useState<EntryType | "all">("all");
  const [includeSettings, setIncludeSettings] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportComplete, setExportComplete] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportComplete(false);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setExportProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      const params = new URLSearchParams({
        format,
      });

      if (dateRange.from) {
        params.set("dateFrom", dateRange.from);
      }
      if (dateRange.to) {
        params.set("dateTo", dateRange.to);
      }
      if (typeFilter !== "all") {
        params.set("type", typeFilter);
      }
      if (includeSettings && format === "json") {
        params.set("includeSettings", "true");
      }

      const response = await fetch(`/api/time-entries/export?${params}`);

      clearInterval(progressInterval);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Export fehlgeschlagen");
      }

      setExportProgress(100);
      setExportComplete(true);

      // Download the file
      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition");
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1]?.replace(/"/g, "")
        : `export.${format}`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Close dialog after successful export
      setTimeout(() => {
        onOpenChange(false);
        resetForm();
      }, 2000);
    } catch (error) {
      console.error("Export error:", error);
      // Handle error (would need error state and display)
    } finally {
      setIsExporting(false);
    }
  };

  const resetForm = () => {
    setFormat("json");
    setDateRange({ from: "", to: "" });
    setTypeFilter("all");
    setIncludeSettings(false);
    setExportProgress(0);
    setExportComplete(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isExporting) {
      onOpenChange(newOpen);
      if (!newOpen) {
        resetForm();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Daten exportieren
          </DialogTitle>
          <DialogDescription>
            Exportieren Sie Ihre Zeiteinträge in verschiedenen Formaten
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Format Selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Export-Format</Label>
            <div className="grid grid-cols-1 gap-3">
              {(Object.keys(formatLabels) as ExportFormat[]).map(
                (formatKey) => {
                  const Icon = formatIcons[formatKey];
                  return (
                    <Card
                      key={formatKey}
                      className={`cursor-pointer transition-colors ${
                        format === formatKey
                          ? "ring-2 ring-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => setFormat(formatKey)}
                    >
                      <CardContent className="flex items-center gap-3 p-4">
                        <div className="flex items-center gap-3 flex-1">
                          <Icon className="h-8 w-8 text-muted-foreground" />
                          <div>
                            <div className="font-medium">
                              {formatLabels[formatKey]}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {formatDescriptions[formatKey]}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {formatKey === "json" && (
                            <Badge variant="secondary">Empfohlen</Badge>
                          )}
                          <div
                            className={`w-4 h-4 rounded-full border-2 ${
                              format === formatKey
                                ? "border-primary bg-primary"
                                : "border-muted-foreground"
                            }`}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                },
              )}
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="space-y-3">
            <Label className="text-base font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Zeitraum (optional)
            </Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateFrom" className="text-sm">
                  Von
                </Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateRange.from}
                  onChange={(e) =>
                    setDateRange((prev) => ({ ...prev, from: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateTo" className="text-sm">
                  Bis
                </Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateRange.to}
                  onChange={(e) =>
                    setDateRange((prev) => ({ ...prev, to: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Type Filter */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Eintragstyp</Label>
            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setTypeFilter(value as EntryType | "all")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Typ auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                <SelectItem value={EntryType.WORK}>Arbeit</SelectItem>
                <SelectItem value={EntryType.OVERTIME}>Überstunden</SelectItem>
                <SelectItem value={EntryType.VACATION}>Urlaub</SelectItem>
                <SelectItem value={EntryType.SICK}>Krankheit</SelectItem>
                <SelectItem value={EntryType.HOLIDAY}>Feiertag</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Additional Options */}
          {format === "json" && (
            <div className="space-y-3">
              <Label className="text-base font-medium flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Zusätzliche Optionen
              </Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeSettings"
                  checked={includeSettings}
                  onCheckedChange={(checked) => setIncludeSettings(!!checked)}
                />
                <Label htmlFor="includeSettings" className="text-sm">
                  Benutzereinstellungen einschließen
                </Label>
              </div>
            </div>
          )}

          {/* Info Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Der Export kann je nach Datenmenge einige Sekunden dauern.
              Maximum: 50.000 Einträge pro Export.
            </AlertDescription>
          </Alert>

          {/* Progress */}
          {isExporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Export wird erstellt...</Label>
                <span className="text-sm text-muted-foreground">
                  {exportProgress}%
                </span>
              </div>
              <Progress value={exportProgress} className="w-full" />
            </div>
          )}

          {/* Success Message */}
          {exportComplete && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">
                Export erfolgreich! Die Datei wurde heruntergeladen.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isExporting}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || exportComplete}
            className="gap-2"
          >
            {isExporting ? (
              "Exportiere..."
            ) : exportComplete ? (
              <>
                <CheckCircle className="h-4 w-4" />
                Fertig
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Exportieren
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
