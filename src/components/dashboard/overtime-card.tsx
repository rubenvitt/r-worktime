// Ereignis zum Neuladen der Überstunden-Abfragen, z. B. nach einem
// Datei-Import (upload-zone). Die Übersicht und /overtime hören über
// `useTotalOvertime` (components/overview/use-overtime) darauf.

// Global event emitter for cache invalidation
export const overtimeEvents = {
  listeners: new Set<() => void>(),
  emit() {
    this.listeners.forEach((listener) => {
      listener();
    });
  },
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },
};
