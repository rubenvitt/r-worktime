import type * as React from "react";
import { PageContainer } from "@/components/app/page-container";

/** Rahmen der Berichte; Kopf und Unternavigation rendert jede Seite selbst. */
export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageContainer>{children}</PageContainer>;
}
