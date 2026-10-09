import { Info } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings-nav";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
    <PageContainer width="form">
      <PageHeader
        title="Datei-Import"
        description="Fallback, falls der Sync einen Zeitraum nicht abdeckt."
        toolbar={<SettingsNav />}
      />

      <div className="space-y-6">
        <Alert variant="info">
          <Info />
          <AlertDescription className="text-foreground">
            <p>
              {syncActive
                ? "Der Timing-Sync ist aktiv. Ein Datei-Import ist normalerweise nicht nötig."
                : "Statt Dateien zu importieren, kannst du Timing direkt verbinden. Dann kommen deine Einträge automatisch."}
            </p>
            <Link
              href="/settings/timing"
              className="mt-1 inline-flex min-h-11 items-center font-medium underline underline-offset-4 hover:text-primary md:min-h-0"
            >
              {syncActive ? "Zum Timing-Sync" : "Timing verbinden"}
            </Link>
          </AlertDescription>
        </Alert>

        <UploadZone />
      </div>
    </PageContainer>
  );
}
