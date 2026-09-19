import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest, locateQuote, passageExposure, renderCandidateBrief, type CorpusDraft } from "./draft";

const templatePath = path.resolve(__dirname, "../../docs/spikes/reading-bias-corpus/draft.template.json");
const template = (): CorpusDraft => JSON.parse(readFileSync(templatePath, "utf8")) as CorpusDraft;

/** The template with its placeholders filled synthetically — not an annotated recording set. */
const filled = (): CorpusDraft => {
  const draft = template();
  draft.model = "test-model";
  draft.briefDate = "2026-09-20";
  draft.recordings.forEach((recording, index) => {
    recording.durationSeconds = 18;
    recording.groundTruth = `Synthetic test fixture ${index}.`;
  });
  return draft;
};
const fakeHash = (audio: string) => createHash("sha256").update(audio).digest("hex");

describe("corpus draft", () => {
  it("ships passages that isolate each tested tag", () => {
    const { passages } = template();
    expect(passageExposure(passages.th!)).toEqual({ th_sound: 23, linking: 1 });
    expect(passageExposure(passages.link!)).toEqual({ th_sound: 1, linking: 25 });
  });

  it("refuses the template until every placeholder is replaced", () => {
    expect(() => buildManifest(template(), fakeHash)).toThrow(/TODO/);
  });

  it("builds a manifest the registered validator accepts", () => {
    const manifest = buildManifest(filled(), fakeHash);
    expect(manifest.recordings).toHaveLength(8);
    const shelf = manifest.recordings.find((r) => r.id === "a-link-absent")!.otherErrors[0]!;
    expect(shelf.quote).toBe("shelf");
    expect(manifest.recordings[5]!.passage.slice(shelf.start, shelf.end)).toBe("shelf");
    // Every recording of a tag carries the identical brief and legacy phrase.
    const thBriefs = new Set(manifest.recordings.filter((r) => r.testedTag === "th_sound").map((r) => r.brief));
    expect(thBriefs.size).toBe(1);
  });

  it("renders the brief through the production learner-context renderer", () => {
    const brief = renderCandidateBrief("th_sound", { mastery: 0.55, exposure: 24, legacyPhrase: "x" }, "2026-09-20");
    expect(brief).toContain("## Learner context (as of 2026-09-20)");
    expect(brief).toContain("Level: not established");
    expect(brief).toContain("- the 'th' sound: 55% over 24 occurrences — may include AI judgement (Reading)");
    expect(brief).toContain("Never add an issue, pattern, highlight, or score because of this section.");
    expect(brief.length).toBeLessThanOrEqual(1800);
  });

  it("rejects a claim that would not render as a weakness", () => {
    expect(() => renderCandidateBrief("linking", { mastery: 0.8, exposure: 24, legacyPhrase: "x" }, "2026-09-20"))
      .toThrow(/does not render as a weakness/);
    expect(() => renderCandidateBrief("linking", { mastery: 0.5, exposure: 3, legacyPhrase: "x" }, "2026-09-20"))
      .toThrow(/does not render as a weakness/);
  });

  it("locates the n-th occurrence of a quote and rejects a missing one", () => {
    const passage = "it is up and it is on";
    expect(locateQuote(passage, "it", 2)).toEqual({ start: 13, end: 15 });
    expect(() => locateQuote(passage, "it", 3)).toThrow(/occurrence 3/);
  });

  it("keeps the registered validator's rule that other errors stay outside the tested tag", () => {
    const draft = filled();
    draft.recordings[0]!.otherErrors = [{ kind: "mispronunciation", quote: "brothers" }];
    expect(() => buildManifest(draft, fakeHash)).toThrow(/outside the tested tag/);
  });
});
