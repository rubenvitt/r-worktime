"use client";

import {
  AlertCircle,
  Check,
  CheckCircle,
  Download,
  Loader2,
} from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ENTRY_TYPE_LABEL, EXPORT_FORMAT_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { EntryType } from "@/types/database";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Format-Keys bleiben (API: json, csv, excel); Anzeige aus EXPORT_FORMAT_LABEL
type ExportFormat = "json" | "csv" | "excel";

const FORMATS: ExportFormat[] = ["json", "csv", "excel"];

const formatText = (format: ExportFormat) =>
  EXPORT_FORMAT_LABEL[format === "excel" ? "xlsx" : format];

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("json");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [typeFilter, setTypeFilter] = useState<EntryType | "all">("all");
  const [includeSettings, setIncludeSettings] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportComplete, setExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const formatRefs = useRef<Partial<Record<ExportFormat, HTMLButtonElement>>>(
    {},
  );

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportComplete(false);
    setExportError(null);

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
      setExportError(
        error instanceof Error && error.message
          ? error.message
          : "Export fehlgeschlagen",
      );
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
    setExportError(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isExporting) {
      onOpenChange(newOpen);
      if (!newOpen) {
        resetForm();
      }
    }
  };

  const handleFormatKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = FORMATS.indexOf(format);
    let next: ExportFormat | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = FORMATS[(index + 1) % FORMATS.length];
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = FORMATS[(index - 1 + FORMATS.length) % FORMATS.length];
    }
    if (next) {
      event.preventDefault();
      setFormat(next);
      formatRefs.current[next]?.focus();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[520px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          formatRefs.current[format]?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Daten exportieren</DialogTitle>
          <DialogDescription>
            Exportiere deine Zeiteinträge als Datei.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pb-4">
          <div className="space-y-2">
            <p id="export-format-label" className="text-sm font-medium">
              Format
            </p>
            <div
              role="radiogroup"
              aria-labelledby="export-format-label"
              className="divide-y overflow-hidden rounded-md border"
            >
              {FORMATS.map((formatKey) => {
                const checked = format === formatKey;
                const text = formatText(formatKey);
                return (
                  // biome-ignore lint/a11y/useSemanticElements: kompakte Formatliste als Radio-Buttons (Spezifikation)
                  <button
                    key={formatKey}
                    ref={(element) => {
                      if (element) formatRefs.current[formatKey] = element;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={checked ? 0 : -1}
                    onClick={() => setFormat(formatKey)}
                    onKeyDown={handleFormatKey}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:relative focus-visible:z-10",
                      checked && "bg-accent",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input",
                      )}
                    >
                      {checked ? (
                        <Check className="size-3" strokeWidth={3} />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{text.label}</span>
                      <span className="ml-2 text-[13px] text-muted-foreground">
                        {text.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              Zeitraum (optional)
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label
                  htmlFor="dateFrom"
                  className="text-[13px] font-normal text-muted-foreground"
                >
                  Von
                </Label>
                <Input
                  id="dateFrom"
                  type="date"
                  className="num w-full min-w-0"
                  value={dateRange.from}
                  onChange={(e) =>
                    setDateRange((prev) => ({ ...prev, from: e.target.value }))
                  }
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label
                  htmlFor="dateTo"
                  className="text-[13px] font-normal text-muted-foreground"
                >
                  Bis
                </Label>
                <Input
                  id="dateTo"
                  type="date"
                  className="num w-full min-w-0"
                  value={dateRange.to}
                  onChange={(e) =>
                    setDateRange((prev) => ({ ...prev, to: e.target.value }))
                  }
                />
              </div>
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="export-type">Typ</Label>
            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setTypeFilter(value as EntryType | "all")
              }
            >
              <SelectTrigger id="export-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                {Object.values(EntryType).map((type) => (
                  <SelectItem key={type} value={type}>
                    {ENTRY_TYPE_LABEL[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {format === "json" ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id="includeSettings"
                checked={includeSettings}
                onCheckedChange={(checked) => setIncludeSettings(!!checked)}
              />
              <Label htmlFor="includeSettings" className="font-normal">
                Einstellungen mitexportieren
              </Label>
            </div>
          ) : null}

          <p className="text-[13px] text-muted-foreground">
            Bis zu 50.000 Einträge pro Export. Das kann ein paar Sekunden
            dauern.
          </p>

          {isExporting ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span>Export wird erstellt …</span>
                <span className="num text-muted-foreground">
                  {exportProgress} %
                </span>
              </div>
              <Progress value={exportProgress} className="w-full" />
            </div>
          ) : null}

          {exportComplete ? (
            <Alert>
              <CheckCircle className="text-positive" />
              <AlertDescription className="text-foreground">
                Export fertig. Die Datei liegt in deinen Downloads.
              </AlertDescription>
            </Alert>
          ) : null}

          {exportError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{exportError}</AlertDescription>
            </Alert>
          ) : null}
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
          >
            {isExporting ? (
              <>
                <Loader2 className="animate-spin" />
                Exportiere …
              </>
            ) : exportComplete ? (
              <>
                <CheckCircle />
                Fertig
              </>
            ) : (
              <>
                <Download />
                Exportieren
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
