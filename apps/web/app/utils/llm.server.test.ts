import { afterEach, describe, expect, it, vi } from "vitest";
import { parseJsonFromText } from "~/utils/llm.server";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseJsonFromText logging", () => {
  it("reports metadata without logging private response content", () => {
    const secret = "private learner text that must never reach logs";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => parseJsonFromText(secret)).toThrow("Gemini response is not valid JSON.");
    expect(consoleError).toHaveBeenCalledWith("parseJsonFromText failed", {
      errorClass: "invalid_json",
      responseLength: secret.length
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(secret);
  });
});
