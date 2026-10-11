"use client";

import { ErrorState } from "@/components/app/error-state";
import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings-nav";
import { SkeletonPanel } from "@/components/app/skeletons";
import {
  CalendarFeedCard,
  FEED_INPUT_ID,
} from "@/components/calendar/calendar-feed-card";
import { CalendarSyncLogPanel } from "@/components/calendar/calendar-sync-log";
import { CalendarSyncSettingsCard } from "@/components/calendar/calendar-sync-settings-card";
import { CalendarSyncStatusCard } from "@/components/calendar/calendar-sync-status-card";
import {
  useCalendarSettings,
  useRunCalendarSync,
} from "@/components/calendar/use-calendar";

/** Springt zum Feld für die Feed-Adresse und fokussiert es. */
function focusFeedInput() {
  const input = document.getElementById(FEED_INPUT_ID);
  if (!input) return;
  input.scrollIntoView({ behavior: "smooth", block: "center" });
  input.focus({ preventScroll: true });
}

export default function CalendarSettingsPage() {
  const { data: settings, isLoading, error, refetch } = useCalendarSettings();
  const sync = useRunCalendarSync();

  return (
    <PageContainer width="form">
      <PageHeader
        title="Kalender"
        description="Übernimmt deine Abwesenheiten aus Timewarp und trägt Urlaub in Timing ein."
        toolbar={<SettingsNav />}
      />

      {isLoading && (
        <div className="space-y-6">
          <SkeletonPanel lines={3} />
          <SkeletonPanel lines={4} />
          <SkeletonPanel lines={5} />
        </div>
      )}

      {error && (
        <ErrorState
          title="Kalender-Einstellungen konnten nicht geladen werden"
          error={error}
          onRetry={() => refetch()}
        />
      )}

      {settings && (
        <div className="space-y-6">
          <CalendarSyncStatusCard
            settings={settings}
            sync={sync}
            onConfigure={focusFeedInput}
          />
          <CalendarFeedCard settings={settings} />
          <CalendarSyncSettingsCard
            // Neu mounten, wenn sich die gespeicherten Werte ändern
            key={[
              settings.configured,
              settings.timingConnected,
              settings.timingProjectId,
              settings.writeToTiming,
              settings.syncEnabled,
            ].join("|")}
            settings={settings}
          />
          {settings.configured ? <CalendarSyncLogPanel /> : null}
        </div>
      )}
    </PageContainer>
  );
}
