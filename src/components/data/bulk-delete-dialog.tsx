"use client";

import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedEntries: string[];
  onDeleteComplete: () => void;
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  selectedEntries,
  onDeleteComplete,
}: BulkDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deleteComplete, setDeleteComplete] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteProgress(0);
    setDeleteComplete(false);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setDeleteProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 15;
        });
      }, 200);

      const response = await fetch("/api/time-entries/bulk", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: selectedEntries,
        }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Löschung fehlgeschlagen");
      }

      const result = await response.json();
      setDeletedCount(result.deletedCount);
      setDeleteProgress(100);
      setDeleteComplete(true);

      // Close dialog and notify parent after successful deletion
      setTimeout(() => {
        onDeleteComplete();
        resetForm();
      }, 2000);
    } catch (error) {
      console.error("Delete error:", error);
      // Handle error (would need error state and display)
    } finally {
      setIsDeleting(false);
    }
  };

  const resetForm = () => {
    setDeleteProgress(0);
    setDeleteComplete(false);
    setDeletedCount(0);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isDeleting) {
      onOpenChange(newOpen);
      if (!newOpen) {
        resetForm();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Einträge löschen
          </DialogTitle>
          <DialogDescription>
            Diese Aktion kann nicht rückgängig gemacht werden
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Warning Alert */}
          <Alert className="border-destructive/50 bg-destructive/5">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-destructive">
              <strong>Achtung:</strong> Sie sind dabei, {selectedEntries.length}{" "}
              Zeiteinträge dauerhaft zu löschen. Diese Aktion kann nicht
              rückgängig gemacht werden.
            </AlertDescription>
          </Alert>

          {/* Deletion Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lösch-Übersicht</CardTitle>
              <CardDescription>Folgende Daten werden gelöscht:</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  <strong>{selectedEntries.length}</strong> Zeiteinträge
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Inkl. aller zugehörigen Zeiten und Beschreibungen
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Daten aus verschiedenen Zeiträumen
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Progress */}
          {isDeleting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Lösche Einträge...</span>
                <span className="text-sm text-muted-foreground">
                  {deleteProgress}%
                </span>
              </div>
              <Progress value={deleteProgress} className="w-full" />
            </div>
          )}

          {/* Success Message */}
          {deleteComplete && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">
                Erfolgreich gelöscht! {deletedCount} Einträge wurden entfernt.
              </AlertDescription>
            </Alert>
          )}

          {/* Safety Tips */}
          {!isDeleting && !deleteComplete && (
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-medium">💡 Sicherheitstipp</h4>
              <p className="text-sm text-muted-foreground">
                Erstellen Sie vor größeren Löschungen ein Backup Ihrer Daten im
                Tab "Backup & Export".
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
          >
            {deleteComplete ? "Schließen" : "Abbrechen"}
          </Button>
          {!deleteComplete && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting ? (
                "Lösche..."
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  {selectedEntries.length} Einträge löschen
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
