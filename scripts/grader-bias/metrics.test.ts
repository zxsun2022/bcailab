import { describe, expect, it } from "vitest";
import { parseManifest, evaluateBias, detectsError, CONDITIONS, RUNS, type Manifest, type Run } from "./metrics";
import { buildSpikePrompt } from "../grader-variance";
import { buildPrompt } from "../../apps/web/app/utils/esl-reading-eval.server";

const passage = "Three thin students wait at a bus stop.";
const start = passage.indexOf("students");
const error = { kind: "mispronunciation" as const, quote: "students", start, end: start + 8 };
const manifest = (): Manifest => parseManifest({ version: 1, model: "test-model", recordings:
  Array.from({ length: 8 }, (_, i) => ({
    id: `r${i}`, speaker: `speaker-${i % 2}`, audio: `r${i}.mp3`,
    audioSha256: i.toString(16).padStart(64, "0"), passage, durationSeconds: 4,
    testedTag: i < 4 ? "th_sound" : "linking", weaknessPresent: i % 4 < 2,
    groundTruth: "Synthetic fixture for metrics, not an annotated audio dataset.",
    brief: "## Learner context\nCoach note: prior weakness.", persistentIssues: ["prior weakness"],
    otherErrors: [error]
  })) });
const runs = (input: Manifest): Run[] => input.recordings.flatMap(recording =>
  CONDITIONS.flatMap(condition => Array.from({ length: RUNS }, (_, repeat) => ({
    recordingId: recording.id, condition, repeat, overall: 80,
    highlights: [{ kind: error.kind, text_quote: error.quote, text_span: { start: error.start, end: error.end } }]
  })))
);

describe("registered corpus validation", () => {
  it("accepts a balanced two-speaker corpus with both tested tags", () => {
    expect(manifest().recordings).toHaveLength(8);
  });
  it("rejects missing negative cases, single speakers and duplicate audio", () => {
    const missing = manifest(); missing.recordings[3].weaknessPresent = true;
    expect(() => parseManifest(missing)).toThrow("weaknessPresent=false");
    const single = manifest(); single.recordings.forEach(r => { r.speaker = "one"; });
    expect(() => parseManifest(single)).toThrow("two speakers");
    const duplicate = manifest(); duplicate.recordings[1].audioSha256 = duplicate.recordings[0].audioSha256;
    expect(() => parseManifest(duplicate)).toThrow("distinct audio");
  });
  it("rejects wrong quotes and errors attributed to the tested tag", () => {
    const wrong = manifest(); wrong.recordings[0].otherErrors = [{ ...error, quote: "different" }];
    expect(() => parseManifest(wrong)).toThrow("offsets");
    const primed = manifest(); primed.recordings[0].otherErrors = [{ ...error, quote: "Three", start: 0, end: 5 }];
    expect(() => parseManifest(primed)).toThrow("outside the tested tag");
  });
  it("rejects unannotated corpora and unbounded briefs", () => {
    const unannotated = manifest(); unannotated.recordings.forEach(r => { r.otherErrors = []; });
    expect(() => parseManifest(unannotated)).toThrow("two recordings");
    const long = manifest(); long.recordings[0].brief = "x".repeat(1801);
    expect(() => parseManifest(long)).toThrow("1800");
  });
});

