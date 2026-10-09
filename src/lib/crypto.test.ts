import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  EncryptionKeyError,
  encryptSecret,
  getEncryptionKey,
  isEncryptionConfigured,
  secretHint,
  TOKEN_KEY_ENV,
} from "./crypto";

describe("crypto", () => {
  const original = process.env[TOKEN_KEY_ENV];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[TOKEN_KEY_ENV];
    } else {
      process.env[TOKEN_KEY_ENV] = original;
    }
  });

  it("verschlüsselt und entschlüsselt verlustfrei (base64-Key)", () => {
    process.env[TOKEN_KEY_ENV] = randomBytes(32).toString("base64");
    const secret = "synthetic-token-äöü-1234";
    const encrypted = encryptSecret(secret);

    expect(encrypted).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it("akzeptiert hex-Keys", () => {
    const hex = randomBytes(32).toString("hex");
    const key = getEncryptionKey(hex);
    expect(key.length).toBe(32);
    expect(key.toString("hex")).toBe(hex);
  });

  it("erzeugt pro Aufruf einen anderen IV", () => {
    const key = randomBytes(32);
    expect(encryptSecret("abc", key)).not.toBe(encryptSecret("abc", key));
  });

  it("erkennt Manipulation am Ciphertext", () => {
    const key = randomBytes(32);
    const [v, iv, tag, data] = encryptSecret("abcdef", key).split(":");
    const bytes = Buffer.from(data, "base64");
    bytes[0] ^= 0xff;
    const tampered = [v, iv, tag, bytes.toString("base64")].join(":");
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it("scheitert mit falschem Schlüssel", () => {
    const encrypted = encryptSecret("abc", randomBytes(32));
    expect(() => decryptSecret(encrypted, randomBytes(32))).toThrow();
  });

  it("lehnt unbekannte Formate ab", () => {
    expect(() => decryptSecret("v2:a:b:c", randomBytes(32))).toThrow(/Format/);
    expect(() => decryptSecret("kaputt", randomBytes(32))).toThrow(/Format/);
  });

  it("meldet fehlenden oder zu kurzen Schlüssel klar", () => {
    delete process.env[TOKEN_KEY_ENV];
    expect(() => getEncryptionKey()).toThrow(EncryptionKeyError);
    expect(isEncryptionConfigured()).toBe(false);

    process.env[TOKEN_KEY_ENV] = randomBytes(16).toString("base64");
    expect(() => getEncryptionKey()).toThrow(/32 Byte/);

    process.env[TOKEN_KEY_ENV] = randomBytes(32).toString("base64");
    expect(isEncryptionConfigured()).toBe(true);
  });

  it("zeigt nur die letzten 4 Zeichen", () => {
    expect(secretHint("abcdefgh1234")).toBe("1234");
  });
});
