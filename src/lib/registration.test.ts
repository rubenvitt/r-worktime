import { describe, expect, it, vi } from "vitest";
import { isRegistrationEnabled } from "./registration";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/rate-limit", () => ({ authRateLimit: vi.fn(async () => null) }));

describe("isRegistrationEnabled", () => {
  it("ist ohne Variable aus", () => {
    expect(isRegistrationEnabled({})).toBe(false);
  });

  it('ist nur bei exakt "true" an', () => {
    expect(isRegistrationEnabled({ REGISTRATION_ENABLED: "true" })).toBe(true);
    expect(isRegistrationEnabled({ REGISTRATION_ENABLED: "1" })).toBe(false);
    expect(isRegistrationEnabled({ REGISTRATION_ENABLED: "false" })).toBe(
      false,
    );
  });
});

describe("POST /api/auth/register", () => {
  it("lehnt ab, solange die Registrierung aus ist", async () => {
    vi.stubEnv("REGISTRATION_ENABLED", "");
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("@/app/api/auth/register/route");
    const request = new Request("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Test",
        email: "neu@example.test",
        password: "geheim-1234",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
