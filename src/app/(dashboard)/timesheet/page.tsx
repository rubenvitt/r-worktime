import { redirect } from "next/navigation";
import { TimesheetView } from "@/components/timesheet/timesheet-view";
import { auth } from "@/lib/auth";

export default async function TimesheetPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  return <TimesheetView />;
}
