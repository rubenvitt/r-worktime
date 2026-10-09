"use client";

import { ExternalLink, KeyRound, Loader2, PlugZap, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  const save = useSaveTimingSettings();
  const test = useTestTimingConnection();

  const trimmed = token.trim();

  const handleSave = () => {
    save.mutate(
      { apiToken: trimmed },
      {
        onSuccess: () => {
          setToken("");
          toast.success("Token gespeichert");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const handleRemove = () => {
    save.mutate(
      { apiToken: null },
      {
        onSuccess: () => toast.success("Token entfernt, Auto-Sync ist aus"),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const handleTest = () => {
    test.mutate(trimmed || undefined, {
      onSuccess: ({ projectCount }) =>
        toast.success(
          `Verbindung steht – ${projectCount} aktive Projekte gefunden`,
        ),
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Verbindung
        </CardTitle>
        <CardDescription>
          r-worktime liest deine Zeiteinträge mit einem persönlichen API-Key aus
          der Timing Web App. Der Key wird verschlüsselt gespeichert.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!settings.encryptionConfigured && (
          <Alert variant="destructive">
            <AlertTitle>Schlüssel fehlt</AlertTitle>
            <AlertDescription>
              Auf dem Server ist <code>TIMING_TOKEN_ENCRYPTION_KEY</code> nicht
              gesetzt. Ohne ihn kann kein Token gespeichert werden und der Sync
              bleibt aus.
            </AlertDescription>
          </Alert>
        )}

        {settings.hasToken && !settings.tokenReadable && (
          <Alert variant="destructive">
            <AlertDescription>
              Der gespeicherte Token lässt sich nicht entschlüsseln (Schlüssel
              geändert?). Hinterlege ihn bitte neu.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Status:</span>
          {settings.hasToken ? (
            <Badge variant="secondary">
              Token hinterlegt
              {settings.tokenHint ? ` (…${settings.tokenHint})` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">Kein Token</Badge>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="timing-token">
            {settings.hasToken ? "Neuen API-Key setzen" : "API-Key"}
          </Label>
          <Input
            id="timing-token"
            type="password"
            autoComplete="off"
            placeholder="API-Key aus Timing einfügen"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Einen Key erzeugst du in Timing unter{" "}
            <a
              href={TIMING_TOKEN_PAGE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              Integrations → API Keys
              <ExternalLink className="h-3 w-3" />
            </a>
            .
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleSave}
            disabled={
              !trimmed || save.isPending || !settings.encryptionConfigured
            }
          >
            {save.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Token speichern
          </Button>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={test.isPending || (!trimmed && !settings.hasToken)}
          >
            {test.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlugZap className="mr-2 h-4 w-4" />
            )}
            Verbindung testen
          </Button>
          {settings.hasToken && (
            <Button
              variant="ghost"
              onClick={handleRemove}
              disabled={save.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Token entfernen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
