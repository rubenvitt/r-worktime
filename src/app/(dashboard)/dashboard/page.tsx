import { defaultCloseMonth } from "@/components/app/month";
import { MonthClosePanel } from "@/components/app/month-close-panel";
import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { DashboardStats } from "@/components/overview/dashboard-stats";
import { RecentEntries } from "@/components/overview/recent-entries";
import { RecentProblemsPanel } from "@/components/overview/recent-problems-panel";
import { WeekDaysPanel } from "@/components/overview/week-days-panel";
import { currentIsoWeek } from "@/components/week/week-utils";
import { formatDateLong } from "@/lib/format";

export default function DashboardPage() {
  const now = new Date();
  const { week } = currentIsoWeek(now);

  return (
    <PageContainer>
      <PageHeader
        title="Übersicht"
        description={`${formatDateLong(now)} · KW ${week}`}
      />
      <div className="space-y-6">
        <DashboardStats />
        {/* Mobil: Monatsabschluss und Probleme zuerst, dann die Woche */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start">
          <div className="min-w-0 space-y-4 md:order-2">
            <MonthClosePanel month={defaultCloseMonth(now)} variant="compact" />
            <RecentProblemsPanel />
          </div>
          <WeekDaysPanel className="md:order-1" />
        </div>
        <RecentEntries />
      </div>
    </PageContainer>
  );
}
