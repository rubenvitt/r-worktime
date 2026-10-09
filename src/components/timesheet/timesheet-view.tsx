"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileJson,
  Loader2,
  Send,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useOdooExtension } from "@/hooks/use-odoo-extension";
import { berlinTodayKey } from "@/lib/dates";
import {
  DEFAULT_ROUNDING,
  isRounding,
  ROUNDING_OPTIONS,
  type Rounding,
  type TimesheetEntry,
} from "@/lib/timesheet/aggregate";
import {
  ackErrorMessage,
  validateTimesheetPayload,
} from "@/lib/timesheet/extension-protocol";
import type { TimesheetResponse } from "@/lib/timesheet/types";
import { formatDayLabel, TimesheetDayCard } from "./timesheet-day-card";

const EXTENSION_DOCS_URL =
  "https://github.com/rubenvitt/r-worktime/tree/main/extension#readme";
const ALL_ROOTS = "__all__";
const PREFS_KEY = "rwt.timesheet.prefs";
const travelKey = (month: string) => `rwt.timesheet.travel.${month}`;

interface Prefs {
  root: string | null;
  rounding: Rounding;
  includeAbsences: boolean;
}

const DEFAULT_PREFS: Prefs = {
  root: null,
  rounding: DEFAULT_ROUNDING,
  includeAbsences: false,
};

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Speicher nicht verfügbar – Einstellung gilt dann nur für diese Sitzung
  }
}

