"use client";

import { useMutation } from "@tanstack/react-query";
import { format, setHours, setMinutes } from "date-fns";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDateLong, formatHours } from "@/lib/format";
import { ENTRY_TYPE_LABEL } from "@/lib/labels";

const ENTRY_TYPES = ["WORK", "VACATION", "SICK", "HOLIDAY"] as const;

interface QuickEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  suggestedHours: number;
  onSuccess: () => void;
}

export function QuickEntryModal({
  open,
  onOpenChange,
  date,
  suggestedHours,
  onSuccess,
}: QuickEntryModalProps) {
  const [formData, setFormData] = useState({
    startTime: "09:00",
    endTime:
      suggestedHours > 0 ? calculateEndTime("09:00", suggestedHours) : "17:00",
    type: "WORK" as "WORK" | "VACATION" | "SICK" | "HOLIDAY",
    description: "",
  });

  function calculateEndTime(startTime: string, hours: number): string {
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const endHour = startHour + Math.floor(hours);
    const endMinute = startMinute + Math.round((hours % 1) * 60);

    const finalHour = endHour + Math.floor(endMinute / 60);
    const finalMinute = endMinute % 60;

    return `${String(finalHour).padStart(2, "0")}:${String(finalMinute).padStart(2, "0")}`;
  }

  function calculateDuration(startTime: string, endTime: string): number {
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    return (endMinutes - startMinutes) / 60;
  }

  const createEntryMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const duration = calculateDuration(data.startTime, data.endTime);

      const entryDate = new Date(date);
      const [startHour, startMinute] = data.startTime.split(":").map(Number);
      const [endHour, endMinute] = data.endTime.split(":").map(Number);

      const startDateTime = setMinutes(
        setHours(entryDate, startHour),
        startMinute,
      );
      const endDateTime = setMinutes(setHours(entryDate, endHour), endMinute);

      const response = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: format(entryDate, "yyyy-MM-dd"),
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          duration,
          type: data.type,
          description: data.description || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Der Eintrag konnte nicht angelegt werden.",
        );
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Eintrag nachgetragen");
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Der Eintrag konnte nicht angelegt werden.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate times
    if (formData.startTime >= formData.endTime) {
      toast.error("Das Ende muss nach dem Start liegen.");
      return;
    }

    createEntryMutation.mutate(formData);
  };

  const currentDuration = calculateDuration(
    formData.startTime,
    formData.endTime,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Eintrag nachtragen</DialogTitle>
          <DialogDescription>
            {formatDateLong(date)}
            {suggestedHours > 0 ? (
              <>
                {" · "}vorgeschlagen{" "}
                <span className="num">{formatHours(suggestedHours)}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 pb-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="startTime">Von</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) =>
                    setFormData({ ...formData, startTime: e.target.value })
                  }
                  className="num w-full min-w-0"
                  required
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="endTime">Bis</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) =>
                    setFormData({ ...formData, endTime: e.target.value })
                  }
                  className="num w-full min-w-0"
                  required
                />
              </div>
            </div>

            <p className="text-[13px] text-muted-foreground" aria-live="polite">
              Dauer{" "}
              {currentDuration > 0 ? (
                <span className="num font-medium text-foreground">
                  {formatHours(currentDuration)}
                </span>
              ) : (
                <span className="font-medium text-destructive">
                  Das Ende muss nach dem Start liegen.
                </span>
              )}
            </p>

            <div className="space-y-2">
              <Label htmlFor="type">Typ</Label>
              <Select
                value={formData.type}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    type: value as "WORK" | "VACATION" | "SICK" | "HOLIDAY",
                  })
                }
              >
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTRY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {ENTRY_TYPE_LABEL[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung (optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createEntryMutation.isPending}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={createEntryMutation.isPending || currentDuration <= 0}
            >
              {createEntryMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : null}
              {createEntryMutation.isPending ? "Speichere …" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
