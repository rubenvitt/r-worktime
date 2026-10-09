import { redirect } from "next/navigation";
import { Suspense } from "react";
import { WeekView } from "@/components/week/week-view";
import { WeekViewSkeleton } from "@/components/week/week-view-skeleton";
import { auth } from "@/lib/auth";

interface WeekPageProps {
  params: Promise<{
    year: string;
    week: string;
  }>;
}

export default async function WeekPage({ params }: WeekPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Next 16: params ist ein Promise
  const { year: yearParam, week: weekParam } = await params;
  const year = parseInt(yearParam, 10);
  const week = parseInt(weekParam, 10);

  // Validierung
  if (Number.isNaN(year) || Number.isNaN(week) || week < 1 || week > 53) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto py-8">
      <Suspense fallback={<WeekViewSkeleton />}>
        <WeekView year={year} week={week} />
      </Suspense>
    </div>
  );
}