function loadPrefs(): Prefs {
  const stored = readJson<Partial<Prefs>>(PREFS_KEY);
  return {
    root: typeof stored?.root === "string" ? stored.root : null,
    rounding:
      typeof stored?.rounding === "number" && isRounding(stored.rounding)
        ? stored.rounding
        : DEFAULT_ROUNDING,
    includeAbsences: stored?.includeAbsences === true,
  };
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

const monthFormatter = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatMonth(month: string): string {
  return monthFormatter.format(new Date(`${month}-01T00:00:00Z`));
}

function buildQuery(month: string, prefs: Prefs, withRounding = true) {
  const params = new URLSearchParams({ month });
  if (prefs.root) params.set("root", prefs.root);
  if (withRounding) params.set("rounding", String(prefs.rounding));
  if (prefs.includeAbsences) params.set("includeAbsences", "1");
  return params.toString();
}

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} kopiert`);
  } catch {
    toast.error(
      "Kopieren nicht möglich – erlaube den Zugriff auf die Zwischenablage.",
    );
  }
}

export function TimesheetView() {
  const [month, setMonth] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [travelOverrides, setTravelOverrides] = useState<
    Record<string, boolean>
  >({});
  const [sending, setSending] = useState(false);
  const extension = useOdooExtension();

  // localStorage erst nach dem Mount lesen (kein Hydration-Mismatch)
  useEffect(() => {
    setPrefs(loadPrefs());
    setMonth(berlinTodayKey().slice(0, 7));
  }, []);

  useEffect(() => {
    if (!month) return;
    setTravelOverrides(
      readJson<Record<string, boolean>>(travelKey(month)) ?? {},
    );
  }, [month]);

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      writeJson(PREFS_KEY, next);
      return next;
    });
  }, []);

  const { data, isLoading, isFetching, isPlaceholderData, error } =
    useQuery<TimesheetResponse>({
      queryKey: ["timesheet", month, prefs],
      enabled: month !== null,
      placeholderData: (previous) => previous,
      queryFn: async () => {
        const response = await fetch(
          `/api/timesheet?${buildQuery(month ?? "", prefs)}`,
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            body?.error ?? "Stundenzettel konnte nicht geladen werden",
          );
        }
        return body as TimesheetResponse;
      },
    });

  const days = useMemo(
    () => (data && data.month === month ? data.days : []),
    [data, month],
  );

  const travelFeeFor = useCallback(
    (date: string, suggested: boolean) => travelOverrides[date] ?? suggested,
    [travelOverrides],
  );

  const payload: TimesheetEntry[] = useMemo(
    () =>
      days.map((day) => ({
        date: day.date,
        hours: day.hours,
        text: day.text,
        travelFee: travelFeeFor(day.date, day.travelFee),
      })),
    [days, travelFeeFor],
  );

  const issues = useMemo(
    () =>
      month && payload.length > 0
        ? validateTimesheetPayload({
            month,
            generatedAt: "",
            entries: payload,
          })
        : [],
    [month, payload],
  );

  const setTravelFee = (date: string, value: boolean, suggested: boolean) => {
    if (!month) return;
    setTravelOverrides((current) => {
      const next = { ...current };
      if (value === suggested) delete next[date];
      else next[date] = value;
      writeJson(travelKey(month), next);
      return next;
    });
  };

  const handleSend = async () => {
    if (!month || isPlaceholderData) return;
    if (issues.length > 0) {
      toast.error("Der Stundenzettel kann so nicht gesendet werden.", {
        description: issues[0].message,
      });
      return;
    }
    setSending(true);
    try {
      const result = await extension.send(month, payload);
      if (result.ok) {
        toast.success(`${result.count} Tage an die Odoo-Extension übergeben.`, {
          description:
            "Öffne den Stundenzettel in Odoo und klicke dort auf „eintragen“.",
        });
      } else {
        toast.error(ackErrorMessage(result.error));
      }
    } finally {
      setSending(false);
    }
  };

  const roots = useMemo(() => {
    const list = data?.availableRoots ?? [];
    return prefs.root && !list.includes(prefs.root)
      ? [prefs.root, ...list]
      : list;
  }, [data?.availableRoots, prefs.root]);

  const travelDays = payload.filter((p) => p.travelFee).length;
  const criticalDays = days.filter((d) => d.criticalCount > 0).length;
  const exportHref = month
    ? `/api/timesheet/timing-export?${buildQuery(month, prefs, false)}`
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Stundenzettel</h1>
        <p className="text-muted-foreground">
          Fasse deine Einträge pro Tag zusammen und übertrage sie nach Odoo –
          per Extension oder Zwischenablage.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="timesheet-month">Monat</Label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label="Vorheriger Monat"
                disabled={!month}
                onClick={() => month && setMonth(shiftMonth(month, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                id="timesheet-month"
                type="month"
                value={month ?? ""}
                onChange={(event) => {
                  if (/^\d{4}-\d{2}$/.test(event.target.value)) {
                    setMonth(event.target.value);
                  }
                }}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Nächster Monat"
                disabled={!month}
                onClick={() => month && setMonth(shiftMonth(month, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timesheet-root">Projekt</Label>
            <Select
              value={prefs.root ?? ALL_ROOTS}
              onValueChange={(value) =>
                updatePrefs({ root: value === ALL_ROOTS ? null : value })
              }
            >
              <SelectTrigger id="timesheet-root" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ROOTS}>Alle Arbeitseinträge</SelectItem>
                {roots.map((root) => (
                  <SelectItem key={root} value={root}>
                    {root}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timesheet-rounding">Rundung pro Tag</Label>
            <Select
              value={String(prefs.rounding)}
              onValueChange={(value) => {
                const rounding = Number(value);
                if (isRounding(rounding)) updatePrefs({ rounding });
              }}
            >
              <SelectTrigger id="timesheet-rounding" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROUNDING_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option} Minuten
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2 pb-2">
            <Switch
              id="timesheet-absences"
              checked={prefs.includeAbsences}
              onCheckedChange={(checked) =>
                updatePrefs({ includeAbsences: checked })
              }
            />
            <Label htmlFor="timesheet-absences" className="font-normal">
              Abwesenheiten einbeziehen
            </Label>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {month ? formatMonth(month) : "…"}
            {isFetching && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
          <CardDescription>
            {data && data.month === month
              ? `${data.totals.days} Tage · ${data.totals.entries} Einträge · Dienstreise an ${travelDays} von ${data.totals.days} Tagen`
              : "Lade …"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <div className="font-mono text-3xl font-bold tabular-nums">
                {data && data.month === month ? data.totals.hours : "–"}
              </div>
              <p className="text-xs text-muted-foreground">
                Summe der gerundeten Tage
              </p>
            </div>
            {criticalDays > 0 && (
              <p className="text-sm text-destructive">
                {criticalDays === 1
                  ? "An 1 Tag fehlen Notizen."
                  : `An ${criticalDays} Tagen fehlen Notizen.`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={payload.length === 0 || isPlaceholderData}
              onClick={() =>
                copyToClipboard(JSON.stringify(payload, null, 2), "JSON")
              }
            >
              <FileJson className="mr-2 h-4 w-4" />
              JSON kopieren
            </Button>
            {extension.status === "present" && (
              <Button
                disabled={payload.length === 0 || sending || isPlaceholderData}
                onClick={handleSend}
              >
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                An Odoo-Extension senden
              </Button>
            )}
            <Button variant="outline" asChild disabled={!exportHref}>
              <a href={exportHref} download>
                <Download className="mr-2 h-4 w-4" />
                Rohdaten (Timing-JSON) herunterladen
              </a>
            </Button>
          </div>

          {extension.status === "absent" && (
            <p className="text-sm text-muted-foreground">
              Keine Odoo-Extension erkannt. Mit der Extension überträgst du den
              Monat ohne Zwischenablage –{" "}
              <a
                href={EXTENSION_DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                so richtest du sie ein
              </a>
              . Danach diese Seite neu laden.
            </p>
          )}
          {extension.status === "present" && extension.version && (
            <p className="text-xs text-muted-foreground">
              Odoo-Extension {extension.version} verbunden.
            </p>
          )}

          {issues.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Nicht an die Extension sendbar</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {issues.map((issue, index) => (
                    <li key={`${issue.date ?? "all"}-${index}`}>
                      {issue.date ? `${formatDayLabel(issue.date)}: ` : ""}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {isLoading || month === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : days.length === 0 && !error ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Keine Einträge für {formatMonth(month)}
            {prefs.root ? ` im Projekt „${prefs.root}“` : ""}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <TimesheetDayCard
              key={day.date}
              day={day}
              travelFee={travelFeeFor(day.date, day.travelFee)}
              onTravelFeeChange={(value) =>
                setTravelFee(day.date, value, day.travelFee)
              }
              onCopy={copyToClipboard}
              copyDisabled={isPlaceholderData}
            />
          ))}
        </div>
      )}
    </div>
  );
}
