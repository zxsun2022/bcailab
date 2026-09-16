// Relative imports, not the `~` alias, so this stays consumable by plain-Node tooling for the
// same reason learner-model.ts is (see passage-tags.ts header).
import {
  NAMING_MIN_EXPOSURE,
  READING_TAGS,
  resolveCefr,
  STRONG_MASTERY_FROM,
  TAG_DESCRIPTIONS,
  WEAK_MASTERY_BELOW
} from "./learner-model";
import type { PassageTagName } from "./passage-tags";
import { WRITING_AGENTS } from "./writing-agents";

/**
 * The learner brief: what a grader is told about the learner before it judges a piece.
 * Decision: ADR 0010. Design: `docs/learner-context-proposal.md` §4.
 *
 * This is context, not measurement. Nothing here is written back to the learner model, every
 * earlier AI judgement is labelled as one, and the brief is assembled per call from whatever
 * history exists at that moment. It is deterministic over that history, but it is not a record
 * of what an earlier evaluation saw: the profile row is overwritten at every recompute.
 *
 * Pure module — the server assembler (`learner-context.server.ts`) does the reads.
 */

/** Every bound in one place. Tunable, not a schema. */
export const LEARNER_CONTEXT_LIMITS = {
  /** Earlier completed dictation attempts considered, newest first. */
  dictationAttempts: 6,
  /** Earlier Writing sessions considered, one latest feedback round each. */
  writingSessions: 6,
  weakTags: 3,
  strongTags: 2,
  dictationPatterns: 4,
  writingDimensions: 3,
  examplesPerDimension: 2,
  quoteChars: 80,
  diagnosisChars: 140,
  renderedChars: 1800
} as const;

/** A trend this large, either way, is worth a word; smaller movement is noise. */
const TREND_WORDING = 0.05;
const OTHER_DIMENSION = "Other";

/**
 * Where a tag's accuracy came from. Only Dictation's deterministic diff writes tags outside
 * Reading's six, so those are measured by construction. Reading writes down-weighted `llm`
 * observations for its six, blended into the same mastery — so a Reading tag may include
 * earlier AI judgement, whatever this learner's actual mix of evidence happens to be.
 */
export type TagProvenance = "deterministic" | "may_include_ai";

export type TagLine = {
  tag: string;
  label: string;
  mastery: number;
  exposure: number;
  trend: number;
  provenance: TagProvenance;
};

export type LearnerLevel = {
  value: string | null;
  basis: "measured" | "declared" | "default";
  /** Measurement confidence; 0 unless the level is measured. */
  confidence: number;
};

/** One earlier coach remark, flattened and cut to size. */
export type CoachNote = { quote: string; diagnosis: string; at: string };

export type DictationNoteGroup = {
  pattern: string;
  /** Distinct earlier attempts whose feedback named this pattern. */
  attempts: number;
  /** From the newest attempt that named it. */
  evidence: string;
  at: string;
};

export type WritingNoteGroup = {
  /** A dimension from the coach's set in `writing-agents.ts`, or "Other". */
  dimension: string;
  /** Distinct sessions whose latest feedback raised it. */
  sessions: number;
  examples: CoachNote[];
};

export type LearnerBrief = {
  assembledAt: string;
  level: LearnerLevel;
  /** Every nameable tag, weakest and strongest first. Uncapped: each projection caps its share. */
  tagAccuracy: { weak: TagLine[]; strong: TagLine[] };
  coachNotes: {
    dictation: { attemptsConsidered: number; groups: DictationNoteGroup[] };
    writing: { sessionsConsidered: number; groups: WritingNoteGroup[] };
  };
};

/** The rows the server assembler reads. Every list is newest first. */
export type LearnerContextSources = {
  assembledAt: string;
  profile: {
    tag_mastery_json: string;
    cefr_declared: string | null;
    cefr_measured: string | null;
    cefr_measured_confidence: number;
  } | null;
  dictationAttempts: {
    id: string;
    status: string;
    feedback_json: string | null;
    created_at: string;
    deleted_at: string | null;
  }[];
  /** The latest round with completed feedback from each recent non-deleted Writing session. */
  writingRounds: {
    article_id: string;
    agent_type: string;
    feedback_json: string;
    created_at: string;
  }[];
  /** The work being judged, so it never counts as its own history. */
  current: { dictationAttemptId?: string; writingArticleId?: string };
};

