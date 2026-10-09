import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageContainer } from "@/components/app/page-container";
import { SkeletonPanel, SkeletonRows } from "@/components/app/skeletons";
import { TimesheetView } from "@/components/timesheet/timesheet-view";
import { auth } from "@/lib/auth";

export default async function TimesheetPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  // useSearchParams (?month, ?filter) braucht eine Suspense-Grenze
  return (
    <Suspense
      fallback={
        <PageContainer>
          <div className="space-y-6">
            <SkeletonPanel lines={4} />
            <div className="rounded-lg border bg-card">
              <SkeletonRows count={6} height={56} />
            </div>
          </div>
        </PageContainer>
      }
    >
      <TimesheetView />
    </Suspense>
  );
}
