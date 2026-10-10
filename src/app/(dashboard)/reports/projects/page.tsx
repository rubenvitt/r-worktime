import { Suspense } from "react";
import {
  ProjectsReportView,
  ProjectsSkeleton,
} from "@/components/reports/projects/projects-report-view";
import { ReportFallback } from "@/components/reports/report-header";

export default function ProjectsReportPage() {
  // useSearchParams (?period, ?key) braucht eine Suspense-Grenze
  return (
    <Suspense
      fallback={
        <ReportFallback report="projects">
          <ProjectsSkeleton />
        </ReportFallback>
      }
    >
      <ProjectsReportView />
    </Suspense>
  );
}
