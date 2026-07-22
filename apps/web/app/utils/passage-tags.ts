// Relative, not the `~` alias, on purpose: the offline seed script runs under plain
// Node with no Vite resolver and imports this module directly. Keeping both this file
// and dictation-diff.ts alias-free means the tagger has exactly one implementation
// rather than a copy in scripts/ that can drift.
import { tokenize } from "./dictation-diff";

/**
 * Deterministic passage analysis: difficulty metrics and practice-feature tags.
 *
 * Pure module — no server, DOM, or network. Design: `docs/material-layer-design.md` §5.
 *
 * **Everything here is derived from the text by code, never guessed by a model.** Tags
 * drive material matching, so they must be reproducible, free to recompute over the whole
 * library when the vocabulary changes, and stable between batches. An LLM asked "does this
 * passage practise weak forms?" answers differently on different days; a regex does not.
 *
 * The word-level definition is deliberately shared with the dictation scorer (`tokenize`),
 * so "a word" means the same thing when we tag material and when we score an attempt.
 */

/* ---------- vocabulary ---------- */

/**
 * The tag vocabulary. This is a contract with the future learner model: a tag is only
 * worth having if a learner weakness can be expressed against it.
 *
 * Note there is no `third_person_s` / `plural_s` split, though the dictation feedback
 * reports those as separate learner patterns. Telling them apart needs part-of-speech
 * information — "he walks" versus "the walks" — and a regex approximation would be wrong
 * often enough to poison the density figures matching depends on. `final_s` instead
 * describes what is actually in the audio: a word-final sibilant the listener has to
 * catch. One material tag serving two learner weaknesses is fine; a plausible-looking
 * tag that is quietly 40% wrong is not.
 */
export const PASSAGE_TAGS = [
  "contraction",
  "weak_form",
  "article",
  "final_s",
  "past_ed",
  "homophone",
  "number_words",
  "th_sound",
  "consonant_cluster",
  "linking",
  "long_sentence",
  "question"
] as const;

export type PassageTagName = (typeof PASSAGE_TAGS)[number];

/** Sentences longer than this are counted toward `long_sentence`. */
const LONG_SENTENCE_WORDS = 18;

/** Unstressed function words that reduce in connected speech. */
const WEAK_FORMS = new Set([
  "a", "an", "the", "of", "to", "for", "at", "and", "but", "or", "than", "as",
  "from", "that", "was", "were", "are", "am", "is", "been", "have", "has", "had",
  "can", "could", "would", "should", "must", "shall", "will", "do", "does", "did",
  "some", "them", "him", "her", "his", "your", "our", "their", "there", "you", "he",
  "she", "it", "we", "they", "in", "on", "with", "by", "up", "out", "if", "so"
]);

const ARTICLES = new Set(["a", "an", "the"]);

/** Words ending in -s that are not a plural or third-person ending. */
const FINAL_S_EXCEPTIONS = new Set([
  "is", "was", "has", "this", "his", "us", "yes", "its", "as", "gas", "bus", "class",
  "glass", "grass", "pass", "less", "miss", "guess", "across", "unless", "always",
  "perhaps", "sometimes", "business", "process", "address", "press", "dress", "mess",
  "thus", "plus", "chaos", "focus", "campus", "bonus", "virus", "series", "species",
  "news", "themselves", "ourselves", "yourselves", "outdoors", "indoors", "towards",
  "besides", "otherwise", "clothes", "police", "notice", "office", "practice", "service"
]);

/** Words ending in -ed that are not a past-tense ending. */
const PAST_ED_EXCEPTIONS = new Set([
  "bed", "red", "need", "seed", "speed", "indeed", "hundred", "sacred", "wicked",
  "naked", "shed", "fed", "led", "wed", "bred", "fled", "sled", "deed", "feed",
  "greed", "breed", "creed", "freed", "agreed", "exceed", "succeed", "proceed", "weed"
]);

