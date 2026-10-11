"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { invalidateEntryDependentQueries } from "@/components/app/query-invalidation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ABSENCE_TITLE,
  type AbsenceRangeResponse,
  type AbsenceRangeType,
  validateAbsenceRange,
} from "@/lib/absence-range";
import { berlinTodayKey } from "@/lib/dates";
import { formatDateShort, formatHours, plural } from "@/lib/format";

/** So viele übersprungene Tage werden einzeln genannt, der Rest gezählt. */
const MAX_LISTED_SKIPS = 6;
const PREVIEW_DEBOUNCE_MS = 300;

interface RangeRequest {
  from: string;
  to: string;
  type: AbsenceRangeType;
  halfDay: boolean;
  note?: string;
  dryRun: boolean;
}

async function postAbsenceRange(
  request: RangeRequest,
): Promise<AbsenceRangeResponse> {
  const response = await fetch("/api/time-entries/absences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || body === null) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null;
    throw new Error(
      message ?? "Die Abwesenheit konnte nicht eingetragen werden.",
    );
  }
  return body as AbsenceRangeResponse;
}

function parseParamsKey(key: string) {
  const [from = "", to = "", type, half] = key.split("|");
  return {
    from,
    to,
    type: (type === "SICK" ? "SICK" : "VACATION") as AbsenceRangeType,
    halfDay: half === "half",
  };
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function dayCountLabel(preview: AbsenceRangeResponse, halfDay: boolean) {
  if (halfDay && preview.created === 1) return "1 halber Arbeitstag";
  return plural(preview.created, "Arbeitstag", "Arbeitstage");
}

interface AbsenceRangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Zusätzlich zum Invalidieren der Abfragen, z. B. Tabelle neu laden */
  onSuccess?: () => void;
  defaultType?: AbsenceRangeType;
}

