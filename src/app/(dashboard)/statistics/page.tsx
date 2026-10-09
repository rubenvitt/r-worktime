import { redirect } from "next/navigation";
import { currentWeekHref } from "@/components/layout/nav-config";

// Nie vorrendern: Die aktuelle Woche hängt vom Abrufzeitpunkt ab.
export const dynamic = "force-dynamic";

/** Die Statistik ist in der Woche aufgegangen. */
export default function StatisticsPage() {
  redirect(currentWeekHref());
}
