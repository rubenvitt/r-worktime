"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

const GROUPS: Array<{ title: string; items: Array<[string[], string]> }> = [
  {
    title: "Navigation",
    items: [
      [["g", "h"], "Übersicht"],
      [["g", "w"], "Woche"],
      [["g", "s"], "Stundenzettel"],
      [["g", "p"], "Probleme"],
      [["g", "u"], "Überstunden"],
      [["g", "b"], "Berichte"],
      [["g", "e"], "Zeiteinträge"],
      [["g", "t"], "Timing-Sync"],
      [["g", ","], "Einstellungen"],
    ],
  },
  {
    title: "Zeitraum",
    items: [
      [["["], "Zurück"],
      [["]"], "Vor"],
      [["t"], "Heute"],
    ],
  },
  {
    title: "Allgemein",
    items: [[["?"], "Diese Übersicht"]],
  },
];

/** Übersicht der Tastenkürzel (öffnet mit „?“). */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tastenkürzel</DialogTitle>
          <DialogDescription>
            Sequenzen tippst du nacheinander, z. B. erst g, dann h.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-xs text-muted-foreground">
                {group.title}
              </h3>
              <dl className="divide-y">
                {group.items.map(([keys, label]) => (
                  <div
                    key={keys.join(" ")}
                    className="flex h-9 items-center justify-between gap-4"
                  >
                    <dt className="text-sm">{label}</dt>
                    <dd className="flex items-center gap-1">
                      {keys.map((key, i) => (
                        <span key={key} className="flex items-center gap-1">
                          {i > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              dann
                            </span>
                          ) : null}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
