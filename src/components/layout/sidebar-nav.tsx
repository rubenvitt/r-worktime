"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { closeRange, currentMonth } from "@/components/app/month";
import { SyncIndicator } from "@/components/app/sync-indicator";
import { useProblems } from "@/components/app/use-problems";
import { useTrackingStart } from "@/components/app/use-tracking-start";
import {
  activeNavKey,
  NAV_ITEMS,
  type NavItem,
  type NavKey,
  navItem,
  resolveHref,
} from "@/components/layout/nav-config";
import { UserMenu } from "@/components/layout/user-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

const GROUPS = ["Monatsabschluss", "Auswertung"] as const;

function ProblemsCount() {
  const tracking = useTrackingStart();
  const month = currentMonth();
  const range = tracking.isLoading
    ? null
    : closeRange(month, tracking.trackingStart);
  const { data } = useProblems(
    range ? { startDate: range.startDate, endDate: range.endDate } : null,
  );
  const total = range ? (data?.stats.totalProblems ?? 0) : 0;
  if (total <= 0) return null;
  const monthName = formatMonth(month).split(" ")[0];
  return (
    <span
      className="num ml-auto rounded-xs bg-warning-muted px-1.5 text-xs text-warning"
      title={`${total} offene Tage im ${monthName} bis gestern`}
    >
      {total}
      <span className="sr-only"> offene Tage</span>
    </span>
  );
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={resolveHref(item)}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-11 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground transition-colors duration-[120ms] md:h-8",
        "hover:bg-sidebar-accent",
        active &&
          "bg-sidebar-accent font-medium before:absolute before:inset-y-1.5 before:-left-2 before:w-0.5 before:rounded-full before:bg-primary",
        !active && "text-sidebar-foreground/80",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        aria-hidden="true"
      />
      <span className="truncate">{item.label}</span>
      {item.key === "problems" ? <ProblemsCount /> : null}
    </Link>
  );
}

/** Hauptnavigation (ohne Einstellungen); auch im mobilen Sheet genutzt. */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const active = activeNavKey(pathname);
  const top = NAV_ITEMS.filter((i) => !i.group && i.key !== "settings");

  return (
    <nav aria-label="Hauptnavigation" className="space-y-4">
      <ul className="space-y-0.5">
        {top.map((item) => (
          <li key={item.key}>
            <NavLink
              item={item}
              active={active === item.key}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
      {GROUPS.map((group) => (
        <div key={group}>
          <h2 className="mb-1 px-2 text-xs text-muted-foreground">{group}</h2>
          <ul className="space-y-0.5">
            {NAV_ITEMS.filter((i) => i.group === group).map((item) => (
              <li key={item.key}>
                <NavLink
                  item={item}
                  active={active === item.key}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Fuß der Navigation: Sync-Zeile, Einstellungen, Benutzer. */
export function NavFooter({
  userEmail,
  onNavigate,
}: {
  userEmail?: string | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "";
  const active: NavKey | null = activeNavKey(pathname);
  return (
    <div className="space-y-0.5 border-t border-sidebar-border pt-3">
      <div onClickCapture={onNavigate}>
        <SyncIndicator variant="compact" className="max-md:h-11" />
      </div>
      <NavLink
        item={navItem("settings")}
        active={active === "settings"}
        onNavigate={onNavigate}
      />
      <UserMenu userEmail={userEmail} />
    </div>
  );
}

export function Wordmark({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm font-semibold tracking-[-0.01em]"
    >
      <span aria-hidden="true" className="relative flex h-3 w-4 items-center">
        <span className="h-1.5 w-full rounded-full bg-foreground/70" />
        <span className="absolute top-0 left-2.5 h-3 w-[1.5px] rounded-full bg-primary" />
      </span>
      R-Worktime
    </Link>
  );
}

/** Desktop-Sidebar ab md. */
export function SidebarNav({ userEmail }: { userEmail?: string | null }) {
  return (
    <aside className="sticky top-0 hidden h-dvh border-r border-sidebar-border bg-sidebar md:block">
      <ScrollArea className="h-full">
        <div className="flex min-h-dvh flex-col gap-4 px-3 py-4">
          <Wordmark />
          <div className="flex-1">
            <NavList />
          </div>
          <NavFooter userEmail={userEmail} />
        </div>
      </ScrollArea>
    </aside>
  );
}
