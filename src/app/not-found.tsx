import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-dvh bg-background px-4">
      <div className="mx-auto flex max-w-sm flex-col items-start gap-3 pt-[22vh]">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">
          Diese Seite gibt es nicht.
        </h1>
        <p className="text-sm text-muted-foreground">
          Der Link ist falsch oder veraltet.
        </p>
        <Button asChild className="mt-2">
          <Link href="/dashboard">Zur Übersicht</Link>
        </Button>
      </div>
    </main>
  );
}
