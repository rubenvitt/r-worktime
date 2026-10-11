"use client";

import { Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
} from "@/components/app/panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type {
  CalendarTimingProject,
  PublicCalendarSettings,
} from "@/lib/calendar/types";
import { suggestVacationProject } from "./calendar-format";
import { useSaveCalendarSettings, useTimingProjects } from "./use-calendar";

/** Radix Select erlaubt keinen leeren Wert: Platzhalter für „kein Projekt“ */
const NO_PROJECT = "none";

export function CalendarSyncSettingsCard({
  settings,
}: {
  settings: PublicCalendarSettings;
}) {
  const save = useSaveCalendarSettings();
  const projects = useTimingProjects(settings.timingConnected);
  // undefined = noch nicht angefasst: gespeicherter Wert oder Vorschlag gilt
  const [projectChoice, setProjectChoice] = useState<string | null | undefined>(
    undefined,
  );
  const [writeToTiming, setWriteToTiming] = useState(settings.writeToTiming);
  const [syncEnabled, setSyncEnabled] = useState(settings.syncEnabled);

  const projectList: CalendarTimingProject[] = projects.data ?? [];
  const suggestion =
    settings.timingProjectId === null
      ? suggestVacationProject(projectList)
      : null;
  const projectId =
    projectChoice !== undefined
      ? projectChoice
      : (settings.timingProjectId ?? suggestion?.id ?? null);
  const showsSuggestion =
    projectChoice === undefined && suggestion !== null && projectId !== null;

  // Gespeichertes Projekt, das Timing nicht mehr liefert, trotzdem anzeigen
  const options =
    settings.timingProjectId &&
    projects.data &&
    !projectList.some((p) => p.id === settings.timingProjectId)
      ? [
          ...projectList,
          {
            id: settings.timingProjectId,
            path: "Gespeichertes Projekt (in Timing nicht gefunden)",
          },
        ]
      : projectList;

  // Ohne Token liefert die Route 409 → null
  const timingConnected = settings.timingConnected && projects.data !== null;

  const handleSave = () => {
    save.mutate(
      {
        timingProjectId: timingConnected ? projectId : settings.timingProjectId,
        writeToTiming,
        syncEnabled,
      },
      {
        onSuccess: ({ settings: saved }) => {
          setProjectChoice(undefined);
          setWriteToTiming(saved.writeToTiming);
          setSyncEnabled(saved.syncEnabled);
          toast.success("Abgleich-Einstellungen gespeichert");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <Panel aria-labelledby="calendar-sync-settings-title">
      <PanelHeader
        title={<span id="calendar-sync-settings-title">Abgleich</span>}
      />
      <PanelBody className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="calendar-timing-project">
            Urlaubsprojekt in Timing
          </Label>
          {!timingConnected ? (
            <Alert variant="info">
              <Info />
              <AlertDescription>
                <p>
                  Timing ist nicht verbunden. Ohne API-Key trägt der Abgleich
                  nichts in Timing ein, die Abwesenheiten erscheinen trotzdem in
                  r-worktime.{" "}
                  <Link
                    href="/settings/timing"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Timing verbinden
                  </Link>
                </p>
              </AlertDescription>
            </Alert>
          ) : projects.isPending ? (
            <Skeleton className="h-9 w-full" />
          ) : projects.isError ? (
            <div className="space-y-2">
              <p className="text-[13px] text-destructive">
                Timing-Projekte konnten nicht geladen werden:{" "}
                {projects.error.message}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => projects.refetch()}
              >
                Erneut laden
              </Button>
            </div>
          ) : (
            <>
              <Select
                value={projectId ?? NO_PROJECT}
                onValueChange={(value) =>
                  setProjectChoice(value === NO_PROJECT ? null : value)
                }
              >
                <SelectTrigger
                  id="calendar-timing-project"
                  className="w-full min-w-0"
                  aria-describedby="calendar-timing-project-hint"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>Kein Projekt</SelectItem>
                  {options.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p
                id="calendar-timing-project-hint"
                className="max-w-prose text-[13px] text-muted-foreground"
              >
                {showsSuggestion
                  ? "Vorschlag nach dem Projektnamen – wird erst mit dem Speichern übernommen."
                  : "In dieses Projekt trägt der Abgleich Urlaubstage ein (ab 08:00, Dauer nach Tagessoll, halber Tag nach halbem Soll)."}
              </p>
            </>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="calendar-write-timing">
                Urlaube in Timing eintragen
              </Label>
              <p className="text-[13px] text-muted-foreground">
                Urlaub, Resturlaub, Sonder- und Bildungsurlaub bekommen einen
                Eintrag in Timing. Vorhandene Einträge werden übernommen, nie
                verdoppelt; gelöscht werden nur selbst angelegte.
              </p>
            </div>
            <Switch
              id="calendar-write-timing"
              className="mt-0.5"
              checked={writeToTiming}
              onCheckedChange={setWriteToTiming}
            />
          </div>
          {writeToTiming && timingConnected && projectId === null ? (
            <p className="text-[13px] text-warning">
              Ohne Urlaubsprojekt trägt der Abgleich nichts in Timing ein.
            </p>
          ) : null}
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="calendar-auto-sync">Automatisch abgleichen</Label>
            <p className="text-[13px] text-muted-foreground">
              {settings.configured
                ? "Liest den Feed stündlich im Hintergrund."
                : "Geht erst, wenn ein Feed hinterlegt ist."}
            </p>
          </div>
          <Switch
            id="calendar-auto-sync"
            className="mt-0.5"
            checked={syncEnabled}
            onCheckedChange={setSyncEnabled}
            disabled={!settings.configured}
          />
        </div>
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
          Einstellungen speichern
        </Button>
      </PanelFooter>
    </Panel>
  );
}
