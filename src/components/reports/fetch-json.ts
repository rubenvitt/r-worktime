// Gemeinsamer Abruf der Berichts-APIs: JSON oder deutsche Fehlermeldung.

function errorMessage(body: unknown): string | null {
  if (body && typeof body === "object" && "error" in body) {
    const { error } = body as { error: unknown };
    if (typeof error === "string") return error;
  }
  return null;
}

export async function fetchJson<T>(
  url: string,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(url);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || body === null) {
    throw new Error(errorMessage(body) ?? fallbackError);
  }
  return body as T;
}
