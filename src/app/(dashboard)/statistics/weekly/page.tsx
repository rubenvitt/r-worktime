import { redirect } from "next/navigation";
import { currentWeekHref } from "@/components/layout/nav-config";

// Nie vorrendern: Die aktuelle Woche hängt vom Abrufzeitpunkt ab.
export const dynamic = "force-dynamic";

interface WeeklyStatisticsPageProps {
  searchParams: Promise<{ year?: string | string[]; week?: string | string[] }>;
}

function toInt(value: string | string[] | undefined): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/** Die Wochenstatistik ist in der Woche aufgegangen (Tab „Diagramm“). */
export default async function WeeklyStatisticsPage({
  searchParams,
}: WeeklyStatisticsPageProps) {
  const params = await searchParams;
  const year = toInt(params.year);
  const week = toInt(params.week);

  if (year !== null && week !== null && week >= 1 && week <= 53) {
    redirect(`/week/${year}/${week}`);
  }
  redirect(currentWeekHref());
}
