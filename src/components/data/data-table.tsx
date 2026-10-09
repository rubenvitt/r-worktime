"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type Row,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Edit,
  MoreHorizontal,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Delta, Duration } from "@/components/app/duration";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Panel } from "@/components/app/panel";
import { RefetchBar, SkeletonRows } from "@/components/app/skeletons";
import { EntryTypeBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { berlinTodayKey, monthRange, shiftDateKey } from "@/lib/dates";
import { formatDateShort, formatTimeRange, hoursToMinutes } from "@/lib/format";
import {
  billingStatusLabel,
  ENTRY_TYPE_LABEL,
  type EntryTypeKey,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { EntryType } from "@/types/database";

interface TimeEntryRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: string | number; // Can be Decimal from Prisma or number
  type: EntryType;
  description: string | null;
  billingStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DatePreset = "all" | "week" | "month" | "last-month" | "custom";

export interface DateRangeValue {
  from: string;
  to: string;
}

interface DataTableProps {
  selectedEntries: string[];
  onSelectionChange: (selected: string[]) => void;
  onEditEntry?: (entryId: string) => void;
  onDeleteEntry?: (entryId: string) => void;
  /** Startwert aus ?dateFrom/dateTo; setzt „Benutzerdefiniert“ */
  initialDateRange?: DateRangeValue | null;
  /** Gesamtzahl der Einträge für die aktuellen Filter */
  onTotalCountChange?: (total: number | null) => void;
}

const COLUMN_LABEL: Record<string, string> = {
  date: "Datum",
  startTime: "Zeit",
  description: "Beschreibung",
  type: "Typ",
  duration: "Dauer",
  billingStatus: "Abrechnung",
};

const PAGE_SIZES = [10, 20, 30, 40, 50];

/** Trigger-Höhe: mobil 44 px, ab md 32 px (data-size schlägt sonst h-*) */
const TRIGGER = "data-[size=sm]:h-11 md:data-[size=sm]:h-8";

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number.parseFloat(value || "0");
}

/** Beschreibung am ersten „ - “ in Titel und Rest teilen */
function splitDescription(description: string | null): {
  title: string;
  rest: string | null;
} {
  if (!description) return { title: "—", rest: null };
  const index = description.indexOf(" - ");
  if (index <= 0) return { title: description, rest: null };
  return {
    title: description.slice(0, index),
    rest: description.slice(index + 3),
  };
}

function presetRange(preset: DatePreset): DateRangeValue | null {
  const today = berlinTodayKey();
  if (preset === "week") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const monday = shiftDateKey(today, -((weekday + 6) % 7));
    return { from: monday, to: shiftDateKey(monday, 6) };
  }
  if (preset === "month") {
    const { firstKey, lastKey } = monthRange(today.slice(0, 7));
    return { from: firstKey, to: lastKey };
  }
  if (preset === "last-month") {
    const firstOfMonth = `${today.slice(0, 7)}-01`;
    const previous = shiftDateKey(firstOfMonth, -1).slice(0, 7);
    const { firstKey, lastKey } = monthRange(previous);
    return { from: firstKey, to: lastKey };
  }
  return null;
}

function pageSelectionState(
  pageIds: string[],
  selected: string[],
): boolean | "indeterminate" {
  const count = pageIds.filter((id) => selected.includes(id)).length;
  if (count === 0) return false;
  return count === pageIds.length ? true : "indeterminate";
}

function SortHeader({
  label,
  sorted,
  onToggle,
  align = "left",
}: {
  label: string;
  sorted: false | "asc" | "desc";
  onToggle: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "-mx-1 inline-flex h-7 items-center gap-1 rounded-sm px-1 text-xs font-medium text-muted-foreground hover:text-foreground",
        sorted && "text-foreground",
        align === "right" && "flex-row-reverse",
      )}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="size-3.5" aria-hidden="true" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3.5" aria-hidden="true" />
      ) : null}
    </button>
  );
}

