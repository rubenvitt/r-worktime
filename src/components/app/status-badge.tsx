import { Check, type LucideIcon } from "lucide-react";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  ENTRY_TYPE_LABEL,
  type EntryTypeKey,
  PROBLEM_TYPE_LABEL,
  type ProblemTypeKey,
} from "@/lib/labels";

export type Tone = "neutral" | "positive" | "negative" | "warning" | "info";

/** Status als gedämpfte Fläche mit farbigem Text; nie Vollfarbe. */
export function StatusBadge({
  tone,
  icon: Icon,
  children,
  title,
}: {
  tone: Tone;
  icon?: LucideIcon;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <Badge variant={tone} title={title}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </Badge>
  );
}

/** Typ eines Eintrags. WORK wird nur mit `showWork` gezeigt. */
export function EntryTypeBadge({
  type,
  showWork,
}: {
  type: EntryTypeKey;
  showWork?: boolean;
}) {
  if (type === "WORK" && !showWork) return null;
  const tone: Tone = type === "OVERTIME" ? "info" : "neutral";
  return (
    <StatusBadge tone={tone}>{ENTRY_TYPE_LABEL[type] ?? type}</StatusBadge>
  );
}

const PROBLEM_TONE: Record<ProblemTypeKey, Tone> = {
  missing: "negative",
  zero_hours: "negative",
  incomplete: "warning",
};

export function ProblemBadge({ type }: { type: ProblemTypeKey }) {
  return (
    <StatusBadge tone={PROBLEM_TONE[type]}>
      {PROBLEM_TYPE_LABEL[type]}
    </StatusBadge>
  );
}

export function RunningBadge() {
  return <StatusBadge tone="info">Läuft</StatusBadge>;
}

export function ReviewedBadge() {
  return (
    <StatusBadge tone="neutral" icon={Check}>
      Geprüft
    </StatusBadge>
  );
}
