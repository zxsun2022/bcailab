import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.server";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "./password";

describe("password hashing", () => {
  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });

  it("produces a distinct salt per hash so identical passwords differ", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("encodes the algorithm and iteration count in the hash string", async () => {
    const hash = await hashPassword("whatever-123");
    const [scheme, iterations] = hash.split("$");
    expect(scheme).toBe("pbkdf2");
    expect(Number(iterations)).toBeGreaterThan(0);
  });

  it("never throws on malformed stored hashes and returns false", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "notahash")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$abc$salt$hash")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$100$s$h")).toBe(false);
  });
});

describe("password strength", () => {
  it("accepts a password at or above the minimum length", () => {
    expect(validatePasswordStrength("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("rejects a too-short password", () => {
    expect(validatePasswordStrength("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe("too_short");
  });

  it("rejects an over-long password", () => {
    expect(validatePasswordStrength("a".repeat(257))).toBe("too_long");
  });
});
