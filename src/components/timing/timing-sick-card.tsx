"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
} from "@/components/app/panel";
import { useTimingProjects } from "@/components/calendar/use-calendar";
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
import type { PublicTimingSettings } from "@/lib/timing/settings";
import { isSickProjectPath, suggestSickProject } from "@/lib/timing/sick";
import { useSaveTimingSettings } from "./use-timing";

/** Radix Select erlaubt keinen leeren Wert: Platzhalter für „kein Projekt“ */
const NO_PROJECT = "none";

/** „Krankheit“ aus der Problemliste in ein Timing-Projekt eintragen. */
export function TimingSickCard({
  settings,
}: {
  settings: PublicTimingSettings;
}) {
  const save = useSaveTimingSettings();
  const projects = useTimingProjects(settings.hasToken);
  // undefined = noch nicht angefasst: gespeicherter Wert oder Vorschlag gilt
  const [projectChoice, setProjectChoice] = useState<string | null | undefined>(
    undefined,
  );

  const projectList = projects.data ?? [];
  const suggestion =
    settings.sickProjectId === null ? suggestSickProject(projectList) : null;
  const projectId =
    projectChoice !== undefined
      ? projectChoice
      : (settings.sickProjectId ?? suggestion?.id ?? null);
  const selectedPath =
    projectList.find((project) => project.id === projectId)?.path ?? null;
  const options =
    settings.sickProjectId &&
    projects.data &&
    !projectList.some((p) => p.id === settings.sickProjectId)
      ? [
          ...projectList,
          {
            id: settings.sickProjectId,
            path: "Gespeichertes Projekt (in Timing nicht gefunden)",
          },
        ]
      : projectList;

  const handleSave = () => {
    save.mutate(
      { sickProjectId: projectId },
      {
        onSuccess: () => {
          // Gespeicherte Wahl halten, sonst käme bei „Kein Projekt“ der Vorschlag zurück
          setProjectChoice(projectId);
          toast.success("Krank-Projekt gespeichert");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <Panel aria-labelledby="timing-sick-title">
      <PanelHeader
        title={<span id="timing-sick-title">Krank in Timing</span>}
      />
      <PanelBody className="space-y-6">
        <p className="max-w-prose text-[13px] text-muted-foreground">
          Markierst du in den{" "}
          <Link
            href="/problems"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Problemen
          </Link>{" "}
          einen Tag mit „Krankheit“, füllt r-worktime ihn mit „Krank“ auf das
          Tagessoll auf – nach dem letzten Eintrag des Tags, sonst ab 08:00,
          nicht abrechenbar. Mit Projekt geht der Eintrag sofort auch nach
          Timing.
        </p>

        <div className="space-y-2">
          <Label htmlFor="timing-sick-project">Krank-Projekt</Label>
          {!settings.hasToken ? (
            <p className="text-[13px] text-muted-foreground">
              Geht erst, wenn ein API-Key hinterlegt ist.
            </p>
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
                  id="timing-sick-project"
                  className="w-full min-w-0"
                  aria-describedby="timing-sick-project-hint"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>
                    Kein Projekt (nur lokal)
                  </SelectItem>
                  {options.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p
                id="timing-sick-project-hint"
                className="max-w-prose text-[13px] text-muted-foreground"
              >
                {projectId === null
                  ? "Ohne Projekt bleibt „Krank“ nur in r-worktime. Lege in Timing z. B. „Work ▸ INNOQ ▸ Krank“ an und lade die Seite neu."
                  : projectChoice === undefined && suggestion
                    ? "Vorschlag nach dem Projektnamen – wird erst mit dem Speichern übernommen."
                    : "In dieses Projekt trägt r-worktime „Krank“ ein. Liegt es unter einer Projekt-Wurzel, holt der Sync Änderungen aus Timing zurück."}
              </p>
              {selectedPath && !isSickProjectPath(selectedPath) ? (
                <p className="max-w-prose text-[13px] text-warning">
                  Der Projektname enthält nicht „Krank“. Der Sync würde Einträge
                  darin als Arbeitszeit übernehmen.
                </p>
              ) : null}
            </>
          )}
        </div>
      </PanelBody>
      <PanelFooter className="flex justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={save.isPending || !settings.hasToken}
          className="h-11 w-full sm:h-9 sm:w-auto"
        >
          {save.isPending && (
            <Loader2 className="animate-spin" aria-hidden="true" />
          )}
          Krank-Projekt speichern
        </Button>
      </PanelFooter>
    </Panel>
  );
}
