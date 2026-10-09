"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SyncIndicator } from "@/components/app/sync-indicator";
import {
  activeNavKey,
  type NavKey,
  navItem,
  resolveHref,
} from "@/components/layout/nav-config";
import { NavFooter, NavList, Wordmark } from "@/components/layout/sidebar-nav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Mobile Kopfleiste mit Menü-Button (öffnet das Sheet), Titel und Sync-Punkt. */
export function MobileTopBar({ userEmail }: { userEmail?: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";
  const active = activeNavKey(pathname);
  const title = active ? navItem(active).label : "R-Worktime";
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-1 border-b bg-background/95 px-1 backdrop-blur md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 md:hidden"
            aria-label="Navigation öffnen"
          >
            <MenuIcon className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="gap-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Bereiche von R-Worktime
          </SheetDescription>
          <div className="flex h-full flex-col gap-4 overflow-y-auto px-3 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex h-11 items-center">
              <Wordmark onNavigate={close} />
            </div>
            <div className="flex-1">
              <NavList onNavigate={close} />
            </div>
            <NavFooter userEmail={userEmail} onNavigate={close} />
          </div>
        </SheetContent>
      </Sheet>
      <span className="min-w-0 flex-1 truncate text-base font-semibold">
        {title}
      </span>
      <SyncIndicator variant="dot" />
    </header>
  );
}

const TABS: NavKey[] = ["overview", "week", "timesheet", "overtime"];

/** Untere Tab-Leiste mobil mit vier Zielen. */
export function MobileTabBar() {
  const pathname = usePathname() ?? "";
  const active = activeNavKey(pathname);

  return (
    <nav
      aria-label="Schnellzugriff"
      className="fixed inset-x-0 bottom-0 z-40 grid h-[var(--app-bottom-inset)] grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {TABS.map((key) => {
        const item = navItem(key);
        const Icon = item.icon;
        const isActive = active === key;
        return (
          <Link
            key={key}
            href={resolveHref(item)}
            aria-label={item.shortLabel ? item.label : undefined}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors duration-[120ms]",
              isActive
                ? "font-medium text-foreground before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-full before:bg-primary"
                : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span>{item.shortLabel ?? item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
