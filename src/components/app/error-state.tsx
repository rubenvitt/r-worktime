"use client";

import { AlertCircle, RotateCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Fehlerzustand mit Ursache und „Erneut laden“. */
export function ErrorState({
  title,
  error,
  onRetry,
  className,
}: {
  title: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Bitte versuch es gleich noch einmal.";
  return (
    <Alert variant="destructive" className={cn("bg-card", className)}>
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p className="text-foreground/80">{message}</p>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onRetry}
          >
            <RotateCw />
            Erneut laden
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
