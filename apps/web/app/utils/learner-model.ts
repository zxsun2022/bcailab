// Relative imports, not the `~` alias, so this stays consumable by plain-Node tooling for
// the same reason the tagger does (see passage-tags.ts header).
import type { DiffOp } from "./dictation-diff";
import { tokenize } from "./dictation-diff";
import { wordTags, type PassageTagName } from "./passage-tags";

/**
 * The learner model's deterministic core. Design: `docs/learner-model-design.md`.
 *
 * Pure module — no server, DOM, or network — so the measurement is reproducible and can be
 * re-derived over a learner's whole history when the aggregation changes, exactly like the
 * material tagger. The rule from §2 holds here: **this file measures; an LLM only names what
 * these numbers already show.** Nothing here calls a model.
 */

/**
 * Learner-facing descriptions of each tag, so the progress centre and the LLM naming prompt
 * describe a weakness the same way. Keyed by `passage_tags` name — the shared vocabulary.
 */
export const TAG_DESCRIPTIONS: Record<string, string> = {
  contraction: "contractions (don't, we'll, they're)",
  weak_form: "weak forms of function words in connected speech",
  article: "articles (a, an, the)",
  final_s: "word-final -s endings (plurals, third-person verbs)",
  past_ed: "past-tense -ed endings",
  homophone: "homophones (their/there, your/you're)",
  number_words: "numbers written as words",
  th_sound: "the 'th' sound",
  consonant_cluster: "consonant clusters (strengths, twelfths)",
  linking: "linking between words",
  long_sentence: "long sentences",
  question: "question intonation"
};

/* ---------- CEFR helpers ---------- */

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** 1..6; 0 for anything unrecognised. */
export const cefrOrdinal = (level: string | null | undefined): number => {
  const i = CEFR_LEVELS.indexOf((level ?? "") as CefrLevel);
  return i < 0 ? 0 : i + 1;
};

const cefrFromOrdinal = (value: number): CefrLevel => {
  const clamped = Math.min(CEFR_LEVELS.length, Math.max(1, Math.round(value)));
  return CEFR_LEVELS[clamped - 1]!;
};

/* ---------- observations: turning ops into per-tag exposure/hits ---------- */

/** Per-tag tally for one attempt: how many occurrences the material held, and how many the
 *  learner handled correctly. Written to `learner_tag_observations`. */
export type TagTally = { exposure: number; hits: number };

export type DictationSentenceInput = {
  /** The reference transcript for the sentence (ground truth). */
  reference: string;
  /** The stored non-match ops for the sentence (`dictation_attempts.sentence_results`). */
  ops: DiffOp[];
};

/**
 * Attribute a scored dictation attempt to the word-level tag vocabulary.
 *
 * `exposure` counts every reference-word occurrence carrying a tag; a `delete` or
 * `substitute` op means that reference word was not reproduced, so it counts against every
 * tag the word carries. `hits = exposure - misses`. `insert` ops (extra words the learner
 * typed) have no reference word and are ignored — they are not evidence about a tag.
 *
 * Uses `wordTags` from the tagger, so "a word carries tag T" means precisely what it meant
 * when the material was tagged — one definition, no drift (design §5.1).
 */
export const attributeDictationErrors = (
  sentences: DictationSentenceInput[]
): Map<PassageTagName, TagTally> => {
  const exposure = new Map<PassageTagName, number>();
  const misses = new Map<PassageTagName, number>();
  const bump = (map: Map<PassageTagName, number>, tag: PassageTagName) =>
    map.set(tag, (map.get(tag) ?? 0) + 1);

  for (const sentence of sentences) {
    for (const token of tokenize(sentence.reference)) {
      for (const tag of wordTags(token)) bump(exposure, tag);
    }
    for (const op of sentence.ops) {
      if (op.op !== "delete" && op.op !== "substitute") continue;
      // op.ref is already a normalized token (the aligner works over tokenize() output).
      for (const tag of wordTags(op.ref)) bump(misses, tag);
    }
  }

  const result = new Map<PassageTagName, TagTally>();
  for (const [tag, exp] of exposure) {
    const missed = misses.get(tag) ?? 0;
    result.set(tag, { exposure: exp, hits: Math.max(0, exp - missed) });
  }
  return result;
};

