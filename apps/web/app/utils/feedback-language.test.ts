import { describe, expect, it } from "vitest";
import {
  FEEDBACK_LANGUAGE_PREFERENCE_KEY,
  LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY,
  LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY,
  PREVIOUS_FEEDBACK_LANGUAGE_STORAGE_KEY,
  migrateFeedbackLanguagePreference,
  parseFeedbackLanguage,
  resolveFeedbackLanguage
} from "~/utils/feedback-language";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  constructor(entries: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(entries)) this.values.set(key, value);
  }

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const EARLIER_KEYS = [
  PREVIOUS_FEEDBACK_LANGUAGE_STORAGE_KEY,
  LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY,
  LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY
];

describe("migrateFeedbackLanguagePreference", () => {
  it("returns a stored preference as is, including an explicit English choice", () => {
    for (const value of ["auto", "en", "zh"] as const) {
      const storage = new MemoryStorage({ [FEEDBACK_LANGUAGE_PREFERENCE_KEY]: value });
      expect(migrateFeedbackLanguagePreference(storage)).toBe(value);
    }
  });

  it("keeps an earlier Chinese choice explicit, whichever key held it", () => {
    for (const key of EARLIER_KEYS) {
      const storage = new MemoryStorage({ [key]: "zh" });
      expect(migrateFeedbackLanguagePreference(storage)).toBe("zh");
      expect(storage.getItem(FEEDBACK_LANGUAGE_PREFERENCE_KEY)).toBe("zh");
    }
  });

  // The old code persisted `en` as a default on first read, so a stored `en` is not evidence of a
  // choice. Treating it as explicit would pin every earlier visitor to English feedback in the
  // Chinese interface.
  it("turns an earlier English value into follow-the-interface", () => {
    const storage = new MemoryStorage({ [PREVIOUS_FEEDBACK_LANGUAGE_STORAGE_KEY]: "en" });
    expect(migrateFeedbackLanguagePreference(storage)).toBe("auto");
    expect(storage.getItem(FEEDBACK_LANGUAGE_PREFERENCE_KEY)).toBe("auto");
  });

  it("keeps the earlier precedence: canonical, then Writing, then Reading", () => {
    const storage = new MemoryStorage({
      [PREVIOUS_FEEDBACK_LANGUAGE_STORAGE_KEY]: "en",
      [LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY]: "zh"
    });
    expect(migrateFeedbackLanguagePreference(storage)).toBe("auto");

    const writingFirst = new MemoryStorage({
      [LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY]: "invalid",
      [LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY]: "zh"
    });
    expect(migrateFeedbackLanguagePreference(writingFirst)).toBe("zh");
  });

  it("removes every earlier key once migrated", () => {
    const storage = new MemoryStorage({
      [PREVIOUS_FEEDBACK_LANGUAGE_STORAGE_KEY]: "zh",
      [LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY]: "en",
      [LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY]: "en"
    });
    migrateFeedbackLanguagePreference(storage);
    for (const key of EARLIER_KEYS) expect(storage.getItem(key)).toBeNull();
  });

  it("defaults to follow-the-interface when nothing was stored", () => {
    const storage = new MemoryStorage();
    expect(migrateFeedbackLanguagePreference(storage)).toBe("auto");
    expect(storage.getItem(FEEDBACK_LANGUAGE_PREFERENCE_KEY)).toBe("auto");
  });
});

describe("resolveFeedbackLanguage", () => {
  it("follows the interface when the learner has not chosen", () => {
    expect(resolveFeedbackLanguage("auto", "zh")).toBe("zh");
    expect(resolveFeedbackLanguage("auto", "en")).toBe("en");
  });

  it("lets an explicit choice outrank the interface", () => {
    expect(resolveFeedbackLanguage("en", "zh")).toBe("en");
    expect(resolveFeedbackLanguage("zh", "en")).toBe("zh");
  });
});

describe("parseFeedbackLanguage", () => {
  it("accepts only the two grader languages", () => {
    expect(parseFeedbackLanguage("zh")).toBe("zh");
    expect(parseFeedbackLanguage("auto")).toBe("en");
    expect(parseFeedbackLanguage(null)).toBe("en");
  });
});
