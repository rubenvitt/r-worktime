import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { AppearancePanel } from "@/components/settings/appearance-panel";

const SECTIONS = [
  {
    title: "Arbeitszeit",
    description: "Sollzeit, Arbeitstage, Urlaub, Feiertage, Auffüllen",
    href: "/settings/overtime",
  },
  {
    title: "Timing-Sync",
    description: "API-Key, Projekt-Wurzeln, Sync-Status",
    href: "/settings/timing",
  },
  {
    title: "Datei-Import",
    description: "Fallback für Timing-Exporte",
    href: "/upload",
  },
] as const;

export default function SettingsPage() {
  return (
    <PageContainer width="form">
      <PageHeader title="Einstellungen" />
      <div className="space-y-6">
        <Panel aria-label="Bereiche">
          <ul className="divide-y">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <Link
                  href={section.href}
                  className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {section.title}
                    </span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {section.description}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <AppearancePanel />
      </div>
    </PageContainer>
  );
}