/**
 * Reading attribution. Design §5.2 — the noisy path. Reading evaluation is LLM-judged
 * highlights, not deterministic ops, so we extract only the prosodic/phonetic tags reading
 * can actually speak to, and mark the resulting observations `source='llm'` so aggregation
 * down-weights them. Word-form tags (articles, endings, contractions) are dictation's domain
 * and are deliberately not inferred from audio.
 */
export type ReadingHighlight = {
  kind: "mispronunciation" | "stress" | "pause" | "intonation";
  text_quote?: string | null;
};

/** The only tags a spoken-reading evaluation is allowed to touch. */
const READING_TAGS = new Set<PassageTagName>([
  "th_sound",
  "consonant_cluster",
  "homophone",
  "long_sentence",
  "linking",
  "question"
]);

/** Prosodic highlight kinds map to prosodic tags; mispronunciation is handled per-word. */
const HIGHLIGHT_KIND_TAGS: Partial<Record<ReadingHighlight["kind"], PassageTagName[]>> = {
  stress: ["long_sentence"],
  pause: ["long_sentence", "linking"],
  intonation: ["question"]
};

export const attributeReadingErrors = (
  passageTags: { tag: string; count: number }[],
  highlights: ReadingHighlight[]
): Map<PassageTagName, TagTally> => {
  // Exposure comes from the material's own (deterministic) tags. A user passage has none, so
  // this returns empty and reading on user text produces no observations — as intended (§5.4).
  const exposure = new Map<PassageTagName, number>();
  for (const { tag, count } of passageTags) {
    if (count > 0 && READING_TAGS.has(tag as PassageTagName)) {
      exposure.set(tag as PassageTagName, count);
    }
  }

  const misses = new Map<PassageTagName, number>();
  const bump = (tag: PassageTagName) => misses.set(tag, (misses.get(tag) ?? 0) + 1);
  for (const h of highlights) {
    if (h.kind === "mispronunciation") {
      for (const token of tokenize(h.text_quote ?? "")) {
        for (const tag of wordTags(token)) if (READING_TAGS.has(tag)) bump(tag);
      }
    } else {
      for (const tag of HIGHLIGHT_KIND_TAGS[h.kind] ?? []) bump(tag);
    }
  }

  const result = new Map<PassageTagName, TagTally>();
  for (const [tag, exp] of exposure) {
    const missed = Math.min(exp, misses.get(tag) ?? 0);
    result.set(tag, { exposure: exp, hits: exp - missed });
  }
  return result;
};

/* ---------- aggregation: observations into per-tag mastery ---------- */

/** One `learner_tag_observations` row, as aggregation reads it. Ordered newest-first by the
 *  caller so recency weighting needs no clock (keeps this function pure and testable). */
export type TagObservation = {
  tag: string;
  exposure: number;
  hits: number;
  source: "deterministic" | "llm";
};

export type TagMastery = {
  /** Weighted accuracy 0..1 over this tag's observations. */
  mastery: number;
  /** Total occurrences of the tag the learner has seen — separates "weak" from "untested". */
  exposure: number;
  /** Recent mastery minus earlier mastery; the growth signal. 0 when evidence is thin. */
  trend: number;
};

export type TagMasteryMap = Record<string, TagMastery>;

// Tuning constants. Flagged in the design as review-time details, not schema commitments.
/** Reading is LLM-judged and noisier than a deterministic dictation op (design §5.2). */
const SOURCE_WEIGHT: Record<TagObservation["source"], number> = {
  deterministic: 1,
  llm: 0.4
};
/** Per-observation recency decay: the Nth-most-recent observation of a tag weighs this^N. */
const RECENCY_DECAY = 0.85;

/**
 * Aggregate a learner's tag observations into per-tag mastery. Pure: `observations` must be
 * ordered newest-first per the caller's query, and the recency weight follows that order so
 * no wall clock is read here.
 */
