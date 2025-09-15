"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { Calendar, Clock, FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
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
import { formatHoursToTime } from "@/lib/utils";
import { EntryType } from "@/types/database";

const entryTypeLabels: Record<EntryType, string> = {
  [EntryType.WORK]: "Arbeit",
  [EntryType.OVERTIME]: "Überstunden",
  [EntryType.VACATION]: "Urlaub",
  [EntryType.SICK]: "Krankheit",
  [EntryType.HOLIDAY]: "Feiertag",
};

const editEntrySchema = z
  .object({
    date: z.string().min(1, "Datum ist erforderlich"),
    startTime: z.string().min(1, "Startzeit ist erforderlich"),
    endTime: z.string().min(1, "Endzeit ist erforderlich"),
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
      message: "Endzeit muss nach Startzeit liegen",
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
  const [_entryData, setEntryData] = useState<TimeEntryData | null>(null);

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
      alert("Fehler beim Laden des Eintrags");
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
        startTime: `${data.date}T${data.startTime}:00.000Z`,
        endTime: `${data.date}T${data.endTime}:00.000Z`,
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

      onEntryUpdated();
      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error("Error updating entry:", error);
      alert("Fehler beim Speichern des Eintrags");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setEntryData(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Zeiteintrag bearbeiten
          </DialogTitle>
          <DialogDescription>
            Bearbeiten Sie die Details des ausgewählten Zeiteintrags.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Lade Eintrag...</span>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Date Field */}
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Datum
                    </FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Time Fields */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Startzeit
                      </FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Endzeit
                      </FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Duration Display (calculated) */}
              {form.watch("startTime") &&
                form.watch("endTime") &&
                form.watch("date") && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">Berechnet Dauer: </span>
                    {(() => {
                      const duration = calculateDuration(
                        form.watch("startTime"),
                        form.watch("endTime"),
                        form.watch("date"),
                      );
                      return formatHoursToTime(duration);
                    })()}
                  </div>
                )}

              {/* Entry Type */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Typ</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wählen Sie einen Typ">
                            {field.value && (
                              <Badge variant="secondary">
                                {entryTypeLabels[field.value]}
                              </Badge>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(entryTypeLabels).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beschreibung (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Beschreibung des Zeiteintrags..."
                        {...field}
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Abbrechen
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
