"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertCircle, FileJson, Loader2, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { overtimeEvents } from "@/components/dashboard/overtime-card";
import { ImportPreview } from "@/components/import/import-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatDecimal } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UploadResponse } from "@/types/import";

export function UploadZone() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadResponse | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

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
    onSuccess: async (data) => {
      if (data.status === "preview") {
        setPreview(data);
      } else if (data.status === "success") {
        toast.success(
          `${data.result?.processedEntries ?? 0} Einträge importiert`,
          {
            description: summarizeResult(data),
          },
        );

        // Invalidiere Server-Cache für Überstunden
        try {
          await fetch("/api/statistics/overtime", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "invalidateCache" }),
          });

          // Trigger Client-Side Cache Refresh
          overtimeEvents.emit();
        } catch (error) {
          console.error("Failed to invalidate overtime cache:", error);
        }

        resetUpload();
      }
      setUploadProgress(100);
    },
    onError: (error) => {
      toast.error("Import fehlgeschlagen", {
        description:
          error instanceof Error ? error.message : "Unbekannter Fehler",
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
      <Panel>
        <PanelHeader title="Timing-Export importieren" />
        <PanelBody>
          {!file ? (
            <div
              {...getRootProps()}
              className={cn(
                "flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input px-4 text-center transition-colors hover:border-primary/60",
                isDragActive && "border-primary bg-info-muted",
              )}
            >
              <input {...getInputProps()} />
              <Upload
                className="size-5 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="max-w-prose text-sm">
                {isDragActive
                  ? "Lass die Datei hier los."
                  : "Zieh deinen Timing-Export (.json) hierher oder wähl eine Datei aus."}
              </p>
              <p className="text-xs text-muted-foreground">
                Nur JSON-Dateien, höchstens 10 MB
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                <FileJson
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={file.name}>
                    {file.name}
                  </p>
                  <p className="num text-xs text-muted-foreground">
                    {formatDecimal(file.size / 1024, 2)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 md:h-8"
                  onClick={resetUpload}
                  disabled={uploadMutation.isPending}
                >
                  Entfernen
                </Button>
              </div>

              {uploadProgress > 0 ? (
                <Progress
                  value={uploadProgress}
                  className="w-full"
                  aria-label={`Fortschritt für ${file.name}`}
                />
              ) : null}

              {!preview ? (
                <Button
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending}
                  className="h-11 w-full md:h-9"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Analysiere …
                    </>
                  ) : (
                    <>
                      <Upload />
                      Datei analysieren
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          )}
        </PanelBody>
      </Panel>

      {/* Vorschau */}
      {preview?.preview && !uploadMutation.data?.result ? (
        <ImportPreview
          preview={preview.preview}
          isDuplicate={preview.isDuplicate}
          onConfirm={() => handleConfirmImport(preview.isDuplicate)}
          onCancel={resetUpload}
          isLoading={uploadMutation.isPending}
        />
      ) : null}

      {/* Fehler */}
      {uploadMutation.isError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Import fehlgeschlagen</AlertTitle>
          <AlertDescription>
            {uploadMutation.error?.message || "Unbekannter Fehler"}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function summarizeResult(data: UploadResponse): string | undefined {
  const result = data.result;
  if (!result) return undefined;
  const parts = [`${result.createdEntries} neu`];
  if (result.replacedEntries > 0)
    parts.push(`${result.replacedEntries} ersetzt`);
  if (result.skippedEntries > 0)
    parts.push(`${result.skippedEntries} übersprungen`);
  return parts.join(" · ");
}
