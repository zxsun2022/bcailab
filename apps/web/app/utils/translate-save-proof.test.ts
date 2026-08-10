import { describe, expect, it } from "vitest";
import {
  createTranslationSaveProof,
  tryCreateTranslationSaveProof,
  normalizeTranslationSaveSnapshot,
  verifyTranslationSaveProof,
  type TranslationSaveSnapshot
} from "~/utils/translate-save-proof.server";

const NOW = Date.UTC(2026, 7, 10, 12, 0, 0);
const SECRET = "translate-proof-test-secret";
const snapshot: TranslationSaveSnapshot = {
  sourceLanguage: "auto",
  detectedSourceLanguage: "zh-Hans",
  targetLanguage: "en",
  sourceText: "你好，世界。",
  translatedText: "Hello, world."
};

describe("translation save completion proof", () => {
  it("round-trips a completed snapshot without putting its text in the token", async () => {
    const proof = await createTranslationSaveProof({
      secret: SECRET,
      subject: "user:user-1",
      snapshot,
      nowMs: NOW,
      completionId: "11111111-1111-4111-8111-111111111111"
    });
    expect(proof).not.toContain("Hello");
    const verified = await verifyTranslationSaveProof({
      secret: SECRET,
      proof,
      acceptedSubjects: ["user:user-1"],
      snapshot,
      nowMs: NOW + 60_000
    });
    expect(verified.completionId).toBe("11111111-1111-4111-8111-111111111111");
    expect(verified.snapshot).toEqual(snapshot);
  });

  it("accepts the same anonymous subject after popup authentication", async () => {
    const proof = await createTranslationSaveProof({
      secret: SECRET,
      subject: "anon:22222222-2222-4222-8222-222222222222",
      snapshot,
      nowMs: NOW
    });
    await expect(verifyTranslationSaveProof({
      secret: SECRET,
      proof,
      acceptedSubjects: [
        "user:new-user",
        "anon:22222222-2222-4222-8222-222222222222"
      ],
      snapshot,
      nowMs: NOW
    })).resolves.toMatchObject({ snapshot });
  });

  it("rejects tampering, expiry, a different subject, and changed output", async () => {
    const proof = await createTranslationSaveProof({
      secret: SECRET,
      subject: "user:user-1",
      snapshot,
      nowMs: NOW
    });
    const tamperedProof = `${proof.slice(0, -1)}${proof.endsWith("A") ? "B" : "A"}`;
    const cases = [
      { proof: tamperedProof, acceptedSubjects: ["user:user-1"], snapshot, nowMs: NOW },
      { proof, acceptedSubjects: ["user:user-1"], snapshot, nowMs: NOW + 16 * 60_000 },
      { proof, acceptedSubjects: ["user:user-2"], snapshot, nowMs: NOW },
      { proof, acceptedSubjects: ["user:user-1"], snapshot: { ...snapshot, translatedText: "Partial" }, nowMs: NOW }
    ];
    for (const input of cases) {
      await expect(verifyTranslationSaveProof({ secret: SECRET, ...input })).rejects.toThrow();
    }
  });

  it("normalizes line endings and rejects empty or oversized bodies", () => {
    expect(normalizeTranslationSaveSnapshot({
      ...snapshot,
      sourceText: "one\r\ntwo\rthree"
    }).sourceText).toBe("one\ntwo\nthree");
    expect(() => normalizeTranslationSaveSnapshot({ ...snapshot, translatedText: "  " }))
      .toThrow();
    expect(() => normalizeTranslationSaveSnapshot({ ...snapshot, sourceText: "x".repeat(20_001) }))
      .toThrow();
  });

  it("keeps an oversized completed translation successful but ineligible to save", async () => {
    await expect(tryCreateTranslationSaveProof({
      secret: SECRET,
      subject: "user:user-1",
      snapshot: { ...snapshot, translatedText: "x".repeat(40_001) },
      nowMs: NOW
    })).resolves.toBeNull();
  });
});
