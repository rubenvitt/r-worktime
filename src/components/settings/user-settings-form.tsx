"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type * as React from "react";
import { useEffect, useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ErrorState } from "@/components/app/error-state";
import { SkeletonPanel } from "@/components/app/skeletons";
import { StickyActionBar } from "@/components/app/sticky-action-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
import { formatHours } from "@/lib/format";
import {
  DEFAULT_SETTINGS,
  type UserSettingsResponse,
  type UserSettingsUpdate,
  userSettingsUpdateSchema,
  WORK_DAY_LABELS,
} from "@/types/settings";
import { SettingsSection } from "./settings-section";
import { WorkDaysSelector } from "./work-days-selector";

// Werte bleiben unverändert, nur die Beschriftung ohne GMT-Offset
const TIMEZONES = [
  { value: "Europe/Berlin", label: "Europa/Berlin" },
  { value: "Europe/London", label: "Europa/London" },
  { value: "Europe/Paris", label: "Europa/Paris" },
  { value: "Europe/Zurich", label: "Europa/Zürich" },
  { value: "America/New_York", label: "Amerika/New York" },
];

// Satz aus DEFAULT_SETTINGS, damit der Text zur Server-Logik passt
const DEFAULT_DAYS = (DEFAULT_SETTINGS.workDays ?? [])
  .map((day) =>
    WORK_DAY_LABELS[day as keyof typeof WORK_DAY_LABELS]?.slice(0, 2),
  )
  .join(", ");
const DEFAULTS_SUMMARY = [
  `Setzt die Werte dieser Seite zurück: ${DEFAULT_SETTINGS.weeklyWorkHours ?? 40} Wochenstunden`,
  DEFAULT_DAYS,
  `${DEFAULT_SETTINGS.defaultStartTime}–${DEFAULT_SETTINGS.defaultEndTime}`,
  `Pause ${formatHours(DEFAULT_SETTINGS.breakDuration ?? 0)}.`,
].join(", ");

const baseResolver = zodResolver(userSettingsUpdateSchema);

/** Wie der zod-Resolver, aber mit deutschem Text für leere Zahlenfelder. */
const resolver: typeof baseResolver = async (values, context, options) => {
  const result = await baseResolver(values, context, options);
  for (const error of Object.values(result.errors ?? {})) {
    const fieldError = error as { type?: string; message?: string } | undefined;
    if (fieldError?.type === "invalid_type") {
      fieldError.message = "Gib eine Zahl ein.";
    }
  }
  return result;
};

function toNumber(value: string): number {
  return Number.parseFloat(value.replace(",", "."));
}

function NumberWithSuffix({
  suffix,
  ...props
}: React.ComponentProps<typeof Input> & { suffix: string }) {
  return (
    <div className="relative w-full max-w-40">
      <Input {...props} className="num pr-9" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
      >
        {suffix}
      </span>
    </div>
  );
}

/**
 * Formular für Sollzeit und Standardzeiten. `children` sind weitere
 * Abschnitte der Seite (außerhalb des <form>), die Speicherleiste kommt danach.
 */
