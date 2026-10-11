// Abgleich der Timewarp-Abwesenheiten (Absence-Zeilen) mit dem Feed. Rein.
// Regeln: Spec „Abgleich“, Schritt 3.

import type { AbsenceKind } from "@/lib/absences/kinds";
import type { ParsedAbsence } from "./timewarp";

export type AbsenceStatusValue = "ACTIVE" | "CANCELLED";

/** Gespeicherte Timewarp-Abwesenheit, so weit der Plan sie braucht. */
export interface StoredAbsence {
  id: string;
  externalUid: string | null;
  kind: AbsenceKind;
  rawType: string | null;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  status: AbsenceStatusValue;
  sequence: number | null;
}

export interface AbsenceData {
  externalUid: string;
  kind: AbsenceKind;
  rawType: string;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  status: AbsenceStatusValue;
  sequence: number | null;
}

export interface AbsencePlan {
  create: AbsenceData[];
  /** Bekannte UIDs mit geänderten Feldern */
  update: Array<{ id: string; data: AbsenceData }>;
  /** Alle gespeicherten Abwesenheiten, die im Feed stehen (lastSeenAt setzen) */
  seen: string[];
  /** Aktive Abwesenheiten in der Zukunft, die im Feed fehlen → CANCELLED */
  cancelMissing: string[];
  /** UIDs, deren SEQUENCE im Feed niedriger ist als gespeichert */
  ignoredLowerSequence: string[];
  unchanged: number;
}

function toData(parsed: ParsedAbsence): AbsenceData {
  return {
    externalUid: parsed.uid,
    kind: parsed.kind,
    rawType: parsed.rawType,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    halfDay: parsed.halfDay,
    status: parsed.cancelled ? "CANCELLED" : "ACTIVE",
    sequence: parsed.sequence,
  };
}

function differs(stored: StoredAbsence, next: AbsenceData): boolean {
  return (
    stored.kind !== next.kind ||
    stored.rawType !== next.rawType ||
    stored.startDate !== next.startDate ||
    stored.endDate !== next.endDate ||
    stored.halfDay !== next.halfDay ||
    stored.status !== next.status ||
    stored.sequence !== next.sequence
  );
}

/**
 * - Neue UID → anlegen (ACTIVE bzw. CANCELLED).
 * - Bekannte UID → Felder übernehmen; niedrigere SEQUENCE als gespeichert → ignorieren.
 * - Fehlt eine aktive Abwesenheit im Feed: Beginn nach heute → CANCELLED,
 *   sonst unverändert (aus dem Feed gefallen, kein Storno).
 */
export function planAbsences(
  stored: readonly StoredAbsence[],
  feed: readonly ParsedAbsence[],
  today: string,
): AbsencePlan {
  const plan: AbsencePlan = {
    create: [],
    update: [],
    seen: [],
    cancelMissing: [],
    ignoredLowerSequence: [],
    unchanged: 0,
  };

  const storedByUid = new Map<string, StoredAbsence>();
  for (const absence of stored) {
    if (absence.externalUid) storedByUid.set(absence.externalUid, absence);
  }
  const feedUids = new Set<string>();

  for (const parsed of feed) {
    feedUids.add(parsed.uid);
    const existing = storedByUid.get(parsed.uid);
    const data = toData(parsed);
    if (!existing) {
      plan.create.push(data);
      continue;
    }
    plan.seen.push(existing.id);
    if (
      existing.sequence !== null &&
      parsed.sequence !== null &&
      parsed.sequence < existing.sequence
    ) {
      plan.ignoredLowerSequence.push(parsed.uid);
      continue;
    }
    if (differs(existing, data)) {
      plan.update.push({ id: existing.id, data });
    } else {
      plan.unchanged++;
    }
  }

  for (const absence of stored) {
    if (
      absence.status === "ACTIVE" &&
      absence.externalUid &&
      !feedUids.has(absence.externalUid) &&
      absence.startDate > today
    ) {
      plan.cancelMissing.push(absence.id);
    }
  }

  return plan;
}
