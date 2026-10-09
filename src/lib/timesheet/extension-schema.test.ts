import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Das Schema der Extension ist ein klassisches Script mit CommonJS-Export.
const require = createRequire(import.meta.url);
const Schema = require("../../../extension/lib/timesheet-schema.js") as {
  describeOrigin: (origin: unknown) => string;
};

describe("Extension: describeOrigin", () => {
  it("kennzeichnet lokale Instanzen", () => {
    expect(Schema.describeOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000 (lokale Entwicklungsinstanz)",
    );
    expect(Schema.describeOrigin("http://127.0.0.1:3002")).toBe(
      "http://127.0.0.1:3002 (lokale Entwicklungsinstanz)",
    );
  });

  it("zeigt andere Origins unverändert und Unbekanntes leer", () => {
    expect(Schema.describeOrigin("https://zeit.example.test")).toBe(
      "https://zeit.example.test",
    );
    expect(Schema.describeOrigin(undefined)).toBe("");
    expect(Schema.describeOrigin("kein origin")).toBe("");
  });
});
