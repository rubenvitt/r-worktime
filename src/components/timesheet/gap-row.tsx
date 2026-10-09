"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateShort } from "@/lib/format";

/**
 * Tag ohne Einträge zwischen den Stundenzettel-Tagen. Nur Anzeige: Lücken
 * gehen nie in den Payload ein.
 */
export function GapRow({
  date,
  onAdd,
}: {
  /** "YYYY-MM-DD" */
  date: string;
  onAdd: () => void;
}) {
  return (
    <li
      className="flex min-h-10 items-center gap-3 bg-muted/40 px-4 py-1 text-[13px] text-muted-foreground"
      title="Dieser Tag fehlt im Stundenzettel."
    >
      <span className="num shrink-0 font-medium sm:w-[calc(9ch+1.5rem)] sm:pl-6">
        {formatDateShort(date)}
      </span>
      <span
        aria-hidden="true"
        className="num hidden w-[6ch] shrink-0 text-right sm:inline"
      >
        —
      </span>
      <span className="min-w-0 flex-1 truncate">Keine Einträge</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 shrink-0 md:h-8"
        onClick={onAdd}
      >
        <Plus />
        Nachtragen
      </Button>
    </li>
  );
}
