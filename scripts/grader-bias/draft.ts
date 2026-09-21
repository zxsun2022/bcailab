/**
 * Turns a hand-filled corpus draft into the registered manifest `grader-bias.ts` reads.
 * Kit and annotation rules: docs/spikes/reading-bias-corpus/README.md.
 *
 * The draft carries only what a person decides: the recordings, their ground truth, and one
 * synthetic learner claim per tested tag. Everything derivable is derived here so it cannot be
 * mistyped: JavaScript string offsets from quotes, and the candidate brief rendered by the
 * production learner-context code from that claim. Audio hashing is injected so this stays pure.
 */
import { analyzePassage } from "../../apps/web/app/utils/passage-tags";
import { READING_TAGS } from "../../apps/web/app/utils/learner-model";
import {
  buildLearnerBrief,
  renderLearnerContext,
  type LearnerContextProjection
} from "../../apps/web/app/utils/learner-context";
import { parseManifest, type Manifest, type TestedTag } from "./metrics";

export type DraftClaim = {
  /** The synthetic learner's accuracy on the tag, 0..1. Must fall in the brief's "weak" band. */
  mastery: number;
  /** Occurrences behind that accuracy. Must reach the brief's naming minimum. */
  exposure: number;
  /** The same weakness as a legacy `persistent_issues` phrase, for the legacy comparison. */
  legacyPhrase: string;
};

export type DraftError = {
  kind: "mispronunciation" | "stress" | "pause" | "intonation";
  quote: string;
  /** Which occurrence of `quote` in the passage, counting from 1. Defaults to 1. */
  occurrence?: number;
};

export type DraftRecording = {
  id: string;
  speaker: string;
  audio: string;
  /** Key into the draft's `passages`, so every reading of a passage uses identical text. */
  passage: string;
  durationSeconds: number;
  testedTag: TestedTag;
  weaknessPresent: boolean;
  groundTruth: string;
  otherErrors: DraftError[];
};

export type CorpusDraft = {
  version: 1;
  model: string;
  /** Fixed date on the rendered brief, so the manifest is reproducible. */
  briefDate: string;
  passages: Record<string, string>;
  claims: Record<TestedTag, DraftClaim>;
  recordings: DraftRecording[];
};

const fail = (message: string): never => { throw new Error(message); };

/** JavaScript string offsets of the n-th occurrence of `quote`, matching Reading's stored spans. */
export const locateQuote = (passage: string, quote: string, occurrence = 1): { start: number; end: number } => {
  if (!quote) fail("Empty error quote.");
  let from = 0;
  let start = -1;
  for (let seen = 0; seen < occurrence; seen++) {
    start = passage.indexOf(quote, from);
    if (start < 0) fail(`"${quote}" occurrence ${occurrence} is not in the passage.`);
    from = start + quote.length;
  }
  return { start, end: start + quote.length };
};

/**
 * The candidate brief for one tested tag, through the production builder and renderer: a learner
 * with no established level whose only nameable tag is the claimed weakness. It asserts the
 * weakness identically for recordings where it is present and where it is absent.
 */
export const renderCandidateBrief = (tag: TestedTag, claim: DraftClaim, briefDate: string): string => {
  const brief = buildLearnerBrief({
    assembledAt: `${briefDate}T00:00:00Z`,
    profile: {
      tag_mastery_json: JSON.stringify({ [tag]: { mastery: claim.mastery, exposure: claim.exposure, trend: 0 } }),
      cefr_declared: null,
      cefr_measured: null,
      cefr_measured_confidence: 0
    },
    dictationAttempts: [],
    writingRounds: [],
    current: {}
  });
  const tags = brief.tagAccuracy.weak.filter((line) => READING_TAGS.has(line.tag as never));
  if (tags.length !== 1 || tags[0]!.tag !== tag) {
    fail(`The ${tag} claim does not render as a weakness; lower mastery or raise exposure.`);
  }
  const projection: LearnerContextProjection = {
    assembledAt: brief.assembledAt,
    level: brief.level,
    tags,
    dictation: { attemptsConsidered: 0, groups: [] },
    writing: { heading: "", sessionsConsidered: 0, groups: [] }
  };
  return renderLearnerContext(projection);
};

/** Build the manifest object and run the registered validator over it. */
export const buildManifest = (draft: CorpusDraft, audioSha256: (audioPath: string) => string): Manifest & Record<string, unknown> => {
  if (draft.version !== 1) fail("Expected draft version 1.");
  // The registered validator accepts any non-empty text, so a template placeholder would pass as
  // ground truth. Refuse the template's marker anywhere in the draft.
  if (JSON.stringify(draft).includes("TODO")) fail("The draft still contains TODO placeholders.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.briefDate ?? "")) fail("briefDate must be YYYY-MM-DD.");
  const briefs = {} as Record<TestedTag, string>;
  for (const tag of ["th_sound", "linking"] as const) {
    const claim = draft.claims?.[tag] ?? fail(`Missing claim for ${tag}.`);
    if (!claim.legacyPhrase?.trim()) fail(`Missing legacyPhrase for ${tag}.`);
    briefs[tag] = renderCandidateBrief(tag, claim, draft.briefDate);
  }
  const manifest = {
    version: 1 as const,
    model: draft.model,
    recordings: draft.recordings.map((recording) => {
      const passage = draft.passages?.[recording.passage] ?? fail(`Unknown passage key "${recording.passage}".`);
      return {
        id: recording.id,
        speaker: recording.speaker,
        audio: recording.audio,
        audioSha256: audioSha256(recording.audio),
        passage,
        durationSeconds: recording.durationSeconds,
        testedTag: recording.testedTag,
        weaknessPresent: recording.weaknessPresent,
        groundTruth: recording.groundTruth,
        brief: briefs[recording.testedTag] ?? fail(`testedTag must be th_sound or linking.`),
        persistentIssues: [draft.claims[recording.testedTag].legacyPhrase],
        otherErrors: recording.otherErrors.map((error) => ({
          kind: error.kind,
          quote: error.quote,
          ...locateQuote(passage, error.quote, error.occurrence ?? 1)
        }))
      };
    })
  };
  parseManifest(manifest);
  return manifest;
};

/** Tag exposure per passage, for choosing and checking passages before anyone records. */
export const passageExposure = (passage: string): Record<TestedTag, number> => {
  const tags = analyzePassage(passage).tags;
  const count = (tag: TestedTag) => tags.find((entry) => entry.tag === tag)?.count ?? 0;
  return { th_sound: count("th_sound"), linking: count("linking") };
};
