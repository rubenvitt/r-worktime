export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background px-4">
      <main className="mx-auto max-w-[360px] pt-[18vh] pb-16">
        <div className="mb-6 space-y-1">
          <p className="text-base font-semibold tracking-[-0.01em]">
            R-Worktime
          </p>
          <p className="text-sm text-muted-foreground">
            Arbeitszeit, Überstunden und Stundenzettel aus Timing.
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}
