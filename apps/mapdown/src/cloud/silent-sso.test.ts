import { describe, expect, it } from "vitest";
import {
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
