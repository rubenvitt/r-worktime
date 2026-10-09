"use client";

import {
  CircleAlert,
  ExternalLink,
  KeyRound,
  Loader2,
  PlugZap,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TIMING_TOKEN_PAGE_URL } from "@/lib/timing/constants";
import type { PublicTimingSettings } from "@/lib/timing/settings";
import { useSaveTimingSettings, useTestTimingConnection } from "./use-timing";

export function TimingConnectionCard({
  settings,
}: {
  settings: PublicTimingSettings;
}) {
  const [token, setToken] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const save = useSaveTimingSettings();
  const test = useTestTimingConnection();

  const trimmed = token.trim();

  const handleSave = () => {
    save.mutate(
      { apiToken: trimmed },
      {
        onSuccess: () => {
          setToken("");
          toast.success("API-Key gespeichert");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const handleRemove = () => {
    save.mutate(
      { apiToken: null },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          toast.success("API-Key entfernt, der automatische Sync ist aus");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const handleTest = () => {
    test.mutate(trimmed || undefined, {
      onSuccess: ({ projectCount }) =>
        toast.success(
          `Verbindung steht: ${projectCount} aktive Projekte gefunden`,
        ),
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <Panel aria-labelledby="timing-connection-title">
      <PanelHeader
        title={<span id="timing-connection-title">Verbindung</span>}
        actions={
          settings.hasToken ? (
            <StatusBadge tone="neutral" icon={KeyRound}>
              API-Key hinterlegt
              {settings.tokenHint ? ` (…${settings.tokenHint})` : ""}
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Kein API-Key</StatusBadge>
          )
        }
      />
      <PanelBody className="space-y-4">
        <p className="max-w-prose text-[13px] text-muted-foreground">
          r-worktime liest deine Zeiteinträge mit einem persönlichen API-Key aus
          der Timing Web App. Der API-Key wird verschlüsselt gespeichert.
        </p>

        {!settings.encryptionConfigured && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Schlüssel fehlt auf dem Server</AlertTitle>
            <AlertDescription>
              <p>
                <code className="font-mono text-xs">
                  TIMING_TOKEN_ENCRYPTION_KEY
                </code>{" "}
                ist nicht gesetzt. Ohne ihn lässt sich kein API-Key speichern,
                und der Sync bleibt aus.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {settings.hasToken && !settings.tokenReadable && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>
              Der gespeicherte API-Key lässt sich nicht lesen. Hinterleg ihn
              neu.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="timing-token">
            {settings.hasToken ? "Neuen API-Key setzen" : "API-Key"}
          </Label>
          <Input
            id="timing-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            aria-describedby="timing-token-hint"
          />
          <p
            id="timing-token-hint"
            className="text-[13px] text-muted-foreground"
          >
            Einen API-Key erzeugst du in Timing unter{" "}
            <a
              href={TIMING_TOKEN_PAGE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              Integrations, API Keys
              <ExternalLink className="size-3" aria-hidden="true" />
              <span className="sr-only">(öffnet in neuem Tab)</span>
            </a>
            .
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            className="h-11 sm:h-9"
            onClick={handleSave}
            disabled={
              !trimmed || save.isPending || !settings.encryptionConfigured
            }
            aria-describedby={!trimmed ? "timing-token-empty" : undefined}
          >
            {save.isPending && (
              <Loader2 className="animate-spin" aria-hidden="true" />
            )}
            API-Key speichern
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-9"
            onClick={handleTest}
            disabled={test.isPending || (!trimmed && !settings.hasToken)}
          >
            {test.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <PlugZap aria-hidden="true" />
            )}
            Verbindung testen
          </Button>
          {settings.hasToken && (
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-9"
                  disabled={save.isPending}
                >
                  <Trash2 aria-hidden="true" />
                  API-Key entfernen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>API-Key entfernen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Danach synchronisiert r-worktime nichts mehr aus Timing, und
                    der automatische Sync geht aus. Deine bisherigen Einträge
                    bleiben erhalten.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-primary-foreground hover:bg-destructive/90"
                    onClick={(event) => {
                      event.preventDefault();
                      handleRemove();
                    }}
                    disabled={save.isPending}
                  >
                    {save.isPending && (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    )}
                    API-Key entfernen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        {!trimmed && (
          <p
            id="timing-token-empty"
            className="text-[13px] text-muted-foreground"
          >
            Füg zuerst einen API-Key ein.
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}
