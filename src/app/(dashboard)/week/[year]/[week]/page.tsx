import { redirect } from "next/navigation";
import { PageContainer } from "@/components/app/page-container";
import { WeekView } from "@/components/week/week-view";
import { auth } from "@/lib/auth";
import { isValidIsoWeek } from "@/lib/dates";

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

  // Validierung: nur ISO-Wochen, die es im Jahr gibt
  if (!isValidIsoWeek(year, week)) {
    redirect("/dashboard");
  }

  return (
    <PageContainer>
      <WeekView year={year} week={week} />
    </PageContainer>
  );
}