function RowActions({
  row,
  onEditEntry,
  onDeleteEntry,
}: {
  row: Row<TimeEntryRow>;
  onEditEntry?: (entryId: string) => void;
  onDeleteEntry?: (entryId: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 sm:size-8">
          <span className="sr-only">Aktionen öffnen</span>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEditEntry?.(row.original.id)}>
          <Edit />
          Bearbeiten
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onDeleteEntry?.(row.original.id)}
        >
          <Trash2 />
          Löschen …
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EntryDuration({ entry }: { entry: TimeEntryRow }) {
  const hours = toNumber(entry.duration);
  if (entry.type === EntryType.OVERTIME) {
    return <Delta minutes={hoursToMinutes(hours)} />;
  }
  return <Duration minutes={hoursToMinutes(hours)} />;
}

function EntryTime({ entry }: { entry: TimeEntryRow }) {
  if (entry.type === EntryType.OVERTIME) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="num">
      {formatTimeRange(entry.startTime, entry.endTime)}
    </span>
  );
}

export function DataTable({
  selectedEntries,
  onSelectionChange,
  onEditEntry,
  onDeleteEntry,
  initialDateRange,
  onTotalCountChange,
}: DataTableProps) {
  const [data, setData] = useState<TimeEntryRow[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    billingStatus: false,
  });
  const [globalFilter, setGlobalFilter] = useState("");

  // Pagination state
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
  });

  // Additional filters
  const [typeFilter, setTypeFilter] = useState<EntryType | "all">("all");
  const [datePreset, setDatePreset] = useState<DatePreset>(
    initialDateRange ? "custom" : "all",
  );
  const [dateRange, setDateRange] = useState<DateRangeValue>(
    initialDateRange ?? { from: "", to: "" },
  );

  const hasFilter =
    globalFilter !== "" || typeFilter !== "all" || datePreset !== "all";

  const resetPage = useCallback(
    () => setPagination((current) => ({ ...current, pageIndex: 0 })),
    [],
  );

  const resetFilters = () => {
    setGlobalFilter("");
    setTypeFilter("all");
    setDatePreset("all");
    setDateRange({ from: "", to: "" });
    resetPage();
  };

  const toggleSelected = useCallback(
    (id: string, value: boolean) => {
      if (value) {
        onSelectionChange([...selectedEntries, id]);
      } else {
        onSelectionChange(selectedEntries.filter((entry) => entry !== id));
      }
    },
    [selectedEntries, onSelectionChange],
  );

  const columns: ColumnDef<TimeEntryRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={pageSelectionState(
              table.getRowModel().rows.map((row) => row.original.id),
              selectedEntries,
            )}
            onCheckedChange={(value) => {
              const pageIds = table
                .getRowModel()
                .rows.map((row) => row.original.id);
              if (value) {
                onSelectionChange([
                  ...new Set([...selectedEntries, ...pageIds]),
                ]);
              } else {
                onSelectionChange(
                  selectedEntries.filter((id) => !pageIds.includes(id)),
                );
              }
            }}
            aria-label="Alle auf dieser Seite auswählen"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedEntries.includes(row.original.id)}
            onCheckedChange={(value) =>
              toggleSelected(row.original.id, !!value)
            }
            aria-label="Zeile auswählen"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: "date",
        header: ({ column }) => (
          <SortHeader
            label="Datum"
            sorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <span className="num whitespace-nowrap">
            {formatDateShort(row.original.date)}
          </span>
        ),
        size: 96,
      },
      {
        accessorKey: "startTime",
        header: ({ column }) => (
          <SortHeader
            label="Zeit"
            sorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            <EntryTime entry={row.original} />
          </span>
        ),
        size: 112,
      },
      {
        accessorKey: "description",
        header: () => (
          <span className="text-xs font-medium text-muted-foreground">
            Beschreibung
          </span>
        ),
        cell: ({ row }) => {
          const description = row.original.description;
          const { title, rest } = splitDescription(description);
          return (
            <div className="line-clamp-2 min-w-0" title={description ?? ""}>
              <span className="text-foreground">{title}</span>
              {rest ? (
                <>
                  <span className="sr-only"> - </span>
                  <span className="block text-muted-foreground">{rest}</span>
                </>
              ) : null}
            </div>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: "type",
        header: ({ column }) => (
          <SortHeader
            label="Typ"
            sorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => (
          <EntryTypeBadge type={row.original.type as EntryTypeKey} />
        ),
        size: 120,
      },
      {
        accessorKey: "duration",
        header: ({ column }) => (
          <SortHeader
            label="Dauer"
            align="right"
            sorted={column.getIsSorted()}
            onToggle={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          />
        ),
        cell: ({ row }) => <EntryDuration entry={row.original} />,
        size: 80,
      },
      {
        accessorKey: "billingStatus",
        header: () => (
          <span className="text-xs font-medium text-muted-foreground">
            Abrechnung
          </span>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {billingStatusLabel(row.original.billingStatus)}
          </span>
        ),
        enableSorting: false,
        size: 112,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Aktionen</span>,
        cell: ({ row }) => (
          <RowActions
            row={row}
            onEditEntry={onEditEntry}
            onDeleteEntry={onDeleteEntry}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 48,
      },
    ],
    [
      selectedEntries,
      onSelectionChange,
      onDeleteEntry,
      onEditEntry,
      toggleSelected,
    ],
  );

  // Fetch data (reloadKey: „Erneut laden“ nach einem Fehler)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey löst bewusst ein Neuladen aus
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: (pagination.pageIndex + 1).toString(),
          limit: pagination.pageSize.toString(),
          sortBy: sorting[0]?.id || "date",
          sortOrder: sorting[0]?.desc ? "desc" : "asc",
        });

        if (globalFilter) {
          params.set("search", globalFilter);
        }
        if (typeFilter !== "all") {
          params.set("type", typeFilter);
        }
        if (dateRange.from) {
          params.set("dateFrom", dateRange.from);
        }
        if (dateRange.to) {
          params.set("dateTo", dateRange.to);
        }

        const response = await fetch(`/api/time-entries?${params}`);
        if (!response.ok) {
          throw new Error("Die Zeiteinträge konnten nicht geladen werden.");
        }

        const result = await response.json();
        if (cancelled) return;
        setData(result.entries || []);
        setTotalCount(
          typeof result.totalCount === "number" ? result.totalCount : null,
        );
        setTotalPages(
          typeof result.totalPages === "number" ? result.totalPages : 0,
        );
        setError(null);
        setLoaded(true);
      } catch (fetchError) {
        if (cancelled) return;
        console.error("Error fetching time entries:", fetchError);
        setError(
          fetchError instanceof Error
            ? fetchError
            : new Error("Die Zeiteinträge konnten nicht geladen werden."),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [pagination, sorting, globalFilter, typeFilter, dateRange, reloadKey]);

  useEffect(() => {
    onTotalCountChange?.(totalCount);
  }, [totalCount, onTotalCountChange]);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: (updater) => {
      setSorting(updater);
      resetPage();
    },
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    state: {
      sorting,
      columnVisibility,
      pagination,
    },
    pageCount: Math.max(totalPages, 1),
    enableSortingRemoval: false,
    manualPagination: true,
    manualSorting: true,
  });

  const rows = table.getRowModel().rows;
  const pageCount = Math.max(totalPages, 1);
  const pageNumber = Math.min(pagination.pageIndex + 1, pageCount);

  // Mobil: nach Tag gruppiert (Reihenfolge wie in der Tabelle)
  const dayGroups = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      minutes: number;
      rows: Row<TimeEntryRow>[];
    }> = [];
    for (const row of rows) {
      const label = formatDateShort(row.original.date);
      const last = groups[groups.length - 1];
      const minutes =
        row.original.type === EntryType.OVERTIME
          ? 0
          : hoursToMinutes(toNumber(row.original.duration));
      if (last && last.label === label) {
        last.rows.push(row);
        last.minutes += minutes;
      } else {
        groups.push({
          key: `${row.original.date}-${groups.length}`,
          label,
          minutes,
          rows: [row],
        });
      }
    }
    return groups;
  }, [rows]);

  const toolbar = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative min-w-[200px] flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Einträge durchsuchen"
          placeholder="Suchen …"
          value={globalFilter}
          onChange={(event) => {
            setGlobalFilter(event.target.value);
            resetPage();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && globalFilter) {
              event.preventDefault();
              setGlobalFilter("");
              resetPage();
            }
          }}
          className="h-11 w-full pl-8 sm:h-8"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Label
            htmlFor="entries-type"
            className="text-[13px] font-normal text-muted-foreground"
          >
            Typ
          </Label>
          <Select
            value={typeFilter}
            onValueChange={(value) => {
              setTypeFilter(value as EntryType | "all");
              resetPage();
            }}
          >
            <SelectTrigger id="entries-type" size="sm" className={TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {(Object.keys(ENTRY_TYPE_LABEL) as EntryTypeKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {ENTRY_TYPE_LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label
            htmlFor="entries-period"
            className="text-[13px] font-normal text-muted-foreground"
          >
            Zeitraum
          </Label>
          <Select
            value={datePreset}
            onValueChange={(value) => {
              const preset = value as DatePreset;
              setDatePreset(preset);
              // „Benutzerdefiniert“ startet mit dem bisherigen Bereich
              if (preset !== "custom") {
                setDateRange(presetRange(preset) ?? { from: "", to: "" });
              }
              resetPage();
            }}
          >
            <SelectTrigger id="entries-period" size="sm" className={TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="week">Diese Woche</SelectItem>
              <SelectItem value="month">Diesen Monat</SelectItem>
              <SelectItem value="last-month">Letzter Monat</SelectItem>
              <SelectItem value="custom">Benutzerdefiniert</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="hidden h-8 text-muted-foreground sm:inline-flex"
            >
              <Columns3 />
              Spalten
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Sichtbare Spalten
            </DropdownMenuLabel>
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {COLUMN_LABEL[column.id] ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {datePreset === "custom" ? (
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,11rem)_auto_minmax(0,11rem)] sm:items-center sm:justify-start">
          <Label
            htmlFor="entries-from"
            className="text-[13px] font-normal text-muted-foreground"
          >
            Von
          </Label>
          <Input
            id="entries-from"
            type="date"
            value={dateRange.from}
            onChange={(event) => {
              setDateRange((prev) => ({ ...prev, from: event.target.value }));
              resetPage();
            }}
            className="num h-11 w-full min-w-0 sm:h-8"
          />
          <Label
            htmlFor="entries-to"
            className="text-[13px] font-normal text-muted-foreground"
          >
            Bis
          </Label>
          <Input
            id="entries-to"
            type="date"
            value={dateRange.to}
            onChange={(event) => {
              setDateRange((prev) => ({ ...prev, to: event.target.value }));
              resetPage();
            }}
            className="num h-11 w-full min-w-0 sm:h-8"
          />
        </div>
      ) : null}
    </div>
  );

  let content: ReactNode;
  if (error && !loaded) {
    content = (
      <ErrorState
        title="Zeiteinträge konnten nicht geladen werden"
        error={error}
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  } else if (!loaded) {
    content = (
      <Panel>
        <SkeletonRows count={10} />
      </Panel>
    );
  } else if (rows.length === 0 && !loading) {
    content = (
      <Panel>
        {hasFilter ? (
          <EmptyState
            title="Keine Einträge für diese Filter."
            action={
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Filter zurücksetzen
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Noch keine Zeiteinträge."
            action={
              <Button asChild size="sm">
                <Link href="/settings/timing">Timing verbinden</Link>
              </Button>
            }
          />
        )}
      </Panel>
    );
  } else {
    content = (
      <Panel>
        <RefetchBar active={loading} />
        {error ? (
          <ErrorState
            className="rounded-none border-x-0 border-t-0"
            title="Zeiteinträge konnten nicht aktualisiert werden"
            error={error}
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        ) : null}

        <div
          className={cn(
            "transition-opacity",
            loading && "pointer-events-none opacity-60",
          )}
        >
          {/* Desktop/Tablet: Tabelle */}
          <div className="hidden sm:block">
            <Table className="table-fixed text-[13px] leading-[18px]">
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="hover:bg-transparent"
                  >
                    {headerGroup.headers.map((header) => {
                      const sorted = header.column.getIsSorted();
                      const isRight = header.column.id === "duration";
                      return (
                        <TableHead
                          key={header.id}
                          aria-sort={
                            header.column.getCanSort()
                              ? sorted === "asc"
                                ? "ascending"
                                : sorted === "desc"
                                  ? "descending"
                                  : "none"
                              : undefined
                          }
                          className={cn(
                            "h-8 px-3 first:pl-4 last:pr-2",
                            isRight && "text-right",
                          )}
                          style={
                            header.column.id === "description"
                              ? undefined
                              : { width: header.getSize() }
                          }
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-entry-row
                    data-state={
                      selectedEntries.includes(row.original.id)
                        ? "selected"
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "h-9 px-3 py-1.5 align-middle first:pl-4 last:pr-2",
                          cell.column.id === "duration" && "text-right",
                          cell.column.id === "description" && "py-2",
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobil: Liste nach Tag */}
          <div className="sm:hidden">
            {dayGroups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                <h3 className="num border-b bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                  {group.label}
                  {group.minutes > 0 ? (
                    <>
                      {" · "}
                      <Duration minutes={group.minutes} />
                    </>
                  ) : null}
                </h3>
                <ul className="divide-y border-b">
                  {group.rows.map((row) => {
                    const entry = row.original;
                    const { title } = splitDescription(entry.description);
                    return (
                      <li key={row.id}>
                        <div
                          data-entry-row
                          className="flex items-start gap-2 py-2 pr-1 pl-4"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-3">
                              <span
                                className="min-w-0 flex-1 truncate text-[13px] font-medium"
                                title={entry.description ?? ""}
                              >
                                {title}
                              </span>
                              <span className="shrink-0 text-[13px]">
                                <EntryDuration entry={entry} />
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              <EntryTime entry={entry} />
                              <EntryTypeBadge
                                type={entry.type as EntryTypeKey}
                              />
                            </div>
                          </div>
                          <RowActions
                            row={row}
                            onEditEntry={onEditEntry}
                            onDeleteEntry={onDeleteEntry}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>

        {/* Fuß: Anzahl, Zeilen pro Seite, Seiten */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t px-4 py-2 text-[13px] text-muted-foreground">
          <span className="num hidden sm:inline">
            {rows.length} von {totalCount ?? rows.length}
          </span>
          <div className="hidden items-center gap-2 sm:ml-auto sm:flex">
            <Label
              htmlFor="entries-page-size"
              className="text-[13px] font-normal text-muted-foreground"
            >
              Zeilen pro Seite
            </Label>
            <Select
              value={`${pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
                resetPage();
              }}
            >
              <SelectTrigger
                id="entries-page-size"
                size="sm"
                className="num w-[4.5rem]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top">
                {PAGE_SIZES.map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-1 sm:ml-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-11 sm:size-8"
              onClick={() => table.previousPage()}
              disabled={pagination.pageIndex === 0}
              aria-label="Vorherige Seite"
            >
              <ChevronLeft />
            </Button>
            <span className="num min-w-[6ch] text-center text-foreground">
              {pageNumber} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 sm:size-8"
              onClick={() => table.nextPage()}
              disabled={pagination.pageIndex + 1 >= pageCount}
              aria-label="Nächste Seite"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {toolbar}
      {content}
    </div>
  );
}
