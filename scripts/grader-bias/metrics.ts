/** Pure metrics for roadmap Stage 1's Reading gate; thresholds are owner-controlled. */
import { attributeReadingErrors, type ReadingHighlight } from "../../apps/web/app/utils/learner-model";
import { analyzePassage } from "../../apps/web/app/utils/passage-tags";

export const CONDITIONS = ["baseline", "brief", "legacy"] as const;
export type Condition = typeof CONDITIONS[number];
export type TestedTag = "th_sound" | "linking";
export const RUNS = 5;
export const LIMITS = { pooledScoreShift: 2, recordingScoreShift: 4, absentAccuracyDrop: 0.05, otherRecallDrop: 0.10 } as const;

export type KnownError = {
  kind: ReadingHighlight["kind"];
  quote: string;
  start: number;
  end: number;
};
export type Recording = {
  id: string;
  speaker: string;
  audio: string;
  audioSha256: string;
  passage: string;
  durationSeconds: number;
  testedTag: TestedTag;
  weaknessPresent: boolean;
  /** Human annotation or a described construction, fixed before any model calls. */
  groundTruth: string;
  /** Full rendered experimental brief. Synthetic assertions, not real user histories. */
  brief: string;
  persistentIssues: string[];
  otherErrors: KnownError[];
};
export type Manifest = { version: 1; model: string; recordings: Recording[] };
export type Run = {
  recordingId: string;
  condition: Condition;
  repeat: number;
  overall: number;
  highlights: (ReadingHighlight & { text_span: { start: number; end: number } })[];
};

const fail = (message: string): never => { throw new Error(message); };
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : fail("Expected an object.");
const text = (value: unknown, name: string): string =>
  typeof value === "string" && value.trim() ? value : fail(`Missing ${name}.`);
const positiveNumber = (value: unknown, name: string): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fail(`Invalid ${name}.`);
const integer = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fail("Invalid text offset.");

/** Validate dataset coverage and pre-annotated errors; audio hashes are checked by the CLI. */
export const parseManifest = (value: unknown): Manifest => {
  const root = object(value);
  if (root.version !== 1 || !Array.isArray(root.recordings)) fail("Expected manifest version 1 and recordings.");
  const recordings = (root.recordings as unknown[]).map((value): Recording => {
    const row = object(value);
    const testedTag = row.testedTag;
    if (testedTag !== "th_sound" && testedTag !== "linking") fail("testedTag must be th_sound or linking.");
    if (typeof row.weaknessPresent !== "boolean") fail("weaknessPresent must be a boolean.");
    const passage = text(row.passage, "passage");
    const tags = analyzePassage(passage).tags;
    if (!tags.some(({ tag, count }) => tag === testedTag && count > 0)) fail("Tested tag has no exposure in passage.");
    const brief = text(row.brief, "brief");
    if (brief.length > 1800) fail("Brief exceeds 1800 characters.");
    const audioSha256 = text(row.audioSha256, "audioSha256");
    if (!/^[a-f0-9]{64}$/.test(audioSha256)) fail("Invalid audio SHA-256.");
    if (!Array.isArray(row.persistentIssues) || row.persistentIssues.length < 1 || row.persistentIssues.length > 4) {
      fail("Supply 1–4 legacy persistent issues.");
    }
    const persistentIssues = (row.persistentIssues as unknown[]).map(v => text(v, "persistent issue"));
    if (!Array.isArray(row.otherErrors)) fail("Supply otherErrors, even when empty.");
    const otherErrors = (row.otherErrors as unknown[]).map((value): KnownError => {
      const error = object(value);
      const kind = error.kind;
      if (kind !== "mispronunciation" && kind !== "stress" && kind !== "pause" && kind !== "intonation") fail("Invalid known error kind.");
      const quote = text(error.quote, "error quote");
      const start = integer(error.start), end = integer(error.end);
      if (end <= start || passage.slice(start, end) !== quote) fail("Known error quote must match its passage offsets.");
      const tally = attributeReadingErrors(tags, [{ kind: kind as KnownError["kind"], text_quote: quote }]).get(testedTag as TestedTag)!;
      if (tally.hits !== tally.exposure) fail("otherErrors must be outside the tested tag.");
      return { kind: kind as KnownError["kind"], quote, start, end };
    });
    const errorKeys = otherErrors.map(e => `${e.kind}:${e.start}:${e.end}`);
    if (new Set(errorKeys).size !== errorKeys.length) fail("Duplicate known error.");
    return {
      id: text(row.id, "recording id"), speaker: text(row.speaker, "speaker"),
      audio: text(row.audio, "audio path"), audioSha256, passage,
      durationSeconds: positiveNumber(row.durationSeconds, "durationSeconds"),
      testedTag: testedTag as TestedTag, weaknessPresent: row.weaknessPresent as boolean,
      groundTruth: text(row.groundTruth, "groundTruth"), brief, persistentIssues, otherErrors
    };
  });
  if (recordings.length < 6 || new Set(recordings.map(r => r.speaker)).size < 2) fail("Need at least six recordings and two speakers.");
  if (new Set(recordings.map(r => r.id)).size !== recordings.length) fail("Recording IDs must be unique.");
  if (new Set(recordings.map(r => r.audioSha256)).size !== recordings.length) fail("Recordings must have distinct audio hashes.");
  for (const tag of ["th_sound", "linking"]) {
    for (const present of [true, false]) {
      if (recordings.filter(r => r.testedTag === tag && r.weaknessPresent === present).length < 2) {
        fail(`Need two ${tag} recordings with weaknessPresent=${present}.`);
      }
    }
  }
  if (recordings.filter(r => r.otherErrors.length > 0).length < 2) fail("Need other known errors in at least two recordings.");
  return { version: 1, model: text(root.model, "model"), recordings };
};

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

