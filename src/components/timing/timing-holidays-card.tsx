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
import { Switch } from "@/components/ui/switch";
import { formatDateLong } from "@/lib/format";
import {
  isHolidayProjectPath,
  suggestHolidayProject,
} from "@/lib/timing/holidays";
import type { PublicTimingSettings } from "@/lib/timing/settings";
import { useSaveTimingSettings } from "./use-timing";

/** Radix Select erlaubt keinen leeren Wert: Platzhalter für „kein Projekt“ */
const NO_PROJECT = "none";

/** Feiertage aus r-worktime in ein Timing-Projekt eintragen. */
export function TimingHolidaysCard({
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
  const [writeHolidays, setWriteHolidays] = useState(settings.writeHolidays);

  const projectList = projects.data ?? [];
  const suggestion =
    settings.holidayProjectId === null
      ? suggestHolidayProject(projectList)
      : null;
  const projectId =
    projectChoice !== undefined
      ? projectChoice
      : (settings.holidayProjectId ?? suggestion?.id ?? null);
  const selectedPath =
    projectList.find((project) => project.id === projectId)?.path ?? null;
  const options =
    settings.holidayProjectId &&
    projects.data &&
    !projectList.some((p) => p.id === settings.holidayProjectId)
      ? [
          ...projectList,
          {
            id: settings.holidayProjectId,
            path: "Gespeichertes Projekt (in Timing nicht gefunden)",
          },
        ]
      : projectList;

  const handleSave = () => {
    save.mutate(
      { holidayProjectId: projectId, writeHolidays },
      {
        onSuccess: (data) => {
          setProjectChoice(undefined);
          setWriteHolidays(data.writeHolidays);
          toast.success("Feiertags-Einstellungen gespeichert");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <Panel aria-labelledby="timing-holidays-title">
      <PanelHeader
        title={<span id="timing-holidays-title">Feiertage in Timing</span>}
      />
      <PanelBody className="space-y-6">
        <p className="max-w-prose text-[13px] text-muted-foreground">
          Importierte Feiertage (Einstellungen ›{" "}
          <Link
            href="/settings/overtime#feiertage"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Arbeitszeit
          </Link>
          ) bekommen am Feiertag selbst einen Eintrag in Timing: ab 08:00, Dauer
          nach Tagessoll, nicht abrechenbar. Timing nimmt keine Einträge in der
          Zukunft an, deshalb trägt der Sync jeden Feiertag ein, sobald er
          begonnen hat.
        </p>

        <div className="space-y-2">
          <Label htmlFor="timing-holiday-project">Feiertagsprojekt</Label>
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
                  id="timing-holiday-project"
                  className="w-full min-w-0"
                  aria-describedby="timing-holiday-project-hint"
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
                id="timing-holiday-project-hint"
                className="max-w-prose text-[13px] text-muted-foreground"
              >
                {projectId === null
                  ? "Lege in Timing ein eigenes Projekt an, z. B. „Work ▸ INNOQ ▸ Feiertag“, und lade die Seite neu."
                  : projectChoice === undefined && suggestion
                    ? "Vorschlag nach dem Projektnamen – wird erst mit dem Speichern übernommen."
                    : "In dieses Projekt trägt der Sync Feiertage ein. Vorhandene Einträge am Feiertag werden übernommen, nie verdoppelt."}
              </p>
              {selectedPath && !isHolidayProjectPath(selectedPath) ? (
                <p className="max-w-prose text-[13px] text-warning">
                  Der Projektname enthält nicht „Feiertag“. Einträge darin, die
                  r-worktime nicht selbst angelegt hat, würde der Sync als
                  Arbeitszeit übernehmen.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="timing-write-holidays">
              Feiertage in Timing eintragen
            </Label>
            <p className="text-[13px] text-muted-foreground">
              {settings.writeHolidays && settings.holidaysSince
                ? `Aktiv seit ${formatDateLong(settings.holidaysSince)}. Frühere Feiertage bleiben nur in r-worktime.`
                : "Gilt ab dem Tag, an dem du es einschaltest. Frühere Feiertage bleiben nur in r-worktime."}
            </p>
          </div>
          <Switch
            id="timing-write-holidays"
            className="mt-0.5"
            checked={writeHolidays}
            onCheckedChange={setWriteHolidays}
            disabled={!settings.hasToken}
          />
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
          Feiertage speichern
        </Button>
      </PanelFooter>
    </Panel>
  );
}
