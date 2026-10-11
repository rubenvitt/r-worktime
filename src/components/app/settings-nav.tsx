"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings/overtime", label: "Arbeitszeit" },
  { href: "/settings/timing", label: "Timing-Sync" },
  { href: "/settings/calendar", label: "Kalender" },
  { href: "/upload", label: "Datei-Import" },
] as const;

/** Unternavigation der Einstellungen in Tabs-Optik. */
export function SettingsNav() {
  const pathname = usePathname() ?? "";
  return (
    // md:-mb-4 hebt die PageHeader-Polsterung auf: der aktive Strich liegt auf der Kopf-Linie
    <nav aria-label="Einstellungen" className="flex min-w-max gap-1 md:-mb-4">
      {ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center md:-mb-px border-b-2 px-3 text-sm transition-colors duration-[120ms] md:h-9",
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
