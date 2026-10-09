"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
} from "@/components/app/panel";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatDateLong,
  formatDateShort,
  formatHours,
  formatTimestamp,
} from "@/lib/format";
import { ENTRY_TYPE_LABEL, type EntryTypeKey } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DetailedImportPreview } from "@/types/import";

interface ImportPreviewProps {
  preview: DetailedImportPreview;
  isDuplicate?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function Fact({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn("num text-sm font-medium", className)}>{value}</dd>
    </div>
  );
}

export function ImportPreview({
  preview,
  isDuplicate,
  onConfirm,
  onCancel,
  isLoading = false,
}: ImportPreviewProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const warningIcon = (severity: string) => {
    switch (severity) {
      case "error":
        return <AlertCircle />;
      case "warning":
        return <AlertTriangle />;
      default:
        return <Info />;
    }
  };

  const warningVariant = (
    severity: string,
  ): "destructive" | "warning" | "info" => {
    switch (severity) {
      case "error":
        return "destructive";
      case "warning":
        return "warning";
      default:
        return "info";
    }
  };

  const longDate = (value: string) => safe(() => formatDateLong(value), value);

  const { dateRange } = preview.summary;
  const rangeText =
    dateRange.from && dateRange.to
      ? `${safe(() => formatDateShort(dateRange.from), dateRange.from)} – ${safe(
          () => formatDateShort(dateRange.to),
          dateRange.to,
        )}`
      : "—";

  return (
    <Panel>
      <PanelHeader
        title="Import-Vorschau"
        meta={
          preview.metadata?.fileName ? (
            <span className="block max-w-[24ch] truncate">
              {preview.metadata.fileName}
            </span>
          ) : undefined
        }
        actions={
          <Button
            variant="ghost"
            size="icon"
            className="size-11 md:size-8"
            onClick={onCancel}
            aria-label="Vorschau schließen"
          >
            <X />
          </Button>
        }
      />
      <PanelBody>
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="summary">Übersicht</TabsTrigger>
            <TabsTrigger value="warnings">
              Hinweise
              {preview.warnings.length > 0 ? (
                <span className="num ml-1 text-muted-foreground">
                  {preview.warnings.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="entries">Tage</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          {/* Übersicht */}
          <TabsContent value="summary" className="space-y-4 pt-2">
            <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
              <dl className="divide-y">
                <Fact label="Einträge" value={preview.summary.totalEntries} />
                <Fact
                  label="Neu"
                  value={preview.summary.newEntries}
                  className={
                    preview.summary.newEntries > 0 ? "text-positive" : undefined
                  }
                />
                <Fact
                  label="Ersetzt"
                  value={preview.summary.replacedEntries}
                  className={
                    preview.summary.replacedEntries > 0
                      ? "text-warning"
                      : undefined
                  }
                />
                <Fact
                  label="Betroffene Tage"
                  value={preview.summary.affectedDays}
                />
              </dl>
              <dl className="divide-y">
                <Fact
                  label="Gesamt"
                  value={formatHours(preview.summary.totalHours)}
                />
                <Fact
                  label="Ø pro Tag"
                  value={formatHours(preview.summary.averageHoursPerDay)}
                />
                <Fact label="Zeitraum" value={rangeText} />
              </dl>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {Object.entries(preview.summary.entryTypeBreakdown).map(
                ([type, count]) =>
                  count > 0 ? (
                    <StatusBadge key={type} tone="neutral">
                      {`${ENTRY_TYPE_LABEL[type as EntryTypeKey] ?? type} · ${count}`}
                    </StatusBadge>
                  ) : null,
              )}
            </div>
          </TabsContent>

          {/* Hinweise */}
          <TabsContent value="warnings" className="pt-2">
            <ScrollArea className="h-[360px] w-full">
              {preview.warnings.length === 0 ? (
                <p className="py-10 text-[13px] text-muted-foreground">
                  Keine Hinweise.
                </p>
              ) : (
                <div className="space-y-2 pr-3">
                  {preview.warnings.map((warning, index) => (
                    <Alert
                      key={index}
                      variant={warningVariant(warning.severity)}
                    >
                      {warningIcon(warning.severity)}
                      <AlertTitle className="text-sm">
                        {warning.message}
                      </AlertTitle>
                      {warning.details || warning.date ? (
                        <AlertDescription className="text-xs text-foreground/80">
                          {warning.details ? <p>{warning.details}</p> : null}
                          {warning.date ? (
                            <p className="mt-1">{longDate(warning.date)}</p>
                          ) : null}
                        </AlertDescription>
                      ) : null}
                    </Alert>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Tage */}
          <TabsContent value="entries" className="pt-2">
            <ScrollArea className="h-[360px] w-full rounded-md border">
              <ul className="divide-y">
                {preview.entries.map((entry, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(entry.date)}
                      aria-pressed={selectedDate === entry.date}
                      className={cn(
                        "flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-[13px] hover:bg-accent",
                        selectedDate === entry.date && "bg-accent",
                      )}
                    >
                      <span className="num w-[9ch] shrink-0 font-medium">
                        {safe(() => formatDateShort(entry.date), entry.date)}
                      </span>
                      <StatusBadge
                        tone={
                          entry.action === "CREATE" ? "positive" : "warning"
                        }
                      >
                        {entry.action === "CREATE" ? "Neu" : "Ersetzt"}
                      </StatusBadge>
                      <span className="num ml-auto text-muted-foreground">
                        {entry.totalHoursBefore !== undefined ? (
                          <>bisher {formatHours(entry.totalHoursBefore)} · </>
                        ) : null}
                        danach{" "}
                        <span className="text-foreground">
                          {formatHours(entry.totalHoursAfter)}
                        </span>
                      </span>
                      {entry.conflicts.length > 0 ? (
                        <span className="basis-full text-xs text-destructive">
                          {entry.conflicts.join(", ")}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </TabsContent>

          {/* Details */}
          <TabsContent value="details" className="space-y-4 pt-2">
            <Alert
              variant={preview.validation.isValid ? "default" : "destructive"}
            >
              {preview.validation.isValid ? (
                <CheckCircle className="text-positive" />
              ) : (
                <AlertCircle />
              )}
              <AlertTitle>
                {preview.validation.isValid
                  ? "Bereit zum Import"
                  : "Die Datei lässt sich so nicht importieren"}
              </AlertTitle>
              {preview.validation.errors.length > 0 ? (
                <AlertDescription>
                  <ul className="list-inside list-disc space-y-1 text-xs">
                    {preview.validation.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              ) : null}
            </Alert>

            {isDuplicate ? (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertTitle>Schon importiert</AlertTitle>
                <AlertDescription className="text-foreground/80">
                  Diese Datei wurde bereits importiert. Du kannst den Import
                  trotzdem fortsetzen.
                </AlertDescription>
              </Alert>
            ) : null}

            {preview.metadata ? (
              <dl className="divide-y">
                <Fact
                  label="Dateiname"
                  value={
                    <span className="break-all font-normal">
                      {preview.metadata.fileName}
                    </span>
                  }
                />
                <Fact
                  label="Prüfsumme"
                  value={
                    <span className="font-mono text-xs font-normal">
                      {preview.metadata.fileHash.substring(0, 12)}…
                    </span>
                  }
                />
                <Fact
                  label="Analysiert"
                  value={safe(
                    () => formatTimestamp(preview.metadata?.analyzedAt ?? ""),
                    preview.metadata?.analyzedAt ?? "—",
                  )}
                />
              </dl>
            ) : null}
          </TabsContent>
        </Tabs>
      </PanelBody>
      <PanelFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          className="h-11 md:h-9"
          onClick={onCancel}
          disabled={isLoading}
        >
          Abbrechen
        </Button>
        <Button
          className="h-11 md:h-9"
          onClick={onConfirm}
          disabled={isLoading || !preview.validation.isValid}
        >
          {isLoading ? (
            <>
              <Loader2 className="animate-spin" />
              Importiere …
            </>
          ) : (
            <>
              <Upload />
              {isDuplicate ? "Trotzdem importieren" : "Importieren"}
            </>
          )}
        </Button>
      </PanelFooter>
    </Panel>
  );
}