describe("Reading bias metrics", () => {
  it("passes unchanged scores, attributed accuracy and other-error recall", () => {
    const input = manifest();
    expect(evaluateBias(input, runs(input)).map(r => r.pass)).toEqual([true, true]);
  });
  it("fails a stable eight-point penalty despite zero variance", () => {
    const input = manifest(), output = runs(input);
    output.filter(r => r.condition === "brief").forEach(r => { r.overall -= 8; });
    const [brief, legacy] = evaluateBias(input, output);
    expect(brief.pooledMeanShift).toBe(-8);
    expect(brief.pass).toBe(false);
    expect(legacy.pass).toBe(true);
  });
  it("checks per-recording shifts even when the pooled shifts cancel", () => {
    const input = manifest(), output = runs(input);
    output.filter(r => r.condition === "brief").forEach(r => {
      r.overall += Number(r.recordingId.slice(1)) % 2 ? -5 : 5;
    });
    const [brief] = evaluateBias(input, output);
    expect(brief.pooledMeanShift).toBe(0);
    expect(brief.pass).toBe(false);
  });
  it("fails hallucinated th and linking highlights on negative recordings", () => {
    const input = manifest(), output = runs(input);
    output.filter(r => r.condition === "brief").forEach(run => {
      const recording = input.recordings.find(r => r.id === run.recordingId)!;
      if (recording.weaknessPresent) return;
      run.highlights.push(recording.testedTag === "th_sound"
        ? { kind: "mispronunciation", text_quote: "Three", text_span: { start: 0, end: 5 } }
        : { kind: "pause", text_quote: "wait at", text_span: { start: 20, end: 27 } });
    });
    const [brief] = evaluateBias(input, output);
    expect(brief.absentAccuracyDrop).toBeGreaterThan(0.05);
    expect(brief.pass).toBe(false);
  });
  it("fails when priming crowds out known errors and also evaluates legacy", () => {
    const input = manifest(), output = runs(input);
    output.filter(r => r.condition === "legacy").forEach(r => { r.highlights = []; });
    const [brief, legacy] = evaluateBias(input, output);
    expect(brief.pass).toBe(true);
    expect(legacy.otherRecallDrop).toBe(1);
    expect(legacy.pass).toBe(false);
  });
  it("refuses missing or duplicated runs rather than reporting a partial pass", () => {
    const input = manifest(), output = runs(input);
    expect(() => evaluateBias(input, output.slice(1))).toThrow("Incomplete");
    output[0] = output[1];
    expect(() => evaluateBias(input, output)).toThrow("Duplicate");
  });
  it("requires the right kind and a passage-grounded span for known-error recall", () => {
    const run = runs(manifest())[0];
    expect(detectsError(passage, error, run)).toBe(true);
    run.highlights[0].text_quote = "invented";
    expect(detectsError(passage, error, run)).toBe(false);
  });
});

describe("experiment prompt parity", () => {
  const input = { passageText: passage, mode: "reading" as const, lang: "en" as const };
  it("uses exactly the production prompt and schema for baseline and legacy", () => {
    for (const learnerProfile of [null, { persistent_issues: ["th weakness"], strengths: [] }]) {
      expect(buildSpikePrompt({ ...input, learnerProfile })).toBe(buildPrompt({ passageText: passage,
        mode: "reading", outputLanguage: "en", durationSeconds: null, history: [], learnerProfile }));
    }
  });
  it("adds only the brief before the passage; rejects double priming", () => {
    const baseline = buildSpikePrompt(input);
    const brief = "## Learner context\nPrior AI judgement: weak th.";
    const prompt = buildSpikePrompt({ ...input, brief });
    expect(prompt.replace("\n\n" + brief, "")).toBe(baseline);
    expect(prompt.indexOf(brief)).toBeLessThan(prompt.indexOf("## Passage text"));
    expect(() => buildSpikePrompt({ ...input, brief, learnerProfile: { persistent_issues: [], strengths: [] } })).toThrow("not both");
  });
});

describe("strict experiment parsing", () => {
  it("rejects missing scores and malformed highlights instead of treating them as clean", async () => {
    const { parseSpikeResult } = await import("../grader-variance");
    const scores = { overall: 80, pronunciation: 80, stress_rhythm: 80, fluency: 80, clarity: 80 };
    expect(() => parseSpikeResult(JSON.stringify({ scores, highlights: [{ kind: "invented" }] }))).toThrow("highlights");
    expect(() => parseSpikeResult(JSON.stringify({ scores: { overall: 80 }, highlights: [] }))).toThrow("scores");
    expect(() => parseSpikeResult("not JSON with private context")).toThrow("Response is not valid JSON.");
    expect(parseSpikeResult(JSON.stringify({ scores, highlights: [] })).overall).toBe(80);
  });
});
