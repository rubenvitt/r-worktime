"use client";

import {
  AlertTriangle,
  Calendar,
  Database,
  Download,
  FileText,
  Settings,
  Shield,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

interface BackupStats {
  totalEntries: number;
  hasSettings: boolean;
  dateRange: {
    from: string;
    to: string;
  } | null;
  estimatedSize: string;
}

interface BackupInfo {
  version: string;
  format: string;
  created: string;
  userId: string;
  statistics?: {
    totalEntries: number;
    dateRange: {
      start: string;
      end: string;
    };
    totalWorkHours: number;
  };
}

interface BackupPreview {
  backupInfo: BackupInfo;
  preview: {
    totalEntries: number;
    validEntries: number;
    invalidEntries: number;
    hasSettings: boolean;
    dateRange: { from: string; to: string } | null;
    entryTypes: Record<string, number>;
    warnings: string[];
  };
}

export function BackupManager() {
  const [backupStats, setBackupStats] = useState<BackupStats | null>(null);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [includeSettings, setIncludeSettings] = useState(true);

  // Restore state
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(
    null,
  );
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreOptions, setRestoreOptions] = useState({
    replaceExisting: false,
    restoreSettings: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load backup stats on component mount
  useState(() => {
    const loadStats = async () => {
      try {
        const response = await fetch("/api/backup/create");
        if (response.ok) {
          const stats = await response.json();
          setBackupStats(stats.stats);
        }
      } catch (error) {
        console.error("Failed to load backup stats:", error);
      }
    };
    loadStats();
  });

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    setBackupProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setBackupProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const response = await fetch("/api/backup/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          includeSettings,
        }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error("Backup-Erstellung fehlgeschlagen");
      }

      setBackupProgress(100);

      // Download the backup file
      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition");
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1]?.replace(/"/g, "")
        : `backup-${new Date().toISOString().split("T")[0]}.json`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Backup error:", error);
    } finally {
      setIsCreatingBackup(false);
      setTimeout(() => setBackupProgress(0), 2000);
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      alert("Bitte wählen Sie eine JSON-Backup-Datei aus.");
      return;
    }

    setBackupFile(file);

    try {
      const content = await file.text();
      const backupData = JSON.parse(content);

      // Preview the backup
      const response = await fetch("/api/backup/restore", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ backupData }),
      });

      if (response.ok) {
        const preview = await response.json();
        setBackupPreview(preview);
      }
    } catch (error) {
      console.error("Failed to preview backup:", error);
      alert(
        "Fehler beim Lesen der Backup-Datei. Stellen Sie sicher, dass es sich um eine gültige r-worktime Backup-Datei handelt.",
      );
    }
  };

  const handleRestore = async () => {
    if (!backupFile || !backupPreview) return;

    setIsRestoring(true);
    setRestoreProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setRestoreProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 12;
        });
      }, 300);

      const content = await backupFile.text();
      const backupData = JSON.parse(content);

      const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          backupData,
          options: restoreOptions,
        }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error("Wiederherstellung fehlgeschlagen");
      }

      const _result = await response.json();
      setRestoreProgress(100);

      setTimeout(() => {
        setRestoreDialogOpen(false);
        setBackupFile(null);
        setBackupPreview(null);
        setRestoreProgress(0);
        // Reload the page to show updated data
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error("Restore error:", error);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Create Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Backup erstellen
          </CardTitle>
          <CardDescription>
            Sichern Sie alle Ihre Zeiteinträge und Einstellungen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {backupStats && (
            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-medium">Backup-Inhalt</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {backupStats.totalEntries} Einträge
                </div>
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  {backupStats.hasSettings ? "Mit" : "Ohne"} Einstellungen
                </div>
                {backupStats.dateRange && (
                  <>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      Von:{" "}
                      {new Date(backupStats.dateRange.from).toLocaleDateString(
                        "de-DE",
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      Bis:{" "}
                      {new Date(backupStats.dateRange.to).toLocaleDateString(
                        "de-DE",
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Geschätzte Größe: {backupStats.estimatedSize}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeSettings"
                checked={includeSettings}
                onCheckedChange={(checked) => setIncludeSettings(!!checked)}
              />
              <Label htmlFor="includeSettings" className="text-sm">
                Benutzereinstellungen einschließen
              </Label>
            </div>
          </div>

          {isCreatingBackup && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Erstelle Backup...</span>
                <span className="text-sm text-muted-foreground">
                  {backupProgress}%
                </span>
              </div>
              <Progress value={backupProgress} className="w-full" />
            </div>
          )}

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Backups enthalten alle Ihre persönlichen Daten. Bewahren Sie sie
              sicher auf.
            </AlertDescription>
          </Alert>

          <Button
            onClick={handleCreateBackup}
            disabled={isCreatingBackup}
            className="w-full gap-2"
          >
            {isCreatingBackup ? (
              "Erstelle Backup..."
            ) : (
              <>
                <Download className="h-4 w-4" />
                Backup erstellen
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Restore Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Backup wiederherstellen
          </CardTitle>
          <CardDescription>
            Stellen Sie Daten aus einem vorherigen Backup wieder her
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700">
              <strong>Vorsicht:</strong> Die Wiederherstellung kann bestehende
              Daten überschreiben.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <Label htmlFor="backup-file">Backup-Datei auswählen</Label>
            <Input
              id="backup-file"
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              ref={fileInputRef}
            />
            {backupFile && (
              <div className="text-sm text-muted-foreground">
                Ausgewählte Datei: {backupFile.name}
              </div>
            )}
          </div>

          <Button
            onClick={() => setRestoreDialogOpen(true)}
            disabled={!backupFile || !backupPreview}
            className="w-full gap-2"
            variant="outline"
          >
            <Upload className="h-4 w-4" />
            Wiederherstellung starten
          </Button>

          <div className="bg-muted/30 rounded-lg p-4 space-y-2">
            <h4 className="text-sm font-medium">💡 Hinweise</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>
                • Erstellen Sie vor der Wiederherstellung ein aktuelles Backup
              </li>
              <li>• Nur r-worktime JSON-Backup-Dateien werden unterstützt</li>
              <li>• Die Wiederherstellung kann einige Minuten dauern</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Restore Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Backup wiederherstellen
            </DialogTitle>
            <DialogDescription>
              Überprüfen Sie die Backup-Details vor der Wiederherstellung
            </DialogDescription>
          </DialogHeader>

          {backupPreview && (
            <div className="space-y-4">
              {/* Backup Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Backup-Informationen
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <strong>Erstellt:</strong>{" "}
                      {new Date(
                        backupPreview.backupInfo.created,
                      ).toLocaleString("de-DE")}
                    </div>
                    <div>
                      <strong>Version:</strong>{" "}
                      {backupPreview.backupInfo.version}
                    </div>
                    <div>
                      <strong>Einträge:</strong>{" "}
                      {backupPreview.preview.validEntries}
                      {backupPreview.preview.invalidEntries > 0 && (
                        <Badge variant="destructive" className="ml-2">
                          {backupPreview.preview.invalidEntries} ungültig
                        </Badge>
                      )}
                    </div>
                    <div>
                      <strong>Einstellungen:</strong>{" "}
                      {backupPreview.preview.hasSettings ? "Ja" : "Nein"}
                    </div>
                  </div>

                  {backupPreview.preview.dateRange && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-sm">
                        <strong>Zeitraum:</strong>{" "}
                        {new Date(
                          backupPreview.preview.dateRange.from,
                        ).toLocaleDateString("de-DE")}{" "}
                        -{" "}
                        {new Date(
                          backupPreview.preview.dateRange.to,
                        ).toLocaleDateString("de-DE")}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Warnings */}
              {backupPreview.preview.warnings.length > 0 && (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-700">
                    <ul className="list-disc list-inside space-y-1">
                      {backupPreview.preview.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Restore Options */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">
                  Wiederherstellungs-Optionen
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="replaceExisting"
                      checked={restoreOptions.replaceExisting}
                      onCheckedChange={(checked) =>
                        setRestoreOptions((prev) => ({
                          ...prev,
                          replaceExisting: !!checked,
                        }))
                      }
                    />
                    <Label htmlFor="replaceExisting" className="text-sm">
                      Bestehende Daten ersetzen (Vorsicht!)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="restoreSettings"
                      checked={restoreOptions.restoreSettings}
                      onCheckedChange={(checked) =>
                        setRestoreOptions((prev) => ({
                          ...prev,
                          restoreSettings: !!checked,
                        }))
                      }
                    />
                    <Label htmlFor="restoreSettings" className="text-sm">
                      Einstellungen wiederherstellen
                    </Label>
                  </div>
                </div>
              </div>

              {/* Progress */}
              {isRestoring && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Stelle wieder her...
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {restoreProgress}%
                    </span>
                  </div>
                  <Progress value={restoreProgress} className="w-full" />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRestoreDialogOpen(false)}
              disabled={isRestoring}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleRestore}
              disabled={isRestoring}
              className="gap-2"
            >
              {isRestoring ? (
                "Stelle wieder her..."
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Wiederherstellen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
