import { formatDelta, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

function spoken(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} ${h === 1 ? "Stunde" : "Stunden"}`);
  if (m > 0 || h === 0) parts.push(`${m} ${m === 1 ? "Minute" : "Minuten"}`);
  return parts.join(" ");
}

/** Dauer als "H:MM" mit tabellarischen Ziffern. */
export function Duration({
  minutes,
  className,
}: {
  minutes: number;
  className?: string;
}) {
  return (
    <span className={cn("num", className)}>{formatDuration(minutes)}</span>
  );
}

/** Differenz mit Vorzeichen; Farbe folgt dem Vorzeichen, 0 bleibt neutral. */
export function Delta({
  minutes,
  noTarget,
  className,
}: {
  minutes: number | null | undefined;
  noTarget?: boolean;
  className?: string;
}) {
  if (noTarget || minutes === null || minutes === undefined) {
    return (
      <span className={cn("num text-muted-foreground", className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">
          {noTarget ? "kein Soll" : "keine Angabe"}
        </span>
      </span>
    );
  }
  const rounded = Math.round(minutes);
  const tone =
    rounded > 0
      ? "text-positive"
      : rounded < 0
        ? "text-negative"
        : "text-muted-foreground";
  const label =
    rounded === 0
      ? "ausgeglichen"
      : `${rounded > 0 ? "plus" : "minus"} ${spoken(rounded)}`;
  return (
    <span className={cn("num", tone, className)}>
      <span aria-hidden="true">{formatDelta(rounded)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
