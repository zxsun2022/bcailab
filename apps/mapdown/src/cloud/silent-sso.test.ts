import { describe, expect, it } from "vitest";
import {
  createSilentSsoAttempt,
  isSilentSsoSuppressed,
  setSilentSsoSuppressed,
  silentSsoToken
} from "./silent-sso";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe("Mapdown silent SSO", () => {
  it("runs at most once per page and shares an in-flight attempt", async () => {
    let calls = 0;
    let finish!: (value: string) => void;
    const attempt = createSilentSsoAttempt(async () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    });

    const first = attempt();
    const concurrent = attempt();
    expect(concurrent).toBe(first);
    expect(calls).toBe(1);

    finish("signed-in");
    await expect(first).resolves.toBe("signed-in");
    await expect(attempt()).resolves.toBeNull();
    expect(calls).toBe(1);
  });

  it("suppresses silent SSO after explicit sign-out until explicit sign-in", () => {
    const storage = memoryStorage();
    setSilentSsoSuppressed(storage, true);
    expect(isSilentSsoSuppressed(storage)).toBe(true);
    setSilentSsoSuppressed(storage, false);
    expect(isSilentSsoSuppressed(storage)).toBe(false);
  });

  it("accepts only the silent handoff message contract", () => {
    expect(silentSsoToken({ type: "mapdown-silent-auth", token: "signed-token" })).toBe("signed-token");
    expect(silentSsoToken({ type: "mapdown-silent-auth", token: null })).toBeNull();
    expect(silentSsoToken({ type: "mapdown-auth", token: "signed-token" })).toBeUndefined();
  });
});
