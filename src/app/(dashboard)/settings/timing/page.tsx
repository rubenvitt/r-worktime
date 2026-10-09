"use client";

import { AlertCircle } from "lucide-react";
import { TimingConnectionCard } from "@/components/timing/timing-connection-card";
import { TimingSyncSettingsCard } from "@/components/timing/timing-sync-settings-card";
import { TimingSyncStatusCard } from "@/components/timing/timing-sync-status-card";
import { useTimingSettings } from "@/components/timing/use-timing";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function TimingSettingsPage() {
  const { data: settings, isLoading, error } = useTimingSettings();

  return (
    <div className="container max-w-4xl py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Timing-Sync</h1>
        <p className="text-muted-foreground">
          Übernimm deine Zeiteinträge direkt aus Timing – ohne Datei-Export.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {settings && (
        <div className="space-y-6">
          <TimingConnectionCard settings={settings} />
          <TimingSyncSettingsCard
            // Neu mounten, wenn sich die gespeicherten Werte ändern
            key={`${settings.hasToken}-${settings.syncEnabled}`}
            settings={settings}
          />
          <TimingSyncStatusCard settings={settings} />
        </div>
      )}
    </div>
  );
}
