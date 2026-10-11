"use client";

import Link from "next/link";
import type { CalendarSettings } from "@/components/calendar/api-types";
import { useCalendarSettings } from "@/components/calendar/use-calendar";
import { formatRelative, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

const CALENDAR_SETTINGS_HREF = "/settings/calendar";

const linkClass =
  "font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring";

/** Zeile zum Kalender-Abgleich; Inhalt ohne Datenabruf, für Tests. */
export function CalendarSyncHintText({
  settings,
}: {
  settings: CalendarSettings;
}) {
  if (!settings.configured) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Abwesenheiten aus Timewarp lassen sich automatisch übernehmen.{" "}
        <Link href={CALENDAR_SETTINGS_HREF} className={linkClass}>
          Kalender einrichten
        </Link>
      </p>
    );
  }

  const failed = settings.lastSyncStatus === "error";
  return (
    <p
      className={cn(
        "text-[13px]",
        failed ? "text-warning" : "text-muted-foreground",
      )}
    >
      {failed ? (
        "Der letzte Kalender-Abgleich ist fehlgeschlagen."
      ) : settings.lastSyncAt ? (
        <>
          Kalender zuletzt abgeglichen{" "}
          <time
            dateTime={settings.lastSyncAt}
            title={formatTimestamp(settings.lastSyncAt)}
            className="num"
          >
            {formatRelative(settings.lastSyncAt)}
          </time>
          .
        </>
      ) : (
        "Kalender noch nicht abgeglichen."
      )}{" "}
      <Link href={CALENDAR_SETTINGS_HREF} className={linkClass}>
        Einstellungen
      </Link>
    </p>
  );
}

/**
 * Hinweis zum Kalender-Abgleich im Abwesenheitsbericht. Lädt still: Solange
 * die Einstellungen laden oder nicht abrufbar sind, steht hier nichts.
 */
export function CalendarSyncHint({ className }: { className?: string }) {
  const { data } = useCalendarSettings({ quiet: true });
  if (!data) return null;
  return (
    <div className={className}>
      <CalendarSyncHintText settings={data} />
    </div>
  );
}