/** A known error is detected only by the right kind and a valid, overlapping quoted span. */
export const detectsError = (passage: string, error: KnownError, run: Run): boolean =>
  run.highlights.some(h => h.kind === error.kind &&
    h.text_span.start < error.end && h.text_span.end > error.start &&
    passage.slice(h.text_span.start, h.text_span.end) === h.text_quote);

/** Refuse incomplete/duplicated experiments; never fill a missing call with a score of zero. */
export const evaluateBias = (manifest: Manifest, runs: Run[]) => {
  if (runs.length !== manifest.recordings.length * CONDITIONS.length * RUNS) fail("Incomplete experiment.");
  const keys = new Set<string>();
  const ids = new Set(manifest.recordings.map(r => r.id));
  for (const run of runs) {
    if (!ids.has(run.recordingId) || !CONDITIONS.includes(run.condition) ||
        !Number.isInteger(run.repeat) || run.repeat < 0 || run.repeat >= RUNS ||
        !Number.isFinite(run.overall) || run.overall < 0 || run.overall > 100) fail("Invalid run.");
    const key = `${run.recordingId}:${run.condition}:${run.repeat}`;
    if (keys.has(key)) fail("Duplicate run.");
    keys.add(key);
  }
  const group = (recording: Recording, condition: Condition) =>
    runs.filter(r => r.recordingId === recording.id && r.condition === condition);
  const score = (recording: Recording, condition: Condition) => mean(group(recording, condition).map(r => r.overall));
  const absentAccuracy = (condition: Condition): number => {
    let hits = 0, exposure = 0;
    for (const recording of manifest.recordings.filter(r => !r.weaknessPresent)) {
      const tags = analyzePassage(recording.passage).tags;
      for (const run of group(recording, condition)) {
        const tally = attributeReadingErrors(tags, run.highlights).get(recording.testedTag)!;
        hits += tally.hits;
        exposure += tally.exposure;
      }
    }
    return hits / exposure;
  };
  const otherRecall = (condition: Condition): number => {
    let detected = 0, total = 0;
    for (const recording of manifest.recordings) {
      for (const run of group(recording, condition)) {
        for (const error of recording.otherErrors) {
          total++;
          if (detectsError(recording.passage, error, run)) detected++;
        }
      }
    }
    return detected / total;
  };
  return (["brief", "legacy"] as const).map(condition => {
    const recordingShifts = manifest.recordings.map(recording => ({
      id: recording.id, meanShift: score(recording, condition) - score(recording, "baseline")
    }));
    const pooledMeanShift = sum(recordingShifts.map(r => r.meanShift)) / recordingShifts.length;
    const absentAccuracyDrop = absentAccuracy("baseline") - absentAccuracy(condition);
    const otherRecallDrop = otherRecall("baseline") - otherRecall(condition);
    const pass = Math.abs(pooledMeanShift) <= LIMITS.pooledScoreShift &&
      recordingShifts.every(r => Math.abs(r.meanShift) <= LIMITS.recordingScoreShift) &&
      absentAccuracyDrop <= LIMITS.absentAccuracyDrop + 1e-12 &&
      otherRecallDrop <= LIMITS.otherRecallDrop + 1e-12;
    return { condition, pass, pooledMeanShift, recordingShifts, absentAccuracyDrop, otherRecallDrop,
      baselineAbsentAccuracy: absentAccuracy("baseline"), treatmentAbsentAccuracy: absentAccuracy(condition),
      baselineOtherRecall: otherRecall("baseline"), treatmentOtherRecall: otherRecall(condition) };
  });
};
