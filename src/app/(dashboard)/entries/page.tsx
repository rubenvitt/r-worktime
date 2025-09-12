"use client";

import { Download, FileText, Trash2 } from "lucide-react";
import { useState } from "react";
import { BulkDeleteDialog } from "@/components/data/bulk-delete-dialog";
import { DataTable } from "@/components/data/data-table";
import { ExportDialog } from "@/components/data/export-dialog";
import { EditEntryDialog } from "@/components/entries/edit-entry-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function EntriesPage() {
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [tableRefreshKey, setTableRefreshKey] = useState(0);

  const handleEditEntry = (entryId: string) => {
    setEditingEntryId(entryId);
    setEditDialogOpen(true);
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm("Sind Sie sicher, dass Sie diesen Eintrag löschen möchten?")) {
      return;
    }

    try {
      const response = await fetch(`/api/time-entries/${entryId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Fehler beim Löschen des Eintrags");
      }

      // Trigger table refresh
      setTableRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Error deleting entry:", error);
      alert("Fehler beim Löschen des Eintrags. Bitte versuchen Sie es erneut.");
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Zeiteinträge</h1>
          <p className="text-muted-foreground">
            Verwalten und durchsuchen Sie Ihre importierten Zeiteinträge
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setExportDialogOpen(true)}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          {selectedEntries.length > 0 && (
            <Button
              variant="destructive"
              onClick={() => setBulkDeleteOpen(true)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {selectedEntries.length} löschen
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Zeiteinträge-Übersicht
          </CardTitle>
          <CardDescription>
            Erweiterte Tabelle mit Sortierung, Filterung und Bulk-Aktionen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            key={tableRefreshKey}
            selectedEntries={selectedEntries}
            onSelectionChange={setSelectedEntries}
            onEditEntry={handleEditEntry}
            onDeleteEntry={handleDeleteEntry}
          />
        </CardContent>
      </Card>

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
          setTableRefreshKey((prev) => prev + 1);
        }}
      />

      <EditEntryDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        entryId={editingEntryId}
        onEntryUpdated={() => {
          setTableRefreshKey((prev) => prev + 1);
          setEditDialogOpen(false);
          setEditingEntryId(null);
        }}
      />
    </div>
  );
}
