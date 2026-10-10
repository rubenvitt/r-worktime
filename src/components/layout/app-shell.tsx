"use client";

import { useRouter } from "next/navigation";
import type * as React from "react";
import { useMemo, useState } from "react";
import { ShortcutsDialog } from "@/components/app/shortcuts-dialog";
import { useHotkeys } from "@/components/app/use-hotkeys";
import { MobileTabBar, MobileTopBar } from "@/components/layout/mobile-nav";
import { currentWeekHref } from "@/components/layout/nav-config";
import { ShortcutsContext } from "@/components/layout/shortcuts-context";
import { SidebarNav } from "@/components/layout/sidebar-nav";

/** Rahmen aller angemeldeten Seiten: Sidebar (md+), Kopf- und Tab-Leiste mobil. */
export function AppShell({
  userEmail,
  children,
}: {
  userEmail?: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useHotkeys({
    "g h": () => router.push("/dashboard"),
    "g w": () => router.push(currentWeekHref()),
    "g s": () => router.push("/timesheet"),
    "g p": () => router.push("/problems"),
    "g u": () => router.push("/overtime"),
    "g b": () => router.push("/reports"),
    "g e": () => router.push("/entries"),
    "g t": () => router.push("/settings/timing"),
    "g ,": () => router.push("/settings"),
    "?": () => setShortcutsOpen(true),
  });

  const context = useMemo(
    () => ({ openShortcuts: () => setShortcutsOpen(true) }),
    [],
  );

  return (
    <ShortcutsContext.Provider value={context}>
      <div className="min-h-dvh bg-background md:grid md:grid-cols-[208px_minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)]">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-overlay"
        >
          Zum Inhalt springen
        </a>
        <SidebarNav userEmail={userEmail} />
        <div className="flex min-w-0 flex-col">
          <MobileTopBar userEmail={userEmail} />
          <main
            id="main"
            tabIndex={-1}
            className="min-w-0 px-4 pt-6 pb-[calc(var(--app-bottom-inset)+4rem)] outline-none sm:px-6 lg:px-8"
          >
            {children}
          </main>
        </div>
        <MobileTabBar />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </div>
    </ShortcutsContext.Provider>
  );
}
