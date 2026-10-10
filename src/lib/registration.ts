/**
 * Selbst-Registrierung ist standardmäßig aus. Für einen neuen Account
 * REGISTRATION_ENABLED="true" setzen, Account anlegen, wieder entfernen.
 */
export function isRegistrationEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.REGISTRATION_ENABLED === "true";
}
