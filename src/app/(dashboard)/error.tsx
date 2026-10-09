"use client";

import Link from "next/link";
import { ErrorState } from "@/components/app/error-state";
import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageContainer>
      <PageHeader title="Seite konnte nicht geladen werden" />
      <div className="space-y-4">
        <ErrorState
          title="Beim Laden ist ein Fehler aufgetreten"
          error={error}
          onRetry={reset}
        />
        <Button asChild variant="outline">
          <Link href="/dashboard">Zur Übersicht</Link>
        </Button>
      </div>
    </PageContainer>
  );
}
