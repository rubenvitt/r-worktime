"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Panel, PanelHeader } from "@/components/app/panel";
import { invalidateEntryDependentQueries } from "@/components/app/query-invalidation";
import { SkeletonRows } from "@/components/app/skeletons";
import { fetchJson } from "@/components/reports/fetch-json";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  AbsenceBlock,
  AbsenceBlocksResponse,
} from "@/lib/absences/blocks";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { describeBlock } from "./absence-blocks-format";
import { AbsenceBlocksList } from "./absence-blocks-list";
import { CalendarSyncHint } from "./calendar-sync-hint";

export const absenceBlocksKey = (year: number) =>
  ["absences", "blocks", year] as const;

async function deleteAbsence(id: string): Promise<{ deletedEntries: number }> {
  const response = await fetch(`/api/absences/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Die Abwesenheit konnte nicht gelöscht werden.",
    );
  }
  return body as { deletedEntries: number };
}

/** Liste „Abwesenheiten {Jahr}“ mit eigenem Abruf, Löschen und Kalender-Hinweis. */
export function AbsenceBlocksPanel({ year }: { year: number }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<AbsenceBlock | null>(null);

  const query = useQuery({
    queryKey: absenceBlocksKey(year),
    queryFn: () =>
      fetchJson<AbsenceBlocksResponse>(
        `/api/absences?year=${year}`,
        "Abwesenheiten konnten nicht geladen werden",
      ),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (block: AbsenceBlock) => deleteAbsence(block.id ?? ""),
    onSuccess: ({ deletedEntries }, block) => {
      setPending(null);
      toast.success("Abwesenheit gelöscht", {
        description: `${describeBlock(block)} · ${plural(deletedEntries, "Eintrag", "Einträge")} entfernt`,
      });
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => invalidateEntryDependentQueries(queryClient),
  });

  const data = query.data;
  const isStale = Boolean(data && data.year !== year);
  const blocks = data?.blocks ?? [];

  return (
    <Panel aria-labelledby="absence-blocks-title">
      <PanelHeader
        title={<span id="absence-blocks-title">Abwesenheiten {year}</span>}
        meta={
          data && !isStale && blocks.length > 0
            ? plural(blocks.length, "Block", "Blöcke")
            : undefined
        }
      />
      <CalendarSyncHint className="border-b px-4 py-2" />

      {query.isPending ? (
        <SkeletonRows count={4} height={56} />
      ) : query.isError && !data ? (
        <div className="p-4">
          <ErrorState
            title="Abwesenheiten konnten nicht geladen werden"
            error={query.error}
            onRetry={() => query.refetch()}
          />
        </div>
      ) : (
        <div
          className={cn(
            "transition-opacity duration-[120ms]",
            isStale && "opacity-60",
          )}
          aria-busy={isStale}
        >
          {query.isError ? (
            <div className="p-4">
              <ErrorState
                title={`Abwesenheiten für ${year} konnten nicht geladen werden`}
                error={query.error}
                onRetry={() => query.refetch()}
              />
            </div>
          ) : null}
          {blocks.length > 0 ? (
            <AbsenceBlocksList
              blocks={blocks}
              onRequestDelete={setPending}
              deletingId={remove.isPending ? remove.variables?.id : null}
            />
          ) : (
            <EmptyState
              title={`Keine Abwesenheiten in ${data?.year ?? year}`}
              description="Urlaub aus Timewarp, aus „Abwesenheit eintragen“ und aus Timing erscheint hier als Block. Krankheit und Feiertage zählen oben mit."
            />
          )}
        </div>
      )}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abwesenheit löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending ? describeBlock(pending) : ""} wird mit allen zugehörigen
              Einträgen gelöscht. Saldo und Urlaubskonto rechnen danach ohne
              diese Tage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-primary-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (pending) remove.mutate(pending);
              }}
              disabled={remove.isPending}
            >
              {remove.isPending && (
                <Loader2 className="animate-spin" aria-hidden="true" />
              )}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