export function AbsenceRangeDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultType = "VACATION",
}: AbsenceRangeDialogProps) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<AbsenceRangeType>(defaultType);
  const [from, setFrom] = useState(() => berlinTodayKey());
  const [to, setTo] = useState(() => berlinTodayKey());
  const [halfDayChecked, setHalfDayChecked] = useState(false);
  const [note, setNote] = useState("");

  const singleDay = from === to;
  const halfDay = halfDayChecked && singleDay;
  const validationError =
    from && to ? validateAbsenceRange({ from, to, halfDay }) : null;
  const inputsComplete = Boolean(from && to) && validationError === null;

  // Vorschau über dieselbe Route mit dryRun – exakt die Serverlogik.
  // Entprellt wird ein String, damit nicht jedes Rendern den Timer neu startet.
  const paramsKey = [from, to, type, halfDay ? "half" : "full"].join("|");
  const debouncedKey = useDebounced(paramsKey, PREVIEW_DEBOUNCE_MS);
  const previewParams = parseParamsKey(debouncedKey);
  const previewParamsValid =
    Boolean(previewParams.from && previewParams.to) &&
    validateAbsenceRange(previewParams) === null;
  const preview = useQuery({
    queryKey: ["absence-range-preview", debouncedKey],
    queryFn: () => postAbsenceRange({ ...previewParams, dryRun: true }),
    enabled: open && inputsComplete && previewParamsValid,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const previewIsCurrent =
    debouncedKey === paramsKey && !preview.isPlaceholderData;

  const save = useMutation({
    mutationFn: () =>
      postAbsenceRange({
        from,
        to,
        type,
        halfDay,
        note: note.trim() || undefined,
        dryRun: false,
      }),
    onSuccess: (result) => {
      invalidateEntryDependentQueries(queryClient);
      const title = ABSENCE_TITLE[type];
      toast.success(`${title} eingetragen`, {
        description:
          result.skipped.length > 0
            ? `${dayCountLabel(result, halfDay)} angelegt, ${plural(result.skipped.length, "Tag", "Tage")} übersprungen.`
            : `${dayCountLabel(result, halfDay)} angelegt.`,
      });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const data = preview.data;
  const canSave =
    inputsComplete &&
    previewIsCurrent &&
    !preview.isFetching &&
    (data?.created ?? 0) > 0 &&
    !save.isPending;

  const handleFromChange = (value: string) => {
    setFrom(value);
    // Ende nachziehen, damit der Zeitraum nicht rückwärts läuft
    if (value && to && value > to) setTo(value);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (canSave) save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Abwesenheit eintragen</DialogTitle>
          <DialogDescription>
            Urlaub oder Krankheit für einen Zeitraum, auch im Voraus. Pro
            Arbeitstag entsteht ein Eintrag mit dem Tagessoll.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 pb-4">
            <div className="space-y-2">
              <Label htmlFor="absence-type">Art</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as AbsenceRangeType)}
              >
                <SelectTrigger id="absence-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VACATION">Urlaub</SelectItem>
                  <SelectItem value="SICK">Krankheit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="absence-from">Von</Label>
                <Input
                  id="absence-from"
                  type="date"
                  value={from}
                  onChange={(e) => handleFromChange(e.target.value)}
                  className="num w-full min-w-0"
                  required
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="absence-to">Bis</Label>
                <Input
                  id="absence-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="num w-full min-w-0"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="absence-half-day"
                checked={halfDay}
                disabled={!singleDay}
                onCheckedChange={(checked) =>
                  setHalfDayChecked(checked === true)
                }
              />
              <Label
                htmlFor="absence-half-day"
                className="cursor-pointer text-sm font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
              >
                Halber Tag
                {!singleDay ? (
                  <span className="text-muted-foreground">
                    {" "}
                    (nur für einen einzelnen Tag)
                  </span>
                ) : null}
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="absence-note">Notiz (optional)</Label>
              <Input
                id="absence-note"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder="z. B. Sommerurlaub"
              />
            </div>

            <PreviewBox
              validationError={from && to ? validationError : null}
              loading={
                inputsComplete &&
                (!previewIsCurrent || preview.isFetching) &&
                !preview.isError
              }
              error={preview.isError ? preview.error : null}
              data={inputsComplete ? data : undefined}
              halfDay={halfDay}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={!canSave}>
              {save.isPending ? <Loader2 className="animate-spin" /> : null}
              {save.isPending
                ? "Speichere …"
                : data && previewIsCurrent && data.created > 0
                  ? `${plural(data.created, "Tag", "Tage")} eintragen`
                  : "Eintragen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBox({
  validationError,
  loading,
  error,
  data,
  halfDay,
}: {
  validationError: string | null;
  loading: boolean;
  error: Error | null;
  data: AbsenceRangeResponse | undefined;
  halfDay: boolean;
}) {
  if (validationError) {
    return (
      <p className="text-[13px] font-medium text-destructive" role="alert">
        {validationError}
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-[13px] font-medium text-destructive" role="alert">
        Vorschau nicht verfügbar: {error.message}
      </p>
    );
  }
  if (!data) {
    return loading ? (
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Vorschau wird berechnet …
      </p>
    ) : null;
  }

  const listed = data.skipped.slice(0, MAX_LISTED_SKIPS);
  const more = data.skipped.length - listed.length;

  return (
    <div
      className="space-y-1.5 rounded-md border bg-muted/40 px-3 py-2.5 text-[13px]"
      aria-live="polite"
      aria-busy={loading}
    >
      <p className={loading ? "opacity-60" : undefined}>
        {data.created > 0 ? (
          <>
            <span className="num font-medium">
              {dayCountLabel(data, halfDay)}
            </span>
            {", "}
            <span className="num font-medium">
              {formatHours(data.totalHours)} h
            </span>
            <span className="text-muted-foreground">
              {" "}
              (Tagessoll {formatHours(data.dailyHours)} h)
            </span>
          </>
        ) : (
          <span className="font-medium text-destructive">
            Im Zeitraum ist kein Arbeitstag frei.
          </span>
        )}
      </p>
      {data.skipped.length > 0 ? (
        <div className="text-muted-foreground">
          Übersprungen:
          <ul className="mt-0.5 space-y-0.5">
            {listed.map((day) => (
              <li key={day.date}>
                <span className="num">{formatDateShort(day.date)}</span> ·{" "}
                {day.reason === "holiday"
                  ? day.label
                  : `schon eingetragen (${day.label})`}
              </li>
            ))}
            {more > 0 ? (
              <li>und {plural(more, "weiterer Tag", "weitere Tage")}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {data.nonWorkDays > 0 ? (
        <p className="text-muted-foreground">
          {plural(data.nonWorkDays, "Tag ist", "Tage sind")} kein Arbeitstag.
        </p>
      ) : null}
      {data.holidayServiceUnavailableYears.length > 0 ? (
        <p className="text-warning">
          Der Feiertags-Dienst war für{" "}
          {data.holidayServiceUnavailableYears.join(", ")} nicht erreichbar; nur
          importierte Feiertage werden übersprungen.
        </p>
      ) : null}
    </div>
  );
}
