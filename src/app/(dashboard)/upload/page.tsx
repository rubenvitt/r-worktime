import { redirect } from "next/navigation";
import { HolidayImport } from "@/components/upload/holiday-import";
import { UploadZone } from "@/components/upload/upload-zone";
import { auth } from "@/lib/auth";

export default async function UploadPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Timing Import
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Importiere deine Zeiteinträge aus Timing
        </p>
      </div>

      <div className="space-y-6">
        <HolidayImport />
        <UploadZone />
      </div>
    </div>
  );
}
