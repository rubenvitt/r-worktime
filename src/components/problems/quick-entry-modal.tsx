"use client";

import { useMutation } from "@tanstack/react-query";
import { format, setHours, setMinutes } from "date-fns";
import { Calendar, Clock } from "lucide-react";
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
import { formatHoursToTime } from "@/lib/utils";

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
        throw new Error(error.error || "Failed to create entry");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Der Zeiteintrag wurde erfolgreich hinzugefügt.");
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Konnte den Eintrag nicht erstellen.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate times
    if (formData.startTime >= formData.endTime) {
      toast.error("Die Endzeit muss nach der Startzeit liegen.");
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manueller Zeiteintrag</DialogTitle>
          <DialogDescription>
            Erstelle einen neuen Zeiteintrag für{" "}
            {format(new Date(date), "dd.MM.yyyy")}
            {suggestedHours > 0 && (
              <span className="block mt-1 text-sm">
                Empfohlene Stunden: {formatHoursToTime(suggestedHours)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Date Display */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Datum</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {format(new Date(date), "dd.MM.yyyy")}
                </span>
              </div>
            </div>

            {/* Start Time */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="startTime" className="text-right">
                Von
              </Label>
              <Input
                id="startTime"
                type="time"
                value={formData.startTime}
                onChange={(e) =>
                  setFormData({ ...formData, startTime: e.target.value })
                }
                className="col-span-3"
                required
              />
            </div>

            {/* End Time */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endTime" className="text-right">
                Bis
              </Label>
              <Input
                id="endTime"
                type="time"
                value={formData.endTime}
                onChange={(e) =>
                  setFormData({ ...formData, endTime: e.target.value })
                }
                className="col-span-3"
                required
              />
            </div>

            {/* Duration Display */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Dauer</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span
                  className={`font-medium ${
                    currentDuration < 0 ? "text-destructive" : ""
                  }`}
                >
                  {currentDuration >= 0
                    ? `${currentDuration.toFixed(1)} Stunden`
                    : "Ungültige Zeit"}
                </span>
              </div>
            </div>

            {/* Type */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">
                Typ
              </Label>
              <Select
                value={formData.type}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    type: value as "WORK" | "VACATION" | "SICK" | "HOLIDAY",
                  })
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WORK">Arbeit</SelectItem>
                  <SelectItem value="VACATION">Urlaub</SelectItem>
                  <SelectItem value="SICK">Krankheit</SelectItem>
                  <SelectItem value="HOLIDAY">Feiertag</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Beschreibung
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional: Was wurde gemacht?"
                className="col-span-3"
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
              {createEntryMutation.isPending ? "Speichern..." : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
