"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_SETTINGS,
  type UserSettingsResponse,
  type UserSettingsUpdate,
  userSettingsUpdateSchema,
} from "@/types/settings";
import { WorkDaysSelector } from "./work-days-selector";

export function UserSettingsForm() {
  const queryClient = useQueryClient();
  const [overtimePreview, setOvertimePreview] = useState<number>(0);

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      const response = await fetch("/api/settings");
      if (!response.ok) {
        throw new Error("Fehler beim Laden der Einstellungen");
      }
      const data = await response.json();
      return data.data as UserSettingsResponse;
    },
  });

  // Form setup
  const form = useForm<UserSettingsUpdate>({
    resolver: zodResolver(userSettingsUpdateSchema),
    defaultValues: DEFAULT_SETTINGS,
  });

  // Update form when settings are loaded
  useEffect(() => {
    if (settings) {
      form.reset({
        weeklyWorkHours: settings.weeklyWorkHours,
        workDays: settings.workDays,
        defaultStartTime: settings.defaultStartTime,
        defaultEndTime: settings.defaultEndTime,
        breakDuration: settings.breakDuration,
        timezone: settings.timezone,
        overtimeNotification: settings.overtimeNotification,
        language: settings.language,
        theme: settings.theme as "light" | "dark" | "system" | undefined,
      });
    }
  }, [settings, form]);

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async (data: UserSettingsUpdate) => {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      queryClient.invalidateQueries({ queryKey: ["overtime"] });
      toast.success("Einstellungen wurden gespeichert");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Reset settings mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/settings", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Fehler beim Zurücksetzen");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      queryClient.invalidateQueries({ queryKey: ["overtime"] });
      toast.success("Einstellungen wurden zurückgesetzt");
    },
    onError: () => {
      toast.error("Fehler beim Zurücksetzen der Einstellungen");
    },
  });

  // Calculate overtime preview
  useEffect(() => {
    const values = form.watch();
    const dailyHours =
      values.workDays.length > 0
        ? values.weeklyWorkHours / values.workDays.length
        : 0;
    setOvertimePreview(dailyHours);
  }, [form.watch]);

  const onSubmit = (data: UserSettingsUpdate) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Arbeitszeit-Einstellungen */}
        <Card>
          <CardHeader>
            <CardTitle>Arbeitszeit-Konfiguration</CardTitle>
            <CardDescription>
              Definiere deine regulären Arbeitszeiten für die
              Überstundenberechnung
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="weeklyWorkHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Wöchentliche Arbeitszeit (Stunden)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.5"
                      min="1"
                      max="168"
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseFloat(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Deine vertragliche wöchentliche Arbeitszeit in Stunden
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="workDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Arbeitstage</FormLabel>
                  <FormControl>
                    <WorkDaysSelector
                      value={field.value}
                      onChange={field.onChange}
                      error={form.formState.errors.workDays?.message}
                    />
                  </FormControl>
                  <FormDescription>
                    Wähle die Tage aus, an denen du normalerweise arbeitest
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="defaultStartTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Standard-Startzeit</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormDescription>
                      Deine übliche Arbeitsbeginn-Zeit
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultEndTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Standard-Endzeit</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormDescription>
                      Deine übliche Arbeitsende-Zeit
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="breakDuration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pausendauer (Stunden)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      max="8"
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseFloat(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Deine übliche Pausendauer pro Arbeitstag in Stunden
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zeitzone</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Wähle eine Zeitzone" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Europe/Berlin">
                        Europa/Berlin (GMT+1)
                      </SelectItem>
                      <SelectItem value="Europe/London">
                        Europa/London (GMT)
                      </SelectItem>
                      <SelectItem value="Europe/Paris">
                        Europa/Paris (GMT+1)
                      </SelectItem>
                      <SelectItem value="Europe/Zurich">
                        Europa/Zürich (GMT+1)
                      </SelectItem>
                      <SelectItem value="America/New_York">
                        Amerika/New York (GMT-5)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Deine Zeitzone für korrekte Zeitberechnungen
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Vorschau-Berechnung */}
            {overtimePreview > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Vorschau:</strong> Mit diesen Einstellungen beträgt
                  deine tägliche Soll-Arbeitszeit{" "}
                  <strong>{overtimePreview.toFixed(2)} Stunden</strong>
                  {form.watch("breakDuration") > 0 &&
                    ` (inkl. ${form.watch("breakDuration")} Stunden Pause)`}
                  .
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Benachrichtigungen & Präferenzen */}
        <Card>
          <CardHeader>
            <CardTitle>Benachrichtigungen & Präferenzen</CardTitle>
            <CardDescription>
              Personalisiere deine App-Erfahrung
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="overtimeNotification"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Überstunden-Benachrichtigungen
                    </FormLabel>
                    <FormDescription>
                      Erhalte Benachrichtigungen bei hohen Überstunden
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="theme"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Erscheinungsbild</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Wähle ein Theme" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="light">Hell</SelectItem>
                      <SelectItem value="dark">Dunkel</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Wähle dein bevorzugtes Farbschema
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sprache</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Wähle eine Sprache" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Deine bevorzugte Sprache für die Benutzeroberfläche
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
          >
            {resetMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            Auf Standard zurücksetzen
          </Button>

          <Button
            type="submit"
            disabled={updateMutation.isPending || !form.formState.isDirty}
          >
            {updateMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Einstellungen speichern
          </Button>
        </div>
      </form>
    </Form>
  );
}
