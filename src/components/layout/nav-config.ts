import {
  CalendarRange,
  ChartColumn,
  CircleAlert,
  FileText,
  LayoutGrid,
  List,
  type LucideIcon,
  Scale,
  Settings,
} from "lucide-react";
import { berlinTodayKey, isoWeekOf } from "@/lib/dates";

export type NavKey =
  | "overview"
  | "week"
  | "timesheet"
  | "problems"
  | "overtime"
  | "reports"
  | "entries"
  | "settings";

export const ACTIVE_RULES: ReadonlyArray<readonly [RegExp, NavKey]> = [
  [/^\/dashboard(\/|$)/, "overview"],
  [/^\/(week|statistics)(\/|$)/, "week"],
  [/^\/timesheet(\/|$)/, "timesheet"],
  [/^\/problems(\/|$)/, "problems"],
  [/^\/overtime(\/|$)/, "overtime"],
  [/^\/reports(\/|$)/, "reports"],
  [/^\/entries(\/|$)/, "entries"],
  [/^\/(settings|upload)(\/|$)/, "settings"],
];

/** Erste passende Regel; höchstens ein aktiver Eintrag. */
export function activeNavKey(pathname: string): NavKey | null {
  for (const [pattern, key] of ACTIVE_RULES) {
    if (pattern.test(pathname)) return key;
  }
  return null;
}

/** Aktuelle ISO-Woche (Berliner Kalendertag): `/week/{isoYear}/{isoWeek}` */
export function currentWeekHref(now: Date = new Date()): string {
  const { year, week } = isoWeekOf(berlinTodayKey(now));
  return `/week/${year}/${week}`;
}

export interface NavItem {
  key: NavKey;
  label: string;
  shortLabel?: string;
  href: string | (() => string);
  icon: LucideIcon;
  shortcut?: string;
  group?: "Monatsabschluss" | "Auswertung";
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: "overview",
    label: "Übersicht",
    href: "/dashboard",
    icon: LayoutGrid,
    shortcut: "g h",
  },
  {
    key: "week",
    label: "Woche",
    href: () => currentWeekHref(),
    icon: CalendarRange,
    shortcut: "g w",
  },
  {
    key: "timesheet",
    label: "Stundenzettel",
    shortLabel: "Zettel",
    href: "/timesheet",
    icon: FileText,
    shortcut: "g s",
    group: "Monatsabschluss",
  },
  {
    key: "problems",
    label: "Probleme",
    href: "/problems",
    icon: CircleAlert,
    shortcut: "g p",
    group: "Monatsabschluss",
  },
  {
    key: "overtime",
    label: "Überstunden",
    shortLabel: "Saldo",
    href: "/overtime",
    icon: Scale,
    shortcut: "g u",
    group: "Auswertung",
  },
  {
    key: "reports",
    label: "Berichte",
    href: "/reports",
    icon: ChartColumn,
    shortcut: "g b",
    group: "Auswertung",
  },
  {
    key: "entries",
    label: "Zeiteinträge",
    href: "/entries",
    icon: List,
    shortcut: "g e",
    group: "Auswertung",
  },
  {
    key: "settings",
    label: "Einstellungen",
    href: "/settings",
    icon: Settings,
    shortcut: "g ,",
  },
];

export function resolveHref(item: NavItem): string {
  return typeof item.href === "function" ? item.href() : item.href;
}

export function navItem(key: NavKey): NavItem {
  const item = NAV_ITEMS.find((i) => i.key === key);
  if (!item) throw new Error(`Unbekannter Navigationseintrag: ${key}`);
  return item;
}