/* ---------- small, total helpers ---------- */

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Locale-independent, so the brief orders identically on every runtime. */
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Flatten to one line, swap double quotes for single ones so a quoted remark cannot break out of
 * its quotes, and cut to `max` code points. Learner text and model output are both untrusted.
 */
export const clipText = (value: unknown, max: number): string => {
  if (typeof value !== "string") return "";
  const flat = value.replace(/\p{Cc}+/gu, " ").replace(/"/g, "'").replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length <= max ? flat : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
};

const dayOf = (timestamp: string): string =>
  /^\d{4}-\d{2}-\d{2}/.test(timestamp) ? timestamp.slice(0, 10) : "";

const parseJson = (text: string | null | undefined): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/* ---------- the brief ---------- */

const levelFrom = (profile: LearnerContextSources["profile"]): LearnerLevel => {
  const resolved = resolveCefr({
    declared: profile?.cefr_declared ?? null,
    measured: profile?.cefr_measured ?? null,
    measuredConfidence: profile?.cefr_measured_confidence ?? 0
  });
  return {
    value: resolved.level,
    basis: resolved.basis,
    confidence: resolved.basis === "measured" ? (profile?.cefr_measured_confidence ?? 0) : 0
  };
};

/** Tags in `tag_mastery_json` with enough exposure to name. Malformed and unknown entries are skipped. */
const nameableTags = (json: string | undefined): TagLine[] => {
  const parsed = asRecord(parseJson(json));
  if (!parsed) return [];
  const lines: TagLine[] = [];
  for (const [tag, value] of Object.entries(parsed)) {
    const label = TAG_DESCRIPTIONS[tag];
    const entry = asRecord(value);
    if (!label || !entry) continue;
    const { mastery, exposure, trend } = entry;
    if (!isFiniteNumber(mastery) || !isFiniteNumber(exposure)) continue;
    if (exposure < NAMING_MIN_EXPOSURE) continue;
    lines.push({
      tag,
      label,
      mastery,
      exposure,
      trend: isFiniteNumber(trend) ? trend : 0,
      provenance: READING_TAGS.has(tag as PassageTagName) ? "may_include_ai" : "deterministic"
    });
  }
  return lines;
};

const dictationNotes = (
  sources: LearnerContextSources
): LearnerBrief["coachNotes"]["dictation"] => {
  const attempts = sources.dictationAttempts
    .filter(
      (attempt) =>
        !attempt.deleted_at &&
        attempt.status === "completed" &&
        attempt.id !== sources.current.dictationAttemptId
    )
    .slice(0, LEARNER_CONTEXT_LIMITS.dictationAttempts);

  const groups = new Map<string, DictationNoteGroup & { newest: number }>();
  attempts.forEach((attempt, rank) => {
    const patterns = asRecord(parseJson(attempt.feedback_json))?.patterns;
    if (!Array.isArray(patterns)) return;
    const named = new Set<string>();
    for (const value of patterns) {
      const entry = asRecord(value);
      const pattern = clipText(entry?.pattern, LEARNER_CONTEXT_LIMITS.quoteChars);
      const key = pattern.toLowerCase();
      // A pattern counts once per attempt, however often that attempt's feedback repeats it.
      if (!key || named.has(key)) continue;
      named.add(key);
      const group = groups.get(key);
      if (group) {
        group.attempts += 1;
      } else {
        groups.set(key, {
          pattern,
          attempts: 1,
          evidence: clipText(entry?.evidence, LEARNER_CONTEXT_LIMITS.quoteChars),
          at: dayOf(attempt.created_at),
          newest: rank
        });
      }
    }
  });

  return {
    attemptsConsidered: attempts.length,
    groups: [...groups.values()]
      .sort((a, b) => b.attempts - a.attempts || a.newest - b.newest)
      .map((group) => ({
        pattern: group.pattern,
        attempts: group.attempts,
        evidence: group.evidence,
        at: group.at
      }))
  };
};

const normalizeDimension = (value: string): string =>
  value.toLowerCase().replace(/&/g, " and ").replace(/\s+/g, " ").trim();

/**
 * Match a stored rubric dimension to its coach's set. The prompt asks the grader to choose from
 * that set, but the stored value is model output and is not validated, so abbreviations ("GRA"),
 * "and" for "&", and missing codes all occur. Anything unmatched is grouped as "Other".
 */
export const canonicalWritingDimension = (agentType: string, stored: string): string => {
  const dimensions =
    WRITING_AGENTS[agentType]?.dimensions ??
    Object.values(WRITING_AGENTS).flatMap((agent) => agent.dimensions);
  const wanted = normalizeDimension(stored);
  if (!wanted) return OTHER_DIMENSION;
  for (const dimension of dimensions) {
    const code = /\(([A-Za-z]{2,4})\)\s*$/.exec(dimension)?.[1]?.toLowerCase();
    const name = normalizeDimension(dimension.replace(/\s*\([A-Za-z]{2,4}\)\s*$/, ""));
    if (
      wanted === normalizeDimension(dimension) ||
      wanted === name ||
      (code !== undefined && (wanted === code || wanted.endsWith(`(${code})`)))
    ) {
      return dimension;
    }
  }
  return OTHER_DIMENSION;
};

type ParsedAnnotation = {
  severity: number | null;
  index: number;
  dimension: string;
  quote: string;
  diagnosis: string;
};

const writingNotes = (sources: LearnerContextSources): LearnerBrief["coachNotes"]["writing"] => {
  const rounds = sources.writingRounds
    .filter((round) => round.article_id !== sources.current.writingArticleId)
    .slice(0, LEARNER_CONTEXT_LIMITS.writingSessions);
  const groups = new Map<string, { sessions: Set<string>; examples: CoachNote[]; newest: number }>();

  rounds.forEach((round, rank) => {
    const annotations = asRecord(parseJson(round.feedback_json))?.annotations;
    if (!Array.isArray(annotations)) return;
    const notes = annotations
      .map((value, index): ParsedAnnotation => {
        const entry = asRecord(value);
        return {
          severity:
            entry?.severity === "critical" ? 0 : entry?.severity === "improvement" ? 1 : null,
          index,
          dimension: typeof entry?.dimension === "string" ? entry.dimension : "",
          quote: clipText(entry?.quoted_text, LEARNER_CONTEXT_LIMITS.quoteChars),
          diagnosis: clipText(entry?.diagnosis, LEARNER_CONTEXT_LIMITS.diagnosisChars)
        };
      })
      // Strengths are not history to connect a new error to; critical issues lead.
      .filter(
        (note): note is ParsedAnnotation & { severity: number } =>
          note.severity !== null && note.diagnosis !== ""
      )
      .sort((a, b) => a.severity - b.severity || a.index - b.index);

    for (const note of notes) {
      const dimension = canonicalWritingDimension(round.agent_type, note.dimension);
      let group = groups.get(dimension);
      if (!group) {
        group = { sessions: new Set(), examples: [], newest: rank };
        groups.set(dimension, group);
      }
      group.sessions.add(round.article_id);
      if (group.examples.length < LEARNER_CONTEXT_LIMITS.examplesPerDimension) {
        group.examples.push({
          quote: note.quote,
          diagnosis: note.diagnosis,
          at: dayOf(round.created_at)
        });
      }
    }
  });

  return {
    sessionsConsidered: new Set(rounds.map((round) => round.article_id)).size,
    groups: [...groups.entries()]
      .sort(([, a], [, b]) => b.sessions.size - a.sessions.size || a.newest - b.newest)
      .map(([dimension, group]) => ({
        dimension,
        sessions: group.sessions.size,
        examples: group.examples
      }))
  };
};

export const buildLearnerBrief = (sources: LearnerContextSources): LearnerBrief => {
  const tags = nameableTags(sources.profile?.tag_mastery_json);
  return {
    assembledAt: sources.assembledAt,
    level: levelFrom(sources.profile),
    tagAccuracy: {
      weak: tags
        .filter((line) => line.mastery < WEAK_MASTERY_BELOW)
        .sort((a, b) => a.mastery - b.mastery || b.exposure - a.exposure || compareText(a.tag, b.tag)),
      strong: tags
        .filter((line) => line.mastery >= STRONG_MASTERY_FROM)
        .sort((a, b) => b.mastery - a.mastery || b.exposure - a.exposure || compareText(a.tag, b.tag))
    },
    coachNotes: { dictation: dictationNotes(sources), writing: writingNotes(sources) }
  };
};

/* ---------- projections: each grader's share (proposal §4.3) ---------- */

/** Writing dimensions that can share a cause with a transcription error. A test checks each
 *  exists in `writing-agents.ts`, so a renamed dimension cannot silently drop out. */
export const GRAMMAR_DIMENSIONS: ReadonlySet<string> = new Set([
  "Grammar & Mechanics",
  "Grammatical Range & Accuracy (GRA)"
]);

export type LearnerContextProjection = {
  assembledAt: string;
  level: LearnerLevel;
  tags: TagLine[];
  /** Clarify the modality when listening evidence is shown to a writing coach. */
  tagHeading?: string;
  dictation: { attemptsConsidered: number; groups: DictationNoteGroup[] };
  writing: { heading: string; sessionsConsidered: number; groups: WritingNoteGroup[] };
};

/**
 * Dictation feedback's share: level, tag accuracy, earlier dictation feedback, and the grammar
 * side of Writing. No reading notes — prosody does not explain a transcription error. Context
 * cannot contaminate measurement here: Dictation's measurement is the diff, computed first.
 */
export const projectForDictationFeedback = (brief: LearnerBrief): LearnerContextProjection => ({
  assembledAt: brief.assembledAt,
  level: brief.level,
  tags: [
    ...brief.tagAccuracy.weak.slice(0, LEARNER_CONTEXT_LIMITS.weakTags),
    ...brief.tagAccuracy.strong.slice(0, LEARNER_CONTEXT_LIMITS.strongTags)
  ],
  dictation: {
    attemptsConsidered: brief.coachNotes.dictation.attemptsConsidered,
    groups: brief.coachNotes.dictation.groups.slice(0, LEARNER_CONTEXT_LIMITS.dictationPatterns)
  },
  writing: {
    heading: "Coach notes from writing (grammar, other sessions)",
    sessionsConsidered: brief.coachNotes.writing.sessionsConsidered,
    groups: brief.coachNotes.writing.groups
      .filter((group) => GRAMMAR_DIMENSIONS.has(group.dimension))
      .slice(0, LEARNER_CONTEXT_LIMITS.writingDimensions)
  }
});

/* ---------- rendering (proposal §4.4) ---------- */

const WRITING_LISTENING_TAGS: ReadonlySet<string> = new Set(["article", "final_s", "past_ed"]);

/** Writing receives other sessions' notes and only related listening weaknesses, not strengths. */
export const projectForWritingFeedback = (brief: LearnerBrief): LearnerContextProjection => ({
  assembledAt: brief.assembledAt,
  level: brief.level,
  tags: brief.tagAccuracy.weak
    .filter((line) => WRITING_LISTENING_TAGS.has(line.tag))
    .slice(0, LEARNER_CONTEXT_LIMITS.weakTags),
  tagHeading: "Listening evidence from dictation (not writing accuracy)",
  dictation: { attemptsConsidered: 0, groups: [] },
  writing: {
    heading: "Coach notes from writing (other sessions)",
    sessionsConsidered: brief.coachNotes.writing.sessionsConsidered,
    groups: brief.coachNotes.writing.groups.slice(0, LEARNER_CONTEXT_LIMITS.writingDimensions)
  }
});

const USAGE_RULES = [
  "Use this only to prioritise and connect what you observe in the current work.",
  "- Judge the current work on its own evidence. Never add an issue, pattern, highlight, or score because of this section.",
  "- When the current work shows a pattern listed here, say that it recurs.",
  '- Only lines marked "measured" are deterministic measurements. Accuracy marked "may include AI judgement" and every coach note reflect earlier AI feedback and are not verified.',
  "- If the current work shows none of this, do not mention it."
];

/** Never renders an unestablished level as B1 (ADR 0006, applied to prompts by ADR 0010). */
const formatLevel = (level: LearnerLevel): string => {
  if (!level.value) return "not established";
  return level.basis === "measured"
    ? `${level.value} (measured from dictation accuracy, confidence ${level.confidence.toFixed(2)})`
    : `${level.value} (declared by the learner, not yet measured)`;
};

const formatTag = (line: TagLine): string => {
  const trend =
    line.trend >= TREND_WORDING ? ", rising" : line.trend <= -TREND_WORDING ? ", falling" : "";
  const source =
    line.provenance === "deterministic"
      ? "measured (dictation)"
      : "may include AI judgement (Reading)";
  return `- ${line.label}: ${Math.round(line.mastery * 100)}% over ${line.exposure} occurrences${trend} — ${source}`;
};

const formatDictationGroup = (group: DictationNoteGroup, considered: number): string =>
  `- "${group.pattern}", named in ${group.attempts} of the last ${considered} attempts' feedback` +
  (group.evidence ? `; latest evidence: ${group.evidence}` : "") +
  (group.at ? ` (${group.at})` : "");

const formatWritingGroup = (group: WritingNoteGroup, considered: number): string[] => [
  `- ${group.dimension}, in ${group.sessions} of the last ${considered} sessions${group.examples.length > 0 ? ":" : ""}`,
  ...group.examples.map(
    (note) =>
      `  - ${note.quote ? `"${note.quote}": ` : ""}${note.diagnosis}${note.at ? ` (${note.at})` : ""}`
  )
];

/**
 * Render one grader's section. With nothing beyond a level it is two lines and carries no usage
 * rules. Otherwise it is trimmed to `renderedChars`, least valuable first — Writing examples, then
 * Writing groups, then dictation groups, then tag lines — so the cut is deterministic.
 */
export const renderLearnerContext = (projection: LearnerContextProjection): string => {
  const heading = `## Learner context (as of ${dayOf(projection.assembledAt) || "today"})`;
  const level = `Level: ${formatLevel(projection.level)}`;
  const tags = [...projection.tags];
  const dictation = [...projection.dictation.groups];
  const writing = projection.writing.groups.map((group) => ({
    ...group,
    examples: [...group.examples]
  }));

  const compose = (): string => {
    if (tags.length === 0 && dictation.length === 0 && writing.length === 0) {
      return `${heading}\n${level}`;
    }
    const lines = [heading, ...USAGE_RULES, "", level];
    if (tags.length > 0) lines.push(`${projection.tagHeading ?? "Tag accuracy"}:`, ...tags.map(formatTag));
    if (dictation.length > 0) {
      lines.push(
        "Coach notes from earlier dictation attempts:",
        ...dictation.map((group) =>
          formatDictationGroup(group, projection.dictation.attemptsConsidered)
        )
      );
    }
    if (writing.length > 0) {
      lines.push(
        `${projection.writing.heading}:`,
        ...writing.flatMap((group) =>
          formatWritingGroup(group, projection.writing.sessionsConsidered)
        )
      );
    }
    return lines.join("\n");
  };

  const trimOnce = (): boolean => {
    const withExamples = [...writing].reverse().find((group) => group.examples.length > 0);
    if (withExamples) withExamples.examples.pop();
    else if (writing.length > 0) writing.pop();
    else if (dictation.length > 0) dictation.pop();
    else if (tags.length > 0) tags.pop();
    else return false;
    return true;
  };

  let rendered = compose();
  while (rendered.length > LEARNER_CONTEXT_LIMITS.renderedChars && trimOnce()) {
    rendered = compose();
  }
  return rendered;
};