export const aggregateTagMastery = (observations: TagObservation[]): TagMasteryMap => {
  const byTag = new Map<string, TagObservation[]>();
  for (const obs of observations) {
    if (obs.exposure <= 0) continue;
    const rows = byTag.get(obs.tag);
    if (rows) rows.push(obs);
    else byTag.set(obs.tag, [obs]);
  }

  const out: TagMasteryMap = {};
  for (const [tag, rows] of byTag) {
    let weightedSum = 0;
    let weightTotal = 0;
    let totalExposure = 0;
    rows.forEach((row, rank) => {
      const accuracy = row.hits / row.exposure;
      const weight = row.exposure * SOURCE_WEIGHT[row.source] * RECENCY_DECAY ** rank;
      weightedSum += accuracy * weight;
      weightTotal += weight;
      totalExposure += row.exposure;
    });
    const mastery = weightTotal === 0 ? 0 : weightedSum / weightTotal;

    // Trend: mean accuracy of the recent half vs the older half (rows are newest-first).
    let trend = 0;
    if (rows.length >= 4) {
      const half = Math.floor(rows.length / 2);
      const meanAcc = (slice: TagObservation[]) =>
        slice.reduce((s, r) => s + r.hits / r.exposure, 0) / slice.length;
      trend = meanAcc(rows.slice(0, half)) - meanAcc(rows.slice(half));
    }

    out[tag] = {
      mastery: Number(mastery.toFixed(3)),
      exposure: totalExposure,
      trend: Number(trend.toFixed(3))
    };
  }
  return out;
};

/* ---------- CEFR estimation from dictation ---------- */

export type DictationBandResult = { band: string | null; accuracy: number };

export type CefrEstimate = { level: CefrLevel | null; confidence: number };

// Accuracy expected when a passage sits at the learner's own level. Above it → the learner is
// stronger than the band; below → weaker. Slope: being a full 0.25 above target reads as one
// band up. Tunable (design §7).
const TARGET_ACCURACY = 0.75;
const ACCURACY_PER_BAND = 0.25;
/** Attempts needed before confidence is treated as full, before the spread factor. */
const CONFIDENCE_FULL_AT = 8;

/**
 * Estimate CEFR from dictation attempts against passages of known band. Dictation is the
 * placement instrument (notes §1): high accuracy on a hard band is evidence of a high level.
 * Confidence grows with the number of attempts and the spread of bands seen — one attempt on
 * one band is weak evidence however good the score.
 */
export const estimateCefrFromDictation = (attempts: DictationBandResult[]): CefrEstimate => {
  const usable = attempts.filter((a) => cefrOrdinal(a.band) > 0);
  if (usable.length === 0) return { level: null, confidence: 0 };

  const demonstrated = usable.map(
    (a) => cefrOrdinal(a.band) + (a.accuracy - TARGET_ACCURACY) / ACCURACY_PER_BAND
  );
  const mean = demonstrated.reduce((s, v) => s + v, 0) / demonstrated.length;

  const bands = new Set(usable.map((a) => cefrOrdinal(a.band)));
  const spreadFactor = Math.min(1, 0.5 + 0.25 * (bands.size - 1)); // 1 band → 0.5, 3+ → 1
  const volume = Math.min(1, usable.length / CONFIDENCE_FULL_AT);
  const confidence = Number((volume * spreadFactor).toFixed(3));

  return { level: cefrFromOrdinal(mean), confidence };
};

/**
 * Resolve the CEFR level the product shows, from the declared pick and the measured estimate
 * (design §8). Measured overrides the declaration only once it is confident enough, and
 * gradually — so it never feels arbitrary, and the progress centre can explain why.
 */
export const CEFR_OVERRIDE_CONFIDENCE = 0.5;

export const resolveCefr = (input: {
  declared: string | null;
  measured: string | null;
  measuredConfidence: number;
}): { level: string | null; basis: "measured" | "declared" | "default" } => {
  if (input.measured && input.measuredConfidence >= CEFR_OVERRIDE_CONFIDENCE) {
    return { level: input.measured, basis: "measured" };
  }
  if (input.declared) return { level: input.declared, basis: "declared" };
  return { level: null, basis: "default" };
};
