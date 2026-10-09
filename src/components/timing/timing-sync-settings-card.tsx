"use client";

import { Loader2, TriangleAlert, X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { toast } from "sonner";
import {
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
} from "@/components/app/panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatRelative, formatTimestamp } from "@/lib/format";
import {
  MAX_SYNC_WINDOW_DAYS,
  SYNC_INTERVAL_OPTIONS,
} from "@/lib/timing/constants";
import type { PublicTimingSettings } from "@/lib/timing/settings";
import { useSaveTimingSettings, useTimingStatus } from "./use-timing";

function formatInterval(minutes: number): string {
  if (minutes < 60) return `alle ${minutes} Minuten`;
  if (minutes === 60) return "stündlich";
  if (minutes === 1440) return "täglich";
  return `alle ${minutes / 60} Stunden`;
}

function normalizeRoot(value: string): string {
  return value
    .split("▸")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(" ▸ ");
}

export function TimingSyncSettingsCard({
  settings,
}: {
  settings: PublicTimingSettings;
}) {
  const save = useSaveTimingSettings();
  const { data: status } = useTimingStatus();
  const [roots, setRoots] = useState<string[]>(settings.projectRoots);
  const [rootInput, setRootInput] = useState("");
  const [syncEnabled, setSyncEnabled] = useState(settings.syncEnabled);
  const [intervalMinutes, setIntervalMinutes] = useState(
    settings.syncIntervalMinutes,
  );
  const [windowDays, setWindowDays] = useState(String(settings.syncWindowDays));

  const intervalOptions = SYNC_INTERVAL_OPTIONS.includes(intervalMinutes)
    ? SYNC_INTERVAL_OPTIONS
    : [...SYNC_INTERVAL_OPTIONS, intervalMinutes].sort((a, b) => a - b);

  const addRoots = (value: string) => {
    // Komma trennt mehrere Wurzeln
    const additions = value.split(",").map(normalizeRoot).filter(Boolean);
    if (additions.length === 0) return;
    setRoots((current) => Array.from(new Set([...current, ...additions])));
    setRootInput("");
  };

  const handleRootKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addRoots(rootInput);
    }
  };

  const handleSave = () => {
    const pendingRoots = rootInput.trim()
      ? Array.from(
          new Set([
            ...roots,
            ...rootInput.split(",").map(normalizeRoot).filter(Boolean),
          ]),
        )
      : roots;
    const days = Number.parseInt(windowDays, 10);
    if (!Number.isFinite(days) || days < 1 || days > MAX_SYNC_WINDOW_DAYS) {
      toast.error(
        `Das Zeitfenster muss zwischen 1 und ${MAX_SYNC_WINDOW_DAYS} Tagen liegen.`,
      );
      return;
    }
    if (pendingRoots.length === 0) {
      toast.error("Gib mindestens eine Projekt-Wurzel an.");
      return;
    }

    save.mutate(
      {
        projectRoots: pendingRoots,
        syncEnabled,
        syncIntervalMinutes: intervalMinutes,
        syncWindowDays: days,
      },
      {
        onSuccess: (data) => {
          setRoots(data.projectRoots);
          setRootInput("");
          setSyncEnabled(data.syncEnabled);
          toast.success("Sync-Einstellungen gespeichert");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <Panel aria-labelledby="timing-auto-title">
      <PanelHeader title={<span id="timing-auto-title">Automatisch</span>} />
      <PanelBody className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="timing-roots">Projekt-Wurzeln</Label>
          <p
            id="timing-roots-hint"
            className="max-w-prose text-[13px] text-muted-foreground"
          >
            Nur Einträge aus diesen Projekt-Teilbäumen werden übernommen.
            Private Projekte bleiben so draußen. „Work“ passt auf „Work“ und
            alles darunter, aber nicht auf „Workshop“. Segmente trennst du mit
            ▸, Enter fügt hinzu.
          </p>
          {roots.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Projekt-Wurzeln">
              {roots.map((root) => (
                <li
                  key={root}
                  className="inline-flex h-9 max-w-full items-center gap-1 rounded-md border bg-muted pl-2.5 text-[13px] sm:h-7"
                >
                  <span className="truncate">{root}</span>
                  <button
                    type="button"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:size-7"
                    onClick={() =>
                      setRoots((current) => current.filter((r) => r !== root))
                    }
                    aria-label={`${root} entfernen`}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Input
            id="timing-roots"
            placeholder="z. B. Work ▸ Firma ▸ Kunde A"
            value={rootInput}
            onChange={(event) => setRootInput(event.target.value)}
            onKeyDown={handleRootKey}
            onBlur={() => addRoots(rootInput)}
            aria-describedby="timing-roots-hint"
          />
        </div>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="timing-auto-sync">
                Automatisch synchronisieren
              </Label>
              <p className="text-[13px] text-muted-foreground">
                {settings.hasToken
                  ? "Gleicht deine Einträge im gewählten Intervall im Hintergrund ab."
                  : "Geht erst, wenn ein API-Key hinterlegt ist."}
              </p>
            </div>
            <Switch
              id="timing-auto-sync"
              className="mt-0.5"
              checked={syncEnabled}
              onCheckedChange={setSyncEnabled}
              disabled={!settings.hasToken}
            />
          </div>
          {!settings.schedulerEnabled && (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertDescription>
                Auf dem Server ist der automatische Sync aus. Dein Schalter
                wirkt erst, wenn er dort an ist.
              </AlertDescription>
            </Alert>
          )}
          {status?.nextSyncAt && (
            <p className="text-[13px] text-muted-foreground">
              Nächster Lauf{" "}
              <time
                dateTime={status.nextSyncAt}
                title={formatTimestamp(status.nextSyncAt)}
                className="num text-foreground"
              >
                {formatRelative(status.nextSyncAt)}
              </time>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="timing-interval">Intervall</Label>
            <Select
              value={String(intervalMinutes)}
              onValueChange={(value) => setIntervalMinutes(Number(value))}
            >
              <SelectTrigger id="timing-interval" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {intervalOptions.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {formatInterval(minutes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="timing-window">Zeitfenster</Label>
            <div className="relative">
              <Input
                id="timing-window"
                type="number"
                inputMode="numeric"
                className="num pr-24"
                min={1}
                max={MAX_SYNC_WINDOW_DAYS}
                value={windowDays}
                onChange={(event) => setWindowDays(event.target.value)}
                aria-describedby="timing-window-hint"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
              >
                Tage zurück
              </span>
            </div>
          </div>
        </div>
        <p
          id="timing-window-hint"
          className="max-w-prose text-[13px] text-muted-foreground"
        >
          Jeder Lauf gleicht dieses Zeitfenster komplett ab: Neue und geänderte
          Einträge kommen dazu, in Timing gelöschte verschwinden. Manuelle
          Einträge, Feiertage und dein Saldo bleiben unberührt.
        </p>
      </PanelBody>
      <PanelFooter className="flex justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={save.isPending}
          className="h-11 w-full sm:h-9 sm:w-auto"
        >
          {save.isPending && (
            <Loader2 className="animate-spin" aria-hidden="true" />
          )}
          Sync-Einstellungen speichern
        </Button>
      </PanelFooter>
    </Panel>
  );
}
