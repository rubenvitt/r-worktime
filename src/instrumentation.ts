export async function register() {
  // Timing-Sync-Scheduler nur im Node-Server – nicht im Edge-Runtime, nicht im Build
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (
      process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.TIMING_SYNC_SCHEDULER?.trim().toLowerCase() === "off"
    ) {
      return;
    }
    const { startTimingScheduler } = await import("@/lib/timing/scheduler");
    startTimingScheduler();
  }
}
