import type * as React from "react";
import { PageHeader } from "@/components/app/page-header";
import { ReportsNav } from "@/components/reports/reports-nav";

/** Titel und Beschreibung der Berichte – gemeinsam für Seite und Ladezustand. */
export const REPORT_META = {
  projects: {
    title: "Projekte",
    description:
      "Stunden je Projekt im gewählten Zeitraum, mit Verlauf der größten Projekte.",
  },
  billing: {
    title: "Abrechnung",
    description: "Abrechenbare Stunden nach Abrechnungsstatus aus Timing.",
  },
  year: {
    title: "Jahr & Prognose",
    description:
      "Jahresverlauf und Prognose für die nächsten Monate aus Urlaub, Feiertagen und Vergangenheit.",
  },
  absences: {
    title: "Abwesenheiten",
    description: "Urlaub, Krankheit und Feiertage, mit Resturlaub.",
  },
  travel: {
    title: "Reisetage",
    description:
      "Automatisch erkannte oder von dir festgelegte Reisetage – mit Stunden, Monatssummen und CSV für die Steuererklärung.",
  },
  patterns: {
    title: "Arbeitszeit",
    description:
      "Wann du arbeitest: Beginn, Ende, Pausen und Muster über die Woche.",
  },
} as const;

export type ReportId = keyof typeof REPORT_META;

/** Seitenkopf eines Berichts mit Berichte-Tabs; Zeitraum und Aktionen rechts. */
export function ReportHeader({
  report,
  period,
  actions,
}: {
  report: ReportId;
  period?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { title, description } = REPORT_META[report];
  return (
    <PageHeader
      title={title}
      description={description}
      toolbar={<ReportsNav />}
      period={period}
      actions={actions}
    />
  );
}

/** Suspense-Ersatz der Berichtsseiten: Kopf ohne Steuerung plus Skelett. */
export function ReportFallback({
  report,
  children,
}: {
  report: ReportId;
  children: React.ReactNode;
}) {
  return (
    <>
      <ReportHeader report={report} />
      <div className="space-y-6" aria-busy="true">
        {children}
      </div>
    </>
  );
}