/** Pairs a listener can confuse; counted when either member appears. */
const HOMOPHONES = new Set([
  "their", "there", "they're", "your", "you're", "its", "it's", "to", "too", "two",
  "here", "hear", "where", "wear", "were", "which", "witch", "no", "know", "new",
  "knew", "one", "won", "for", "four", "by", "buy", "bye", "sea", "see", "week",
  "weak", "right", "write", "peace", "piece", "plain", "plane", "principal",
  "principle", "than", "then", "weather", "whether", "wood", "would", "our", "hour",
  "meat", "meet", "road", "rode", "sun", "son", "wait", "weight", "break", "brake",
  "flour", "flower", "made", "maid", "mail", "male", "pair", "pear", "sale", "sail",
  "steal", "steel", "tail", "tale", "waist", "waste", "whole", "hole", "allowed",
  "aloud", "affect", "effect", "accept", "except", "quiet", "quite", "loose", "lose"
]);

const NUMBER_WORDS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
  "eighty", "ninety", "hundred", "thousand", "million", "billion", "first", "second",
  "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "twelfth", "twentieth", "half", "quarter", "dozen"
]);

/**
 * High-frequency English words, used for `rareWordRatio`.
 *
 * This is a **coarse proxy** for lexical difficulty, not a real frequency model — it
 * separates A2 text from C1 text usefully but should not be read as precise. The
 * measured difficulty in `passage_stats` is the signal that will eventually supersede it.
 */
const COMMON_WORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not",
  "on", "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from",
  "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would",
  "there", "their", "what", "so", "up", "out", "if", "about", "who", "get", "which",
  "go", "me", "when", "make", "can", "like", "time", "no", "just", "him", "know",
  "take", "people", "into", "year", "your", "good", "some", "could", "them", "see",
  "other", "than", "then", "now", "look", "only", "come", "its", "over", "think",
  "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
  "even", "new", "want", "because", "any", "these", "give", "day", "most", "us",
  "is", "was", "are", "were", "been", "has", "had", "did", "does", "am", "very",
  "much", "many", "more", "little", "old", "great", "big", "small", "long", "own",
  "same", "right", "still", "before", "here", "through", "where", "why", "again",
  "too", "always", "never", "often", "sometimes", "every", "each", "few", "both",
  "made", "went", "said", "got", "put", "found", "thought", "told", "asked", "felt",
  "home", "house", "room", "water", "food", "morning", "night", "day", "week",
  "month", "family", "friend", "school", "city", "car", "book", "hand", "eye",
  "life", "world", "thing", "man", "woman", "child", "place", "part", "end", "help",
  "keep", "start", "feel", "try", "leave", "call", "need", "become", "seem", "let",
  "begin", "show", "hear", "play", "run", "move", "live", "believe", "bring", "happen",
  "write", "sit", "stand", "lose", "pay", "meet", "read", "walk", "talk", "turn",
  "buy", "wait", "learn", "change", "understand", "watch", "follow", "stop", "open",
  "close", "eat", "drink", "sleep", "wake", "cook", "clean", "wash", "wear", "carry"
]);

/* ---------- helpers ---------- */

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/** Splits on sentence-final punctuation, keeping non-empty pieces. */
export const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

/**
 * Splits a sentence at punctuation that interrupts connected speech, so linking is only
 * counted across word boundaries a speaker would actually run together.
 */
const splitBreathGroups = (sentence: string): string[] =>
  sentence
    .split(/[,;:—–-]+|\.\.\./)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

const isConsonantLetter = (letter: string): boolean =>
  /[a-z]/.test(letter) && !VOWELS.has(letter);

/** True when a word contains a run of 3+ consonant letters ("strengths", "twelfths"). */
const hasConsonantCluster = (word: string): boolean => {
  let run = 0;
  for (const letter of word) {
    if (isConsonantLetter(letter)) {
      run += 1;
      if (run >= 3) return true;
    } else {
      run = 0;
    }
  }
  return false;
};

const isContraction = (word: string): boolean =>
  /'(t|ll|re|ve|d|s|m)$/.test(word) || word.endsWith("n't");

const isFinalS = (word: string): boolean =>
  word.length > 2 && word.endsWith("s") && !word.endsWith("ss") && !FINAL_S_EXCEPTIONS.has(word);

