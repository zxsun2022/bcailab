import { describe, expect, it } from "vitest";
import {
  FEEDBACK_LANGUAGE_STORAGE_KEY,
  LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY,
  LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY,
  migrateFeedbackLanguagePreference
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

describe("migrateFeedbackLanguagePreference", () => {
  it("keeps a valid canonical preference and removes both legacy keys", () => {
    const storage = new MemoryStorage({
      [FEEDBACK_LANGUAGE_STORAGE_KEY]: "zh",
      [LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY]: "en",
      [LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY]: "en"
    });

    expect(migrateFeedbackLanguagePreference(storage)).toBe("zh");
    expect(storage.getItem(FEEDBACK_LANGUAGE_STORAGE_KEY)).toBe("zh");
    expect(storage.getItem(LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  it("uses the former Writing preference before the former Reading preference", () => {
    const storage = new MemoryStorage({
      [LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY]: "zh",
      [LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY]: "en"
    });

    expect(migrateFeedbackLanguagePreference(storage)).toBe("zh");
    expect(storage.getItem(FEEDBACK_LANGUAGE_STORAGE_KEY)).toBe("zh");
  });

  it("uses the former Reading preference when Writing has no valid value", () => {
    const storage = new MemoryStorage({
      [LEGACY_WRITING_FEEDBACK_LANGUAGE_STORAGE_KEY]: "invalid",
      [LEGACY_READING_OUTPUT_LANGUAGE_STORAGE_KEY]: "zh"
    });

    expect(migrateFeedbackLanguagePreference(storage)).toBe("zh");
  });

  it("defaults to English and persists the canonical value", () => {
    const storage = new MemoryStorage();

    expect(migrateFeedbackLanguagePreference(storage)).toBe("en");
    expect(storage.getItem(FEEDBACK_LANGUAGE_STORAGE_KEY)).toBe("en");
  });
});
