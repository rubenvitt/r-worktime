"use client";

import { ErrorState } from "@/components/app/error-state";
import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings-nav";
import { SkeletonPanel } from "@/components/app/skeletons";
import { TimingConnectionCard } from "@/components/timing/timing-connection-card";
import { TimingSyncSettingsCard } from "@/components/timing/timing-sync-settings-card";
import {
  TimingSyncNowButton,
  TimingSyncStatusCard,
} from "@/components/timing/timing-sync-status-card";
import {
  useRunTimingSync,
  useTimingSettings,
} from "@/components/timing/use-timing";

/** Springt zum API-Key-Feld der Verbindung und fokussiert es. */
function focusTokenInput() {
  const input = document.getElementById("timing-token");
  if (!input) return;
  input.scrollIntoView({ behavior: "smooth", block: "center" });
  input.focus({ preventScroll: true });
}

export default function TimingSettingsPage() {
  const { data: settings, isLoading, error, refetch } = useTimingSettings();
  // Eine Mutation für Kopf-Button und Statuskarte, damit beide „läuft“ zeigen
  const sync = useRunTimingSync();

  return (
    <PageContainer width="form">
      <PageHeader
        title="Timing-Sync"
        description="Übernimmt deine Zeiteinträge direkt aus Timing."
        actions={
          settings?.hasToken ? (
            <TimingSyncNowButton settings={settings} sync={sync} />
          ) : undefined
        }
        toolbar={<SettingsNav />}
      />

      {isLoading && (
        <div className="space-y-6">
          <SkeletonPanel lines={4} />
          <SkeletonPanel lines={5} />
          <SkeletonPanel lines={3} />
        </div>
      )}

      {error && (
        <ErrorState
          title="Timing-Einstellungen konnten nicht geladen werden"
          error={error}
          onRetry={() => refetch()}
        />
      )}

      {settings && (
        <div className="space-y-6">
          <TimingSyncStatusCard
            settings={settings}
            sync={sync}
            onConnect={focusTokenInput}
          />
          <TimingSyncSettingsCard
            // Neu mounten, wenn sich die gespeicherten Werte ändern
            key={`${settings.hasToken}-${settings.syncEnabled}`}
            settings={settings}
          />
          <TimingConnectionCard settings={settings} />
        </div>
      )}
    </PageContainer>
  );
}