const isPastEd = (word: string): boolean =>
  word.length > 3 && word.endsWith("ed") && !PAST_ED_EXCEPTIONS.has(word);

/* ---------- analysis ---------- */

export type PassageMetrics = {
  wordCount: number;
  sentenceCount: number;
  meanSentenceWords: number;
  /** Share of tokens outside the common-word list, 0..1. Coarse proxy — see above. */
  rareWordRatio: number;
};

export type PassageTagCount = { tag: PassageTagName; count: number };

export type PassageAnalysis = {
  metrics: PassageMetrics;
  /** Only tags with a non-zero count, highest first. */
  tags: PassageTagCount[];
};

/** The word-level tags. Sentence-level tags (`long_sentence`, `question`, `linking`) are
 *  not attributable to a single token and are excluded here. */
export const WORD_LEVEL_TAGS = [
  "contraction",
  "weak_form",
  "article",
  "final_s",
  "past_ed",
  "homophone",
  "number_words",
  "th_sound",
  "consonant_cluster"
] as const satisfies readonly PassageTagName[];

/**
 * The word-level tags a single token carries. Shared by the material tagger below and by
 * dictation error attribution (`learner-model.ts`), so "a word carries tag T" has exactly
 * one definition — the reason the learner model can attribute a missed word to the same
 * tags the material was tagged with, with no second copy to drift.
 */
export const wordTags = (word: string): PassageTagName[] => {
  const tags: PassageTagName[] = [];
  if (isContraction(word)) tags.push("contraction");
  if (WEAK_FORMS.has(word)) tags.push("weak_form");
  if (ARTICLES.has(word)) tags.push("article");
  if (isFinalS(word)) tags.push("final_s");
  if (isPastEd(word)) tags.push("past_ed");
  if (HOMOPHONES.has(word)) tags.push("homophone");
  if (NUMBER_WORDS.has(word)) tags.push("number_words");
  if (word.includes("th")) tags.push("th_sound");
  if (hasConsonantCluster(word)) tags.push("consonant_cluster");
  return tags;
};

export const analyzePassage = (text: string): PassageAnalysis => {
  const sentences = splitSentences(text);
  const words = tokenize(text);
  const wordCount = words.length;

  const counts = new Map<PassageTagName, number>();
  const bump = (tag: PassageTagName, by = 1) => counts.set(tag, (counts.get(tag) ?? 0) + by);

  for (const word of words) {
    for (const tag of wordTags(word)) bump(tag);
  }

  // Sentence-level features.
  for (const sentence of sentences) {
    if (tokenize(sentence).length > LONG_SENTENCE_WORDS) bump("long_sentence");
    if (sentence.includes("?")) bump("question");

    // Linking: a word ending in a consonant followed by one starting with a vowel,
    // counted only inside a breath group so a comma does not create a false boundary.
    for (const chunk of splitBreathGroups(sentence)) {
      const chunkWords = tokenize(chunk);
      for (let i = 0; i < chunkWords.length - 1; i += 1) {
        const current = chunkWords[i]!;
        const next = chunkWords[i + 1]!;
        const lastLetter = current[current.length - 1]!;
        const firstLetter = next[0]!;
        if (isConsonantLetter(lastLetter) && VOWELS.has(firstLetter)) bump("linking");
      }
    }
  }

  const rareWords = words.filter((word) => !COMMON_WORDS.has(word)).length;

  return {
    metrics: {
      wordCount,
      sentenceCount: sentences.length,
      meanSentenceWords: sentences.length === 0 ? 0 : wordCount / sentences.length,
      rareWordRatio: wordCount === 0 ? 0 : rareWords / wordCount
    },
    tags: PASSAGE_TAGS.map((tag) => ({ tag, count: counts.get(tag) ?? 0 }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)
  };
};

/**
 * Tag density normalized by passage length — what matching should compare, since a
 * long passage naturally contains more of everything.
 */
export const tagDensity = (analysis: PassageAnalysis, tag: PassageTagName): number => {
  if (analysis.metrics.wordCount === 0) return 0;
  const entry = analysis.tags.find((item) => item.tag === tag);
  return entry ? entry.count / analysis.metrics.wordCount : 0;
};
