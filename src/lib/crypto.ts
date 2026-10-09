import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM für gespeicherte Geheimnisse (z. B. Timing-API-Token).
// Format: v1:<iv>:<tag>:<ciphertext>, jeweils base64.

export const TOKEN_KEY_ENV = "TIMING_TOKEN_ENCRYPTION_KEY";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionKeyError";
  }
}

/**
 * Liest den Schlüssel aus der Umgebung: 32 Byte als hex (64 Zeichen) oder base64.
 */
export function getEncryptionKey(
  raw: string | undefined = process.env[TOKEN_KEY_ENV],
): Buffer {
  const value = raw?.trim();
  if (!value) {
    throw new EncryptionKeyError(
      `${TOKEN_KEY_ENV} ist nicht gesetzt. Erzeuge einen Schlüssel mit „openssl rand -base64 32“.`,
    );
  }

  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");

  if (key.length !== KEY_LENGTH) {
    throw new EncryptionKeyError(
      `${TOKEN_KEY_ENV} muss genau 32 Byte lang sein (base64 oder hex).`,
    );
  }
  return key;
}

export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string, key = getEncryptionKey()) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string, key = getEncryptionKey()) {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unbekanntes Format des verschlüsselten Werts");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_LENGTH || tag.length !== 16) {
    throw new Error("Ungültiger verschlüsselter Wert");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Letzte 4 Zeichen zur Anzeige – nie den ganzen Token an den Client geben. */
export function secretHint(secret: string): string {
  return secret.slice(-4);
}
