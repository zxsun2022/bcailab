import { describe, expect, it } from "vitest";
import { splitLangHeader, type TranslateStreamChunk } from "~/utils/translate.server";

/**
 * The header splitter decides where the model's `#lang:` line ends and the translation
 * begins. Getting it wrong silently drops the first line of the translation or leaks the
 * header into the output, so the chunk-boundary cases are pinned here.
 */

const from = async function* (chunks: string[]) {
  for (const chunk of chunks) yield chunk;
};

const collect = async (chunks: string[]) => {
  const out: TranslateStreamChunk[] = [];
  for await (const chunk of splitLangHeader(from(chunks))) out.push(chunk);
  return {
    detected: out.find((chunk) => chunk.type === "detected"),
    text: out
      .filter((chunk): chunk is Extract<TranslateStreamChunk, { type: "delta" }> => chunk.type === "delta")
      .map((chunk) => chunk.text)
      .join("")
  };
};

describe("splitLangHeader", () => {
  it("strips a header delivered in its own chunk", async () => {
    const { detected, text } = await collect(["#lang: zh-Hans\n", "你好", "世界"]);
    expect(detected).toEqual({ type: "detected", language: "zh-Hans" });
    expect(text).toBe("你好世界");
  });

  it("accepts a script subtag the model cased differently", async () => {
    const { detected } = await collect(["#lang: zh-hant\n繁體"]);
    expect(detected).toEqual({ type: "detected", language: "zh-Hant" });
  });

  it("strips a header split across chunk boundaries", async () => {
    const { detected, text } = await collect(["#la", "ng:", " ja", "\nこん", "にちは"]);
    expect(detected).toEqual({ type: "detected", language: "ja" });
    expect(text).toBe("こんにちは");
  });

  it("keeps content that arrives on the header line's own chunk", async () => {
    const { text } = await collect(["#lang: en\nHello there"]);
    expect(text).toBe("Hello there");
  });

  it("reports null and keeps everything when the model skips the header", async () => {
    const { detected, text } = await collect(["Hello", " there\nsecond line"]);
    expect(detected).toEqual({ type: "detected", language: null });
    expect(text).toBe("Hello there\nsecond line");
  });

  it("reports null for a header naming an unsupported language", async () => {
    const { detected, text } = await collect(["#lang: xx\nbody"]);
    expect(detected).toEqual({ type: "detected", language: null });
    expect(text).toBe("body");
  });

  it("handles a single-line translation with no trailing newline", async () => {
    const { detected, text } = await collect(["#lang: fr\nBon", "jour"]);
    expect(detected).toEqual({ type: "detected", language: "fr" });
    expect(text).toBe("Bonjour");
  });

  it("preserves blank lines between paragraphs", async () => {
    const { text } = await collect(["#lang: en\nOne\n", "\nTwo\n"]);
    expect(text).toBe("One\n\nTwo\n");
  });

  it("throws when the stream carries no translation text", async () => {
    await expect(collect(["#lang: en\n"])).rejects.toThrow(/no translation text/);
  });
});
