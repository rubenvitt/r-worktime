import type * as React from "react";
import { cn } from "@/lib/utils";

const WIDTH = {
  default: "max-w-[1120px]",
  wide: "max-w-[1280px]",
  form: "max-w-[640px]",
} as const;

/** Inhaltsbreite einer Seite. Immer linksbündig, Rand kommt aus der AppShell. */
export function PageContainer({
  width = "default",
  className,
  children,
}: {
  width?: "default" | "wide" | "form";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("w-full", WIDTH[width], className)}>{children}</div>
  );
}
