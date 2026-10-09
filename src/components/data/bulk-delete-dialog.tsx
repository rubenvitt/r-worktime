"use client";

import { AlertCircle, CheckCircle, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteProgress(0);
    setDeleteComplete(false);
    setDeleteError(null);

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
      setDeleteError(
        error instanceof Error && error.message
          ? error.message
          : "Löschen fehlgeschlagen",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const resetForm = () => {
    setDeleteProgress(0);
    setDeleteComplete(false);
    setDeletedCount(0);
    setDeleteError(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isDeleting) {
      onOpenChange(newOpen);
      if (!newOpen) {
        resetForm();
      }
    }
  };

  const countLabel =
    selectedEntries.length === 1
      ? "1 Eintrag"
      : `${selectedEntries.length} Einträge`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{countLabel} löschen?</DialogTitle>
          <DialogDescription>
            Die ausgewählten Zeiteinträge werden dauerhaft entfernt. Das lässt
            sich nicht rückgängig machen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pb-4 empty:hidden">
          {isDeleting ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span>Lösche Einträge …</span>
                <span className="num text-muted-foreground">
                  {deleteProgress} %
                </span>
              </div>
              <Progress value={deleteProgress} className="w-full" />
            </div>
          ) : null}

          {deleteComplete ? (
            <Alert>
              <CheckCircle className="text-positive" />
              <AlertDescription className="text-foreground">
                {deletedCount === 1
                  ? "1 Eintrag gelöscht."
                  : `${deletedCount} Einträge gelöscht.`}
              </AlertDescription>
            </Alert>
          ) : null}

          {deleteError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
          >
            {deleteComplete ? "Schließen" : "Abbrechen"}
          </Button>
          {!deleteComplete ? (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || selectedEntries.length === 0}
            >
              {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {isDeleting ? "Lösche …" : `${countLabel} löschen`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
