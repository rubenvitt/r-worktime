import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { prisma } from "@/lib/prisma";
import {
  ImportService,
  mapTimingEntry,
  skipProtectedEntries,
  timingEntryDateKey,
} from "./import.service";

const baseEntry = {
  startDate: "2025-09-01T08:00:00+02:00",
  endDate: "2025-09-01T09:30:00+02:00",
  duration: "1:30:00",
  project: "Work ▸ Firma ▸ Kunde A",
  activityTitle: "Alpha | 101: Backend",
  notes: "Refactoring",
  billingStatus: "Billable",
};

describe("mapTimingEntry", () => {
  it("setzt Quelle, Titel, Notizen, Projektpfad und description", () => {
    const row = mapTimingEntry(
      { ...baseEntry, id: "/time-entries/1" },
      "user-1",
      "log-1",
    );

    expect(row).toMatchObject({
      dateKey: "2025-09-01",
      userId: "user-1",
      duration: 1.5,
      type: "WORK",
      title: "Alpha | 101: Backend",
      notes: "Refactoring",
      projectPath: "Work ▸ Firma ▸ Kunde A",
      externalId: "/time-entries/1",
      source: "FILE_IMPORT",
      description: "Alpha | 101: Backend - Refactoring",
      billingStatus: "Billable",
      importLogId: "log-1",
    });
    expect(row.date.toISOString()).toBe("2025-09-01T00:00:00.000Z");
  });

  it("ordnet 00:30 Berlin dem Berlin-Tag zu, auch bei UTC-Zeitstempel", () => {
    const row = mapTimingEntry(
      {
        ...baseEntry,
        startDate: "2025-08-31T22:30:00Z",
        endDate: "2025-08-31T23:30:00Z",
        duration: "1:00:00",
      },
      "user-1",
      null,
    );
    expect(row.dateKey).toBe("2025-09-01");
  });

  it("lässt fehlende Felder als null", () => {
    const row = mapTimingEntry(
      {
        startDate: baseEntry.startDate,
        endDate: baseEntry.endDate,
        duration: "1:30:00",
        project: "Work ▸ Urlaub",
      },
      "user-1",
      null,
    );
    expect(row).toMatchObject({
      title: null,
      notes: null,
      description: null,
      externalId: null,
      billingStatus: null,
      type: "VACATION",
    });
  });

  it("wirft bei kaputtem Zeitstempel", () => {
    expect(() =>
      mapTimingEntry({ ...baseEntry, startDate: "kaputt" }, "user-1", null),
    ).toThrow();
    expect(timingEntryDateKey({ ...baseEntry, startDate: "kaputt" })).toBe(
      null,
    );
  });
});

describe("skipProtectedEntries", () => {
  it("lässt nur Zeilen mit geschützter ID weg", () => {
    const rows = [
      { externalId: "/time-entries/1" },
      { externalId: "/time-entries/2" },
      { externalId: null },
    ];
    expect(skipProtectedEntries(rows, ["/time-entries/2", null])).toEqual([
      { externalId: "/time-entries/1" },
      { externalId: null },
    ]);
    expect(skipProtectedEntries(rows, [])).toBe(rows);
  });
});

describe("ImportService.processTimingExport", () => {
  it("überspringt IDs, die an einem manuell korrigierten Eintrag hängen", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      importLog: {
        create: vi.fn().mockResolvedValue({ id: "log-1" }),
        update: vi.fn().mockResolvedValue({}),
      },
      timeEntry: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        // Nach dem Löschen trägt nur noch der MANUAL-Eintrag die ID 1
        findMany: vi
          .fn()
          .mockResolvedValue([{ externalId: "/time-entries/1" }]),
        createMany,
      },
    };
    Object.assign(prisma, {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1" }) },
      importLog: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    });

    const result = await new ImportService().processTimingExport(
      "user@example.test",
      [
        { ...baseEntry, id: "/time-entries/1" },
        { ...baseEntry, id: "/time-entries/2" },
      ],
      { fileName: "export.json", fileHash: "hash" },
    );

    expect(createMany).toHaveBeenCalledTimes(1);
    const created = createMany.mock.calls[0][0].data;
    expect(
      created.map((row: { externalId: string }) => row.externalId),
    ).toEqual(["/time-entries/2"]);
    expect(result).toMatchObject({
      processedEntries: 2,
      createdEntries: 1,
      skippedEntries: 1,
      errors: [],
    });
  });
});
