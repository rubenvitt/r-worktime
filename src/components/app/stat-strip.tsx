import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";

const TONE = {
  neutral: "",
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
} as const;

interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "positive" | "negative" | "warning";
  emphasis?: boolean;
  href?: string;
}

/**
 * Kennzahlen in einem Panel. Desktop nebeneinander, mobil 2 Spalten;
 * eine `emphasis`-Kachel nimmt mobil die volle Breite.
 */
export function StatStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const items = React.Children.toArray(children).filter(React.isValidElement);
  // Mobil: 2 Spalten. Keine Zelle bleibt leer – eine einzelne Kachel vor
  // einer emphasis-Kachel oder am Ende nimmt die volle Breite.
  const wide = items.map(() => false);
  let col = 0;
  items.forEach((child, index) => {
    if ((child.props as Partial<StatProps>).emphasis) {
      if (col === 1) wide[index - 1] = true;
      wide[index] = true;
      col = 0;
    } else {
      col = col === 0 ? 1 : 0;
    }
  });
  if (col === 1) wide[items.length - 1] = true;

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-clip rounded-lg border bg-border md:grid-flow-col md:auto-cols-fr md:grid-cols-none",
        className,
      )}
    >
      {items.map((child, index) => (
        <div
          key={child.key ?? index}
          className={cn(
            "min-w-0 bg-card",
            wide[index] && "col-span-2 md:col-span-1",
          )}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/** Eine Kennzahl im StatStrip. Ohne Icon; `hint` trägt Kontext/Zeitraum. */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  emphasis,
  href,
}: StatProps) {
  const body = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "num mt-1 font-semibold",
          emphasis
            ? "text-[32px] leading-9 tracking-[-0.02em]"
            : "text-[22px] leading-7",
          TONE[tone],
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block h-full px-4 py-3 transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {body}
      </Link>
    );
  }
  return <div className="h-full px-4 py-3">{body}</div>;
}
