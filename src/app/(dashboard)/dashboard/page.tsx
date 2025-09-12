import { Calendar } from "lucide-react";
import { OvertimeCard } from "@/components/dashboard/overtime-card";
import { OvertimeYearSelector } from "@/components/dashboard/overtime-year-selector";
import { ProblemsWidget } from "@/components/dashboard/problems-widget";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Willkommen zurück, {session?.user?.name || session?.user?.email}!
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Hier ist deine Übersicht für heute
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Overtime Card - Spans 2 columns on large screens */}
        <OvertimeCard />

        {/* Yearly Overtime Selector */}
        <OvertimeYearSelector />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wochenstunden</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0h</div>
            <p className="text-xs text-muted-foreground">von 40h Sollzeit</p>
          </CardContent>
        </Card>
      </div>

      {/* Problems and Activity Grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Problems Widget */}
        <ProblemsWidget />

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Letzte Aktivitäten</CardTitle>
            <CardDescription>Deine letzten Zeiteinträge</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Noch keine Zeiteinträge vorhanden. Starte mit deinem ersten
              Eintrag!
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
