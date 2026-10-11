import { describe, expect, it, vi } from "vitest";
import { absenceLockKey, withUserAbsenceLock } from "./lock";

describe("withUserAbsenceLock", () => {
  it("nimmt die Advisory-Lock mit dem Schlüssel des Nutzers", async () => {
    const $queryRaw = vi.fn().mockResolvedValue([{ "?column?": 1 }]);
    await withUserAbsenceLock({ $queryRaw } as never, "user-1");

    expect($queryRaw).toHaveBeenCalledTimes(1);
    const [strings, key] = $queryRaw.mock.calls[0];
    expect(strings.join("?")).toContain("pg_advisory_xact_lock(hashtext(?))");
    expect(key).toBe("absences:user-1");
  });

  it("behält den bisherigen Schlüssel des Dialogs", () => {
    expect(absenceLockKey("abc")).toBe("absences:abc");
  });
});
