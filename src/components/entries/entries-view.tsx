"use client";

import { CalendarRange, Download, Plus, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { StickyActionBar } from "@/components/app/sticky-action-bar";
import { BulkDeleteDialog } from "@/components/data/bulk-delete-dialog";
import { DataTable, type DateRangeValue } from "@/components/data/data-table";
import { ExportDialog } from "@/components/data/export-dialog";
import { AbsenceRangeDialog } from "@/components/entries/absence-range-dialog";
import { EditEntryDialog } from "@/components/entries/edit-entry-dialog";
import { QuickEntryModal } from "@/components/problems/quick-entry-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { isDateKey } from "@/lib/dates";

function initialRange(params: URLSearchParams): DateRangeValue | null {
  const from = params.get("dateFrom") ?? "";
  const to = params.get("dateTo") ?? "";
  const validFrom = isDateKey(from) ? from : "";
  const validTo = isDateKey(to) ? to : "";
  return validFrom || validTo ? { from: validFrom, to: validTo } : null;
}

export function EntriesView() {
  const searchParams = useSearchParams();
  // ?dateFrom/dateTo einmalig beim Mount übernehmen
  const [initialDateRange] = useState(() =>
    initialRange(new URLSearchParams(searchParams.toString())),
  );

  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newEntryKey, setNewEntryKey] = useState<number | null>(null);
  const [absenceKey, setAbsenceKey] = useState<number | null>(null);
  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const refreshTable = () => setTableRefreshKey((prev) => prev + 1);

  const handleEditEntry = useCallback((entryId: string) => {
    setEditingEntryId(entryId);
    setEditDialogOpen(true);
  }, []);

  const handleDeleteEntry = useCallback((entryId: string) => {
    setDeletingEntryId(entryId);
  }, []);

  const confirmDelete = async () => {
    if (!deletingEntryId) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/time-entries/${deletingEntryId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Fehler beim Löschen des Eintrags");
      }

      setSelectedEntries((current) =>
        current.filter((id) => id !== deletingEntryId),
      );
      toast.success("Eintrag gelöscht");
      setDeletingEntryId(null);
      refreshTable();
    } catch (error) {
      console.error("Error deleting entry:", error);
      toast.error("Der Eintrag konnte nicht gelöscht werden.", {
        description: "Bitte versuch es gleich noch einmal.",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Zeiteinträge"
        meta={
          totalCount !== null ? (
            <span className="num">
              {totalCount === 1 ? "1 Eintrag" : `${totalCount} Einträge`}
            </span>
          ) : null
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setExportDialogOpen(true)}
              className="h-11 md:h-9"
            >
              <Download />
              Export
            </Button>
            <Button
              variant="outline"
              onClick={() => setAbsenceKey(Date.now())}
              className="h-11 md:h-9"
              aria-label="Abwesenheit eintragen"
            >
              <CalendarRange />
              <span className="hidden sm:inline">Abwesenheit</span>
            </Button>
            <Button
              onClick={() => setNewEntryKey(Date.now())}
              className="h-11 md:h-9"
              aria-label="Neuer Eintrag"
            >
              <Plus />
              <span className="hidden sm:inline">Neuer Eintrag</span>
            </Button>
          </>
        }
      />

      <DataTable
        key={tableRefreshKey}
        selectedEntries={selectedEntries}
        onSelectionChange={setSelectedEntries}
        onEditEntry={handleEditEntry}
        onDeleteEntry={handleDeleteEntry}
        initialDateRange={initialDateRange}
        onTotalCountChange={setTotalCount}
      />

      {/* Dialogs */}
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        selectedEntries={selectedEntries}
        onDeleteComplete={() => {
          setSelectedEntries([]);
          setBulkDeleteOpen(false);
          refreshTable();
        }}
      />

      <EditEntryDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        entryId={editingEntryId}
        onEntryUpdated={() => {
          refreshTable();
          setEditDialogOpen(false);
          setEditingEntryId(null);
        }}
      />

      {newEntryKey !== null ? (
        <QuickEntryModal
          key={newEntryKey}
          open
          onOpenChange={(open) => {
            if (!open) setNewEntryKey(null);
          }}
          date={new Date()}
          suggestedHours={0}
          onSuccess={() => {
            setNewEntryKey(null);
            refreshTable();
          }}
        />
      ) : null}

      {absenceKey !== null ? (
        <AbsenceRangeDialog
          key={absenceKey}
          open
          onOpenChange={(open) => {
            if (!open) setAbsenceKey(null);
          }}
          onSuccess={refreshTable}
        />
      ) : null}

      <AlertDialog
        open={deletingEntryId !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeletingEntryId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Eintrag wird dauerhaft entfernt. Das lässt sich nicht
              rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-primary-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StickyActionBar open={selectedEntries.length > 0}>
        <span className="text-sm">
          <span className="num">{selectedEntries.length}</span> ausgewählt
        </span>
        <Button
          variant="ghost"
          className="ml-auto h-11 md:h-9"
          onClick={() => setSelectedEntries([])}
        >
          Auswahl aufheben
        </Button>
        <Button
          variant="destructive"
          className="h-11 md:h-9"
          onClick={() => setBulkDeleteOpen(true)}
        >
          <Trash2 />
          Löschen …
        </Button>
      </StickyActionBar>
    </PageContainer>
  );
}
