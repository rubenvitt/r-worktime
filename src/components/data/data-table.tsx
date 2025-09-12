"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowUpDown,
  Calendar,
  ChevronDown,
  Edit,
  MoreHorizontal,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { EntryType } from "@/types/database";

interface TimeEntryRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: string | number; // Can be Decimal from Prisma or number
  type: EntryType;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DataTableProps {
  selectedEntries: string[];
  onSelectionChange: (selected: string[]) => void;
  onEditEntry?: (entryId: string) => void;
  onDeleteEntry?: (entryId: string) => void;
}

const entryTypeLabels: Record<EntryType, string> = {
  [EntryType.WORK]: "Arbeit",
  [EntryType.OVERTIME]: "Überstunden",
  [EntryType.VACATION]: "Urlaub",
  [EntryType.SICK]: "Krankheit",
  [EntryType.HOLIDAY]: "Feiertag",
};

const entryTypeColors: Record<EntryType, string> = {
  [EntryType.WORK]: "bg-blue-100 text-blue-800",
  [EntryType.OVERTIME]: "bg-orange-100 text-orange-800",
  [EntryType.VACATION]: "bg-green-100 text-green-800",
  [EntryType.SICK]: "bg-red-100 text-red-800",
  [EntryType.HOLIDAY]: "bg-purple-100 text-purple-800",
};

export function DataTable({
  selectedEntries,
  onSelectionChange,
  onEditEntry,
  onDeleteEntry,
}: DataTableProps) {
  const [data, setData] = useState<TimeEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");

  // Pagination state
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
  });

  // Additional filters
  const [typeFilter, setTypeFilter] = useState<EntryType | "all">("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });

  const columns: ColumnDef<TimeEntryRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => {
              table.toggleAllPageRowsSelected(!!value);
              if (value) {
                const allIds = table
                  .getRowModel()
                  .rows.map((row) => row.original.id);
                onSelectionChange([
                  ...new Set([...selectedEntries, ...allIds]),
                ]);
              } else {
                const pageIds = table
                  .getRowModel()
                  .rows.map((row) => row.original.id);
                onSelectionChange(
                  selectedEntries.filter((id) => !pageIds.includes(id)),
                );
              }
            }}
            aria-label="Alle auswählen"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedEntries.includes(row.original.id)}
            onCheckedChange={(value) => {
              if (value) {
                onSelectionChange([...selectedEntries, row.original.id]);
              } else {
                onSelectionChange(
                  selectedEntries.filter((id) => id !== row.original.id),
                );
              }
            }}
            aria-label="Zeile auswählen"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 50,
      },
      {
        accessorKey: "date",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 p-0 font-medium"
          >
            Datum
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const date = parseISO(row.getValue("date"));
          return format(date, "dd.MM.yyyy", { locale: de });
        },
        size: 120,
      },
      {
        accessorKey: "startTime",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 p-0 font-medium"
          >
            Start
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const time = parseISO(row.getValue("startTime"));
          return format(time, "HH:mm");
        },
        size: 80,
      },
      {
        accessorKey: "endTime",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 p-0 font-medium"
          >
            Ende
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const time = parseISO(row.getValue("endTime"));
          return format(time, "HH:mm");
        },
        size: 80,
      },
      {
        accessorKey: "duration",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 p-0 font-medium"
          >
            Dauer
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const duration = row.getValue("duration");
          const durationNum =
            typeof duration === "number"
              ? duration
              : parseFloat(duration?.toString() || "0");
          return `${durationNum.toFixed(2)}h`;
        },
        size: 100,
      },
      {
        accessorKey: "type",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 p-0 font-medium"
          >
            Typ
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const type = row.getValue("type") as EntryType;
          return (
            <Badge variant="secondary" className={entryTypeColors[type]}>
              {entryTypeLabels[type]}
            </Badge>
          );
        },
        size: 120,
      },
      {
        accessorKey: "description",
        header: "Beschreibung",
        cell: ({ row }) => {
          const description = row.getValue("description") as string | null;
          return (
            <div className="max-w-[200px] truncate" title={description || ""}>
              {description || "-"}
            </div>
          );
        },
        size: 200,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Aktionen öffnen</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="flex items-center gap-2"
                onClick={() => onEditEntry?.(row.original.id)}
              >
                <Edit className="h-4 w-4" />
                Bearbeiten
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2 text-red-600"
                onClick={() => onDeleteEntry?.(row.original.id)}
              >
                <Trash2 className="h-4 w-4" />
                Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 50,
      },
    ],
    [selectedEntries, onSelectionChange, onDeleteEntry, onEditEntry],
  );

  // Fetch data
  useEffect(() => {
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
        if (!response.ok) throw new Error("Fehler beim Laden der Daten");

        const result = await response.json();
        setData(result.entries || []);
      } catch (error) {
        console.error("Error fetching time entries:", error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [pagination, sorting, globalFilter, typeFilter, dateRange]);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination,
    },
    manualPagination: true,
    manualSorting: true,
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Durchsuchen..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-64"
          />
        </div>

        <Select
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as EntryType | "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Typ filtern" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            {Object.entries(entryTypeLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={dateRange.from}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, from: e.target.value }))
            }
            className="w-40"
          />
          <span className="text-muted-foreground">bis</span>
          <Input
            type="date"
            value={dateRange.to}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, to: e.target.value }))
            }
            className="w-40"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              <Settings2 className="h-4 w-4" />
              Spalten <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : header.column.columnDef.header
                        ? typeof header.column.columnDef.header === "function"
                          ? header.column.columnDef.header(header.getContext())
                          : header.column.columnDef.header
                        : null}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  Lädt...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={
                    selectedEntries.includes(row.original.id) && "selected"
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                    >
                      {typeof cell.column.columnDef.cell === "function"
                        ? cell.column.columnDef.cell(cell.getContext())
                        : (cell.getValue() as React.ReactNode)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  Keine Ergebnisse gefunden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="flex-1 text-sm text-muted-foreground">
          {selectedEntries.length} von {data.length} Zeile(n) ausgewählt.
        </div>
        <div className="flex items-center gap-6 lg:gap-8">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Zeilen pro Seite</p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue
                  placeholder={table.getState().pagination.pageSize}
                />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 40, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-8 px-2 lg:px-3"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Vorherige
            </Button>
            <Button
              variant="outline"
              className="h-8 px-2 lg:px-3"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Nächste
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
