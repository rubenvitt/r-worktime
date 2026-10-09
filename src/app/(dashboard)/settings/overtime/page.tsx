"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings-nav";
import { useTrackingStart } from "@/components/app/use-tracking-start";
import { BulkFillDialog } from "@/components/settings/bulk-fill-dialog";
import { SettingsSection } from "@/components/settings/settings-section";
import { UserSettingsForm } from "@/components/settings/user-settings-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HolidayImport } from "@/components/upload/holiday-import";
import { formatDelta } from "@/lib/format";
import type { UserSettingsResponse } from "@/types/settings";

/** "2026-08-02" → "02.08.2026" */
function formatDateKey(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

function OpeningBalance() {
  const { adjustmentDate, adjustmentMinutes, isLoading } = useTrackingStart();

  if (isLoading) {
    return <Skeleton className="h-5 w-72 max-w-full" />;
  }
  if (!adjustmentDate || adjustmentMinutes === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Kein Anfangs-Saldo hinterlegt.
      </p>
    );
  }
  return (
    <p className="max-w-prose text-sm">
      Anfangs-Saldo{" "}
      <span className="num font-medium">{formatDelta(adjustmentMinutes)}</span>{" "}
      am <span className="num">{formatDateKey(adjustmentDate)}</span>. Du siehst
      ihn in den{" "}
      <Link
        href={`/entries?dateFrom=${adjustmentDate}&dateTo=${adjustmentDate}`}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        Zeiteinträgen
      </Link>{" "}
      als Saldo-Buchung.
    </p>
  );
}

export default function OvertimeSettingsPage() {
  const [bulkFillOpen, setBulkFillOpen] = useState(false);

  // Gleicher Cache wie im Formular; liefert die Wochenstunden fürs Auffüllen
  const { data: settings } = useQuery({
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

  return (
    <PageContainer width="form">
      <PageHeader
        title="Arbeitszeit"
        description="Daraus berechnet sich dein Soll."
        toolbar={<SettingsNav />}
      />

      <UserSettingsForm>
        <SettingsSection
          id="feiertage"
          title="Feiertage"
          description="Legt die gesetzlichen Feiertage in Niedersachsen als Einträge mit deinem Tages-Soll an."
        >
          <HolidayImport />
        </SettingsSection>

        <SettingsSection
          id="auffuellen"
          title="Arbeitstage auffüllen"
          description="Trägt für einen vergangenen Zeitraum an jedem Arbeitstag deine Standardzeiten ein, z. B. für Wochen vor deinem ersten Sync."
        >
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:h-9 sm:w-auto"
            onClick={() => setBulkFillOpen(true)}
          >
            Zeitraum auffüllen …
          </Button>
        </SettingsSection>

        <SettingsSection id="anfangs-saldo" title="Anfangs-Saldo">
          <OpeningBalance />
        </SettingsSection>
      </UserSettingsForm>

      <BulkFillDialog
        open={bulkFillOpen}
        onOpenChange={setBulkFillOpen}
        weeklyWorkHours={settings?.weeklyWorkHours || 40}
      />
    </PageContainer>
  );
}
