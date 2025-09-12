"use client";

import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle,
  FileJson,
  Loader2,
  Upload,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ImportPreview } from "@/components/import/import-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { UploadResponse } from "@/types/import";

export function UploadZone() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadResponse | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({
      file,
      confirm,
      force,
      previewId,
    }: {
      file?: File;
      confirm?: boolean;
      force?: boolean;
      previewId?: string;
    }) => {
      const formData = new FormData();
      if (file) formData.append("file", file);
      if (confirm) formData.append("confirm", "true");
      if (force) formData.append("force", "true");
      if (previewId) formData.append("previewId", previewId);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      return response.json() as Promise<UploadResponse>;
    },
    onSuccess: (data) => {
      if (data.status === "preview") {
        setPreview(data);
      } else if (data.status === "success") {
        toast({
          title: "Import erfolgreich",
          description: `${data.result?.processedEntries} Einträge wurden verarbeitet`,
        });
        resetUpload();
      }
      setUploadProgress(100);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Upload fehlgeschlagen",
        description:
          error instanceof Error ? error.message : "Ein Fehler ist aufgetreten",
      });
      setUploadProgress(0);
    },
  });

  // Dropzone configuration
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setPreview(null);
      setUploadProgress(0);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/json": [".json"],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
  });

  const handleUpload = () => {
    if (file) {
      setUploadProgress(50);
      uploadMutation.mutate({ file });
    }
  };

  const handleConfirmImport = (force = false) => {
    if (preview?.preview?.previewId) {
      setUploadProgress(75);
      uploadMutation.mutate({
        previewId: preview.preview.previewId,
        confirm: true,
        force,
      });
    }
  };

  const resetUpload = () => {
    setFile(null);
    setPreview(null);
    setUploadProgress(0);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Timing Export importieren</CardTitle>
          <CardDescription>
            Laden Sie Ihre Timing Export JSON-Datei hoch, um Zeiteinträge zu
            importieren
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!file ? (
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50",
              )}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              {isDragActive ? (
                <p className="text-lg font-medium">Datei hier ablegen...</p>
              ) : (
                <>
                  <p className="text-lg font-medium mb-2">
                    Klicken Sie hier oder ziehen Sie eine Datei hinein
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Nur JSON-Dateien (max. 10MB)
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center space-x-3 p-4 bg-muted rounded-lg">
                <FileJson className="h-8 w-8 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetUpload}
                  disabled={uploadMutation.isPending}
                >
                  Entfernen
                </Button>
              </div>

              {uploadProgress > 0 && (
                <Progress value={uploadProgress} className="w-full" />
              )}

              {!preview && (
                <Button
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending}
                  className="w-full"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Wird analysiert...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Datei analysieren
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Section */}
      {preview?.preview && !uploadMutation.data?.result && (
        <ImportPreview
          preview={preview.preview}
          isDuplicate={preview.isDuplicate}
          onConfirm={() => handleConfirmImport(preview.isDuplicate)}
          onCancel={resetUpload}
          isLoading={uploadMutation.isPending}
        />
      )}

      {/* Success Message */}
      {uploadMutation.isSuccess &&
        uploadMutation.data?.status === "success" && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle>Import erfolgreich abgeschlossen</AlertTitle>
            <AlertDescription>
              {uploadMutation.data.result && (
                <div className="mt-2 space-y-1 text-sm">
                  <p>
                    ✓ {uploadMutation.data.result.processedEntries} Einträge
                    verarbeitet
                  </p>
                  <p>
                    ✓ {uploadMutation.data.result.createdEntries} neue Einträge
                    erstellt
                  </p>
                  {uploadMutation.data.result.replacedEntries > 0 && (
                    <p>
                      ✓ {uploadMutation.data.result.replacedEntries} Einträge
                      ersetzt
                    </p>
                  )}
                  {uploadMutation.data.result.skippedEntries > 0 && (
                    <p>
                      ⚠ {uploadMutation.data.result.skippedEntries} Einträge
                      übersprungen
                    </p>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

      {/* Error Messages */}
      {uploadMutation.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler beim Import</AlertTitle>
          <AlertDescription>
            {uploadMutation.error?.message ||
              "Ein unerwarteter Fehler ist aufgetreten"}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