export function UserSettingsForm({ children }: { children?: React.ReactNode }) {
  const queryClient = useQueryClient();
  const formId = useId();
  const [resetOpen, setResetOpen] = useState(false);

  const {
    data: settings,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      const response = await fetch("/api/settings");
      if (!response.ok) {
        throw new Error("Die Einstellungen konnten nicht geladen werden.");
      }
      const data = await response.json();
      return data.data as UserSettingsResponse;
    },
  });

  const form = useForm<UserSettingsUpdate>({
    resolver,
    defaultValues: DEFAULT_SETTINGS,
  });

  // Geladene Werte übernehmen. Sprache, Benachrichtigung und Theme sind
  // nicht sichtbar, bleiben aber im Formularzustand und gehen unverändert mit.
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

  const updateMutation = useMutation({
    mutationFn: async (data: UserSettingsUpdate) => {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Die Arbeitszeit konnte nicht gespeichert werden.",
        );
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      queryClient.invalidateQueries({ queryKey: ["overtime"] });
      toast.success("Arbeitszeit gespeichert");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

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
      toast.success("Standardwerte wiederhergestellt");
      setResetOpen(false);
    },
    onError: () => {
      toast.error("Die Standardwerte konnten nicht wiederhergestellt werden.");
    },
  });

  // Live-Satz: Soll pro Arbeitstag
  const weeklyWorkHours = useWatch({
    control: form.control,
    name: "weeklyWorkHours",
  });
  const workDays = useWatch({ control: form.control, name: "workDays" });
  const breakDuration = useWatch({
    control: form.control,
    name: "breakDuration",
  });
  const dayCount = workDays?.length ?? 0;
  const dailyTarget =
    Number.isFinite(weeklyWorkHours) && weeklyWorkHours > 0 && dayCount > 0
      ? weeklyWorkHours / dayCount
      : null;

  const onSubmit = (data: UserSettingsUpdate) => {
    updateMutation.mutate(data);
  };

  const onInvalid = () => {
    toast.error("Bitte prüf die markierten Felder.");
  };

  const isDirty = form.formState.isDirty;

  let formBody: React.ReactNode;
  if (isLoading) {
    formBody = (
      <div className="space-y-4">
        <SkeletonPanel lines={4} />
        <SkeletonPanel lines={3} />
      </div>
    );
  } else if (error) {
    formBody = (
      <ErrorState
        title="Arbeitszeit konnte nicht geladen werden"
        error={error}
        onRetry={() => refetch()}
      />
    );
  } else {
    formBody = (
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          className="space-y-6"
          noValidate
        >
          <SettingsSection id="sollzeit" title="Sollzeit" first>
            <FormField
              control={form.control}
              name="weeklyWorkHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Wochenstunden</FormLabel>
                  <FormControl>
                    <NumberWithSuffix
                      suffix="h"
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="1"
                      max="168"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={Number.isFinite(field.value) ? field.value : ""}
                      onChange={(e) => field.onChange(toNumber(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Deine vertragliche Arbeitszeit pro Woche.
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
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <p className="text-sm" aria-live="polite">
              {dailyTarget !== null ? (
                <>
                  Das sind{" "}
                  <span className="num font-medium">
                    {formatHours(dailyTarget)}
                  </span>{" "}
                  pro Arbeitstag.
                </>
              ) : (
                <span className="text-muted-foreground">
                  Wähl Wochenstunden und mindestens einen Arbeitstag.
                </span>
              )}
            </p>
          </SettingsSection>

          <SettingsSection
            id="standardzeiten"
            title="Standardzeiten fürs Auffüllen"
            description="Wird beim Auffüllen verwendet, nicht für dein Soll."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="defaultStartTime"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Start</FormLabel>
                    <FormControl>
                      <Input type="time" className="num" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultEndTime"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Ende</FormLabel>
                    <FormControl>
                      <Input type="time" className="num" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="breakDuration"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Pause</FormLabel>
                    <FormControl>
                      <NumberWithSuffix
                        suffix="h"
                        type="number"
                        inputMode="decimal"
                        step="0.25"
                        min="0"
                        max="8"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={Number.isFinite(field.value) ? field.value : ""}
                        onChange={(e) =>
                          field.onChange(toNumber(e.target.value))
                        }
                      />
                    </FormControl>
                    <FormDescription className="num">
                      {Number.isFinite(breakDuration) && breakDuration >= 0
                        ? formatHours(breakDuration)
                        : "—"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zeitzone</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full sm:w-64">
                        <SelectValue placeholder="Zeitzone wählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SettingsSection>
        </form>
      </Form>
    );
  }

  return (
    <div className="space-y-6">
      {formBody}

      {children}

      {settings ? (
        <SettingsSection
          id="standardwerte"
          title="Standardwerte"
          description={DEFAULTS_SUMMARY}
        >
          <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full sm:h-9 sm:w-auto"
                disabled={resetMutation.isPending}
              >
                Auf Standardwerte zurücksetzen …
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Auf Standardwerte zurücksetzen?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Deine Sollzeit und Standardzeiten werden überschrieben. Das
                  ändert auch dein Soll und damit den Saldo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    resetMutation.mutate();
                  }}
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending && (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  )}
                  Zurücksetzen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SettingsSection>
      ) : null}

      <StickyActionBar open={isDirty}>
        <span className="text-sm font-medium">Ungespeicherte Änderungen</span>
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-9"
            onClick={() => form.reset()}
            disabled={updateMutation.isPending}
          >
            Verwerfen
          </Button>
          <Button
            type="submit"
            form={formId}
            className="h-11 sm:h-9"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending && (
              <Loader2 className="animate-spin" aria-hidden="true" />
            )}
            Speichern
          </Button>
        </div>
      </StickyActionBar>
    </div>
  );
}
