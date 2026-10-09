import { ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HolidayImport } from "@/components/upload/holiday-import";
import { UploadZone } from "@/components/upload/upload-zone";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function UploadPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const integration = session.user?.id
    ? await prisma.timingIntegration.findUnique({
        where: { userId: session.user.id },
        select: { apiTokenEnc: true, syncEnabled: true },
      })
    : null;
  const syncActive = Boolean(
    integration?.apiTokenEnc && integration.syncEnabled,
  );

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
        <Card>
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <RefreshCw className="mt-1 h-6 w-6 shrink-0 text-primary" />
            <div className="space-y-1">
              <CardTitle className="text-lg">
                {syncActive
                  ? "Timing-Sync ist aktiv"
                  : "Timing direkt verbinden"}
              </CardTitle>
              <CardDescription>
                {syncActive
                  ? "Deine Einträge kommen automatisch aus Timing. Den Datei-Import brauchst du nur noch als Fallback."
                  : "Statt JSON-Dateien zu exportieren, kann r-worktime deine Zeiteinträge direkt über die Timing-API abgleichen – auch automatisch im Hintergrund."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild variant={syncActive ? "outline" : "default"}>
              <Link href="/settings/timing">
                {syncActive ? "Sync-Status ansehen" : "Timing verbinden"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
        <HolidayImport />
        <UploadZone />
      </div>
    </div>
  );
}
