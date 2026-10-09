"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { Info, Loader2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDateLong,
  formatDuration,
  formatHoursDelta,
  hoursToMinutes,
} from "@/lib/format";
import {
  billingStatusLabel,
  ENTRY_SOURCE_LABEL,
  ENTRY_TYPE_LABEL,
  type EntrySourceKey,
} from "@/lib/labels";
import { EntryType } from "@/types/database";

const editEntrySchema = z
  .object({
    date: z.string().min(1, "Gib ein Datum an."),
    startTime: z.string().min(1, "Gib einen Start an."),
    endTime: z.string().min(1, "Gib ein Ende an."),
    type: z.nativeEnum(EntryType),
    description: z.string().optional(),
  })
  .refine(
    (data) => {
      const startTime = new Date(`${data.date}T${data.startTime}`);
      const endTime = new Date(`${data.date}T${data.endTime}`);
      return endTime > startTime;
    },
    {
      message: "Das Ende muss nach dem Start liegen.",
      path: ["endTime"],
    },
  );

type EditEntryFormData = z.infer<typeof editEntrySchema>;

interface TimeEntryData {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: string | number;
  type: EntryType;
  description: string | null;
  billingStatus: string | null;
  source?: string;
  externalId?: string | null;
  projectPath?: string | null;
}

function syncEditHint(entry: TimeEntryData | null): string | null {
  if (!entry) return null;
  if (entry.source === "TIMING_SYNC" || entry.source === "FILE_IMPORT") {
    return entry.externalId
      ? "Dieser Eintrag kommt aus Timing. Wenn du ihn hier änderst, gilt er als manuell, und der Sync überschreibt ihn nicht mehr."
      : "Dieser Eintrag kommt aus einem Timing-Import. Ein späterer Sync oder Import dieses Tages ersetzt deine Änderung.";
  }
  return null;
}

interface EditEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: string | null;
  onEntryUpdated: () => void;
}

export function EditEntryDialog({
  open,
  onOpenChange,
  entryId,
  onEntryUpdated,
}: EditEntryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entryData, setEntryData] = useState<TimeEntryData | null>(null);

  const form = useForm<EditEntryFormData>({
    resolver: zodResolver(editEntrySchema),
    defaultValues: {
      date: "",
      startTime: "",
      endTime: "",
      type: EntryType.WORK,
      description: "",
    },
  });

  const loadEntryData = useCallback(async () => {
    if (!entryId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/time-entries/${entryId}`);
      if (!response.ok) {
        throw new Error("Fehler beim Laden des Eintrags");
      }

      const entry = await response.json();
      setEntryData(entry);

      // Populate form with entry data
      const startDate = parseISO(entry.startTime);
      const endDate = parseISO(entry.endTime);

      form.reset({
        date: format(parseISO(entry.date), "yyyy-MM-dd"),
        startTime: format(startDate, "HH:mm"),
        endTime: format(endDate, "HH:mm"),
        type: entry.type,
        description: entry.description || "",
      });
    } catch (error) {
      console.error("Error loading entry:", error);
      toast.error("Der Eintrag konnte nicht geladen werden.");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [entryId, form, onOpenChange]);

  // Load entry data when dialog opens
  useEffect(() => {
    if (open && entryId) {
      loadEntryData();
    }
  }, [open, entryId, loadEntryData]);

  const calculateDuration = (
    startTime: string,
    endTime: string,
    date: string,
  ): number => {
    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);
    const diffMs = end.getTime() - start.getTime();
    return diffMs / (1000 * 60 * 60); // Convert to hours
  };

  const onSubmit = async (data: EditEntryFormData) => {
    if (!entryId) return;

    setSaving(true);
    try {
      const duration = calculateDuration(
        data.startTime,
        data.endTime,
        data.date,
      );

      const updateData = {
        date: data.date,
        // Lokale Zeit wie in der Anzeige (format/parseISO), sonst verschiebt
        // schon ein Speichern ohne Änderung den Eintrag um den UTC-Offset
        startTime: new Date(`${data.date}T${data.startTime}`).toISOString(),
        endTime: new Date(`${data.date}T${data.endTime}`).toISOString(),
        duration: duration,
        type: data.type,
        description: data.description || null,
      };

      const response = await fetch(`/api/time-entries/${entryId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Speichern des Eintrags");
      }

      toast.success("Eintrag gespeichert");
      onEntryUpdated();
      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error("Error updating entry:", error);
      toast.error("Der Eintrag konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const editHint = syncEditHint(entryData);
  const isAdjustment = entryData?.type === EntryType.OVERTIME;
  const sourceLabel =
    entryData?.source && entryData.source in ENTRY_SOURCE_LABEL
      ? ENTRY_SOURCE_LABEL[entryData.source as EntrySourceKey]
      : null;

  const handleClose = () => {
    form.reset();
    setEntryData(null);
    onOpenChange(false);
  };

  const watchedStart = form.watch("startTime");
  const watchedEnd = form.watch("endTime");
  const watchedDate = form.watch("date");
  const computedMinutes =
    watchedStart && watchedEnd && watchedDate
      ? hoursToMinutes(calculateDuration(watchedStart, watchedEnd, watchedDate))
      : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Eintrag bearbeiten</DialogTitle>
          <DialogDescription>
            {entryData ? (
              <>
                {formatDateLong(entryData.date)}
                {sourceLabel ? ` · Quelle: ${sourceLabel}` : null}
              </>
            ) : (
              "Lade Eintrag …"
            )}
          </DialogDescription>
          {entryData?.projectPath ? (
            <p
              className="truncate text-[13px] text-muted-foreground"
              title={entryData.projectPath}
            >
              {entryData.projectPath}
            </p>
          ) : null}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Lade Eintrag …
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-4 pb-4">
                {editHint ? (
                  <Alert variant="warning">
                    <TriangleAlert />
                    <AlertDescription className="text-foreground">
                      {editHint}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {isAdjustment && entryData ? (
                  <Alert variant="info">
                    <Info />
                    <AlertDescription className="text-foreground">
                      Das ist eine Saldo-Buchung über{" "}
                      <span className="num font-medium">
                        {formatHoursDelta(Number(entryData.duration))}
                      </span>
                      . Uhrzeiten spielen dafür keine Rolle; ändere hier am
                      besten nur die Beschreibung.
                    </AlertDescription>
                  </Alert>
                ) : null}

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Datum</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          className="num w-full min-w-0"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>Start</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            className="num w-full min-w-0"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>Ende</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            className="num w-full min-w-0"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {computedMinutes !== null ? (
                  <p className="text-[13px] text-muted-foreground">
                    Berechnete Dauer{" "}
                    <span className="num font-medium text-foreground">
                      {formatDuration(computedMinutes)}
                    </span>
                  </p>
                ) : null}

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Typ</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Wähl einen Typ" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(EntryType).map((type) => (
                            <SelectItem key={type} value={type}>
                              {ENTRY_TYPE_LABEL[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Beschreibung (optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {entryData?.billingStatus ? (
                  <p className="text-[13px] text-muted-foreground">
                    Abrechnung:{" "}
                    <span className="text-foreground">
                      {billingStatusLabel(entryData.billingStatus)}
                    </span>
                  </p>
                ) : null}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Abbrechen
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : null}
                  Speichern
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
