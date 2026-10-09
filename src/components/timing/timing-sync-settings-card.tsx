"use client";

import { Loader2, Settings2, X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  MAX_SYNC_WINDOW_DAYS,
  SYNC_INTERVAL_OPTIONS,
} from "@/lib/timing/constants";
import type { PublicTimingSettings } from "@/lib/timing/settings";
import { useSaveTimingSettings } from "./use-timing";

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
      toast.error(`Fenster: 1 bis ${MAX_SYNC_WINDOW_DAYS} Tage`);
      return;
    }
    if (pendingRoots.length === 0) {
      toast.error("Gib mindestens eine Projekt-Wurzel an");
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Sync-Einstellungen
        </CardTitle>
        <CardDescription>
          Nur Einträge aus diesen Projekt-Teilbäumen werden übernommen. Private
          Projekte bleiben so draußen und zählen nicht als Arbeitszeit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="timing-roots">Projekt-Wurzeln</Label>
          <div className="flex flex-wrap gap-2">
            {roots.map((root) => (
              <Badge key={root} variant="secondary" className="gap-1 pr-1">
                {root}
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-muted"
                  onClick={() =>
                    setRoots((current) => current.filter((r) => r !== root))
                  }
                  aria-label={`${root} entfernen`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <Input
            id="timing-roots"
            placeholder="z. B. Work oder Work ▸ Firma ▸ Kunde A – Enter fügt hinzu"
            value={rootInput}
            onChange={(event) => setRootInput(event.target.value)}
            onKeyDown={handleRootKey}
            onBlur={() => addRoots(rootInput)}
          />
          <p className="text-sm text-muted-foreground">
            „Work“ passt auf „Work“ und alles darunter, aber nicht auf
            „Workshop“. Segmente trennst du mit ▸.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="timing-auto-sync">
              Automatisch synchronisieren
            </Label>
            <p className="text-sm text-muted-foreground">
              {settings.schedulerEnabled
                ? "Der Server gleicht regelmäßig im Hintergrund ab."
                : "Der Hintergrund-Sync ist auf dem Server abgeschaltet (TIMING_SYNC_SCHEDULER=off)."}
            </p>
          </div>
          <Switch
            id="timing-auto-sync"
            checked={syncEnabled}
            onCheckedChange={setSyncEnabled}
            disabled={!settings.hasToken}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="timing-interval">Intervall</Label>
            <Select
              value={String(intervalMinutes)}
              onValueChange={(value) => setIntervalMinutes(Number(value))}
            >
              <SelectTrigger id="timing-interval">
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
          <div className="space-y-2">
            <Label htmlFor="timing-window">Fenster (Tage zurück)</Label>
            <Input
              id="timing-window"
              type="number"
              min={1}
              max={MAX_SYNC_WINDOW_DAYS}
              value={windowDays}
              onChange={(event) => setWindowDays(event.target.value)}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Jeder Lauf gleicht die letzten Tage komplett ab: neue und geänderte
          Einträge kommen dazu, in Timing gelöschte verschwinden. Manuelle
          Einträge, Feiertage und dein Saldo bleiben unberührt.
        </p>

        <Button onClick={handleSave} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Einstellungen speichern
        </Button>
      </CardContent>
    </Card>
  );
}
