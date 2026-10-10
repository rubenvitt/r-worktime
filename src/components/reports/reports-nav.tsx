"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const REPORT_TABS = [
  { href: "/reports/projects", label: "Projekte" },
  { href: "/reports/billing", label: "Abrechnung" },
  { href: "/reports/year", label: "Jahr & Prognose" },
  { href: "/reports/absences", label: "Abwesenheiten" },
  { href: "/reports/travel", label: "Reisetage" },
  { href: "/reports/patterns", label: "Arbeitszeit" },
] as const;

/** Unternavigation der Berichte in Tabs-Optik (wie die Einstellungen). */
export function ReportsNav() {
  const pathname = usePathname() ?? "";
  return (
    // md:-mb-4 hebt die PageHeader-Polsterung auf: der aktive Strich liegt auf der Kopf-Linie
    <nav aria-label="Berichte" className="flex min-w-max gap-1 md:-mb-4">
      {REPORT_TABS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center whitespace-nowrap md:-mb-px border-b-2 px-3 text-sm transition-colors duration-[120ms] md:h-9",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
