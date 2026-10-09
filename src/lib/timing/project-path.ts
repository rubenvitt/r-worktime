// Projektpfade wie in Timing: Segmente von der Wurzel zum Blatt, verbunden mit " ▸ ".

export const PROJECT_PATH_SEPARATOR = " ▸ ";

export function joinTitleChain(chain: string[]): string {
  return chain
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join(PROJECT_PATH_SEPARATOR);
}

export function splitProjectPath(path: string): string[] {
  return path
    .split("▸")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/**
 * true, wenn der Pfad mit einer der Wurzeln beginnt – segmentweise exakt:
 * "Work" passt auf "Work" und "Work ▸ Kunde A", aber nicht auf "Workshop".
 */
export function matchesProjectRoot(path: string, roots: string[]): boolean {
  const segments = splitProjectPath(path);
  if (segments.length === 0) return false;

  return roots.some((root) => {
    const rootSegments = splitProjectPath(root);
    if (rootSegments.length === 0 || rootSegments.length > segments.length) {
      return false;
    }
    return rootSegments.every((segment, i) => segment === segments[i]);
  });
}
