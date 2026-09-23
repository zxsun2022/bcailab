import { cefrOrdinal, CEFR_LEVELS, type CefrLevel } from "./learner-model";
import { en } from "~/i18n/messages/en";
import { interpolate, type MessageKey, type MessageVars } from "~/i18n/translate";

/**
 * A learner-facing reason: the catalogue key and values the page renders in the interface
 * language, plus the same sentence in English. The English is built from the catalogue entry
 * itself, so the two cannot drift, and existing callers of `reason` see unchanged text.
 */
const explain = (reasonKey: MessageKey, reasonVars?: MessageVars) => ({
  reason: interpolate(en[reasonKey], reasonVars),
  reasonKey,
  reasonVars
});

/**
 * The recommendation seam. Design: `docs/english-studio-ia-v2-design.md` §3.3, §6.4.
 *
 * Pure and deterministic — no clock, no randomness, no I/O — so it is unit-testable and so
 * the Home renders the same thing for the same state. It is **not** a matching service: it
 * ranks nothing by tag profile. It picks level-appropriate material and falls back in a
 * fixed order. Matching (Dictation v2) replaces this function and inherits its callers.
 *
 * The output is deliberately **a list of actions with reasons** even though today it holds
 * at most one recommendation, so matching and the later planning/session layer can return
 * several without reshaping the Home (design §6.4).
 */

export type PracticeMode = "dictation" | "reading";

/** A published library passage, as the loader hands it over (bounded query). */
export type CandidatePassage = {
  id: string;
  title: string;
  band: string | null;
  topic: string | null;
  sentenceCount: number;
  /** Sentence audio is what makes a passage dictatable. */
  hasSentenceAudio: boolean;
};

/** What the learner has already done with a passage. */
export type PracticeRecord = {
  passageId: string;
  mode: PracticeMode;
  status: "in_progress" | "completed";
  /** 0..1. For an in-progress dictation this covers only the sentences checked so far. */
  accuracy: number;
  sentencesDone: number;
  createdAt: string;
};

/** An unfinished piece of writing. Writing has no band or tags, so it only ever surfaces
 *  as something to continue — never as a recommendation or in the ability panels. */
export type WritingDraft = {
  articleId: string;
  title: string | null;
  updatedAt: string;
};

export type ContinueAction =
  | {
      kind: "dictation";
      passageId: string;
      title: string;
      band: string | null;
      topic: string | null;
      done: number;
      total: number;
      href: string;
    }
  | {
      kind: "writing";
      articleId: string;
      /** The draft's title, or "Untitled draft" in English when it has none. */
      title: string;
      /** True when `title` is the English placeholder, so a page can word it itself. */
      untitled: boolean;
      updatedAt: string;
      href: string;
    };

/** Why a passage was offered. The UI uses this for labelling; the learner sees `reason`. */
export type Rationale = "level_fit" | "cross_mode" | "adjacent_band" | "revisit";

export type RecommendedAction = {
  mode: PracticeMode;
  passageId: string;
  title: string;
  band: string | null;
  topic: string | null;
  sentenceCount: number;
  rationale: Rationale;
  /** Learner-facing. Honest: level fit and practice history only — never a personalisation
   *  claim, because nothing here ranks by the learner's tag profile yet. English; pages
   *  render `reasonKey` / `reasonVars` in the interface language. */
  reason: string;
  reasonKey: MessageKey;
  reasonVars?: MessageVars;
  href: string;
};

export type AlternativeDirection = "easier" | "harder" | "other_topic";

export type AlternativeAction = {
  direction: AlternativeDirection;
  label: string;
  passageId: string;
  mode: PracticeMode;
  href: string;
};

export type StarterPractice = {
  /** Resumable work. Outranks any recommendation — it needs no intelligence to be right. */
  continueAction: ContinueAction | null;
  /** Ranked, most relevant first. At most one today; the shape is the seam (§6.4). */
  recommendations: RecommendedAction[];
  /** Directional swaps for the primary recommendation — never a slot-machine reshuffle. */
  alternatives: AlternativeAction[];
};

export type StarterPracticeInput = {
  /** Resolved CEFR, or null when the system has not established one. */
  level: string | null;
  candidates: CandidatePassage[];
  /** Published record destinations, independent of the recommendation window. */
  recordPassages?: CandidatePassage[];
  records: PracticeRecord[];
  draft: WritingDraft | null;
  /** Completed attempts so far — drives the deterministic exploration cadence. */
  attemptCount: number;
  /**
   * The request time, as an ISO string. Passed in rather than read, so the function stays free
   * of clocks. Only the Writing staleness cutoff uses it; when absent, no draft is too old.
   */
  now?: string;
};

/**
 * A Writing session untouched for longer than this is not offered as Continue (Home v3, O1).
 * Writing has no finished state, so without a cutoff the latest session stays on Home forever;
 * it remains reachable from `/writing`. Dictation is exempt: its resume state is exact and cheap.
 */
export const WRITING_CONTINUE_MAX_AGE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const isStaleDraft = (draft: WritingDraft, now: string | undefined): boolean => {
  if (!now) return false;
  const age = Date.parse(now) - Date.parse(draft.updatedAt);
  return Number.isFinite(age) && age > WRITING_CONTINUE_MAX_AGE_DAYS * DAY_MS;
};

/**
 * Band used for selection when no level is established. The UI must never render this as
 * the learner's level (design §3.5) — it only keeps the policy from returning nothing.
 */
const FALLBACK_BAND: CefrLevel = "B1";

/**
 * Explore an adjacent band every Nth attempt while band coverage is thin.
 *
 * This is not a nicety: CEFR confidence is the product of practice volume and *band
 * spread*, and a single band caps confidence at exactly the override threshold (design
 * §1.4). A recommender that only ever serves the current band starves the estimator that
 * tells it what the current band is. Deterministic on `attemptCount` rather than random,
 * so the Home is stable across reloads and the behaviour is testable.
 */
const EXPLORE_EVERY = 4;

const passageHref = (mode: PracticeMode, passageId: string): string =>
  mode === "dictation" ? `/dictation/${passageId}` : `/reading/${passageId}`;

const adjacentBands = (band: string): string[] => {
  const index = cefrOrdinal(band) - 1;
  if (index < 0) return [];
  const out: string[] = [];
  if (index + 1 < CEFR_LEVELS.length) out.push(CEFR_LEVELS[index + 1]!);
  if (index - 1 >= 0) out.push(CEFR_LEVELS[index - 1]!);
  return out;
};

const supportsMode = (passage: CandidatePassage, mode: PracticeMode): boolean =>
  mode === "dictation" ? passage.hasSentenceAudio : true;

/** Stable ordering so the same state always yields the same pick. */
const byTitle = (a: CandidatePassage, b: CandidatePassage) => a.title.localeCompare(b.title);

const pickContinue = (
  records: PracticeRecord[],
  candidates: CandidatePassage[],
  draft: WritingDraft | null,
  now: string | undefined
): ContinueAction | null => {
  const byId = new Map(candidates.map((c) => [c.id, c]));

  // Newest unfinished dictation whose passage is still published — a resumable attempt
  // pointing at withdrawn material must not be offered (the "stale" state).
  const resumable = records
    .filter((r) => r.mode === "dictation" && r.status === "in_progress" && byId.get(r.passageId)?.hasSentenceAudio)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const dictationAction: ContinueAction | null = resumable
    ? {
        kind: "dictation",
        passageId: resumable.passageId,
        title: byId.get(resumable.passageId)!.title,
        band: byId.get(resumable.passageId)!.band,
        topic: byId.get(resumable.passageId)!.topic,
        done: resumable.sentencesDone,
        total: byId.get(resumable.passageId)!.sentenceCount,
        href: passageHref("dictation", resumable.passageId)
      }
    : null;

  const writingAction: ContinueAction | null = draft && !isStaleDraft(draft, now)
    ? {
        kind: "writing",
        articleId: draft.articleId,
        title: draft.title?.trim() || "Untitled draft",
        untitled: !draft.title?.trim(),
        updatedAt: draft.updatedAt,
        href: `/writing/${draft.articleId}`
      }
    : null;

  if (dictationAction && writingAction) {
    // Whichever the learner touched most recently.
    return resumable!.createdAt.localeCompare(draft!.updatedAt) >= 0
      ? dictationAction
      : writingAction;
  }
  return dictationAction ?? writingAction;
};

export const selectStarterPractice = (input: StarterPracticeInput): StarterPractice => {
  const { candidates, records, level, draft, attemptCount, now } = input;

  const recordPassages = input.recordPassages ?? candidates;
  const knownPassages = [...candidates, ...recordPassages];
  const continueAction = pickContinue(records, recordPassages, draft, now);

  const practisedByMode = new Map<string, PracticeRecord[]>();
  for (const record of records) {
    const key = `${record.mode}:${record.passageId}`;
    const list = practisedByMode.get(key);
    if (list) list.push(record);
    else practisedByMode.set(key, [record]);
  }
  const hasPractised = (mode: PracticeMode, passageId: string) =>
    practisedByMode.has(`${mode}:${passageId}`);

  const band = level && cefrOrdinal(level) > 0 ? level : FALLBACK_BAND;
  const inBand = candidates.filter((c) => c.band === band).sort(byTitle);
  const bandsPractised = new Set(
    records
      .map((r) => knownPassages.find((c) => c.id === r.passageId)?.band)
      .filter((b): b is string => Boolean(b))
  );

  const unpractised = (pool: CandidatePassage[], mode: PracticeMode) =>
    pool.filter((c) => supportsMode(c, mode) && !hasPractised(mode, c.id));

  const explore =
    bandsPractised.size < 2 && attemptCount > 0 && attemptCount % EXPLORE_EVERY === 0;

  let primary: RecommendedAction | null = null;

  // Deterministic exploration takes precedence when coverage is thin, because the
  // estimator needs band spread more than the learner needs another same-band passage.
  if (explore) {
    for (const adjacent of adjacentBands(band)) {
      const pool = candidates.filter((c) => c.band === adjacent).sort(byTitle);
      const fresh = unpractised(pool, "dictation")[0];
      if (fresh) {
        primary = {
          mode: "dictation",
          passageId: fresh.id,
          title: fresh.title,
          band: fresh.band,
          topic: fresh.topic,
          sentenceCount: fresh.sentenceCount,
          rationale: "adjacent_band",
          ...explain(
            cefrOrdinal(adjacent) > cefrOrdinal(band) ? "practice.reason.stepUp" : "practice.reason.stepDown",
            { band }
          ),
          href: passageHref("dictation", fresh.id)
        };
        break;
      }
    }
  }

  // 1. Unpractised material at the learner's level.
  if (!primary) {
    const fresh = unpractised(inBand, "dictation")[0];
    if (fresh) {
      primary = {
        mode: "dictation",
        passageId: fresh.id,
        title: fresh.title,
        band: fresh.band,
        topic: fresh.topic,
        sentenceCount: fresh.sentenceCount,
        rationale: "level_fit",
        ...explain(level ? "practice.reason.levelFit" : "practice.reason.startingPoint"),
        href: passageHref("dictation", fresh.id)
      };
    }
  }

  // 2. Same band, other mode — the settled dictation → reading handoff. Makes a passage
  //    already dictated useful again instead of declaring the band exhausted.
  if (!primary) {
    const dictated = inBand.find((c) => hasPractised("dictation", c.id) && !hasPractised("reading", c.id));
    if (dictated) {
      primary = {
        mode: "reading",
        passageId: dictated.id,
        title: dictated.title,
        band: dictated.band,
        topic: dictated.topic,
        sentenceCount: dictated.sentenceCount,
        rationale: "cross_mode",
        ...explain("practice.reason.crossMode"),
        href: passageHref("reading", dictated.id)
      };
    }
  }

  // 3. Adjacent band, unpractised.
  if (!primary) {
    for (const adjacent of adjacentBands(band)) {
      const pool = candidates.filter((c) => c.band === adjacent).sort(byTitle);
      const fresh = unpractised(pool, "dictation")[0];
      if (fresh) {
        primary = {
          mode: "dictation",
          passageId: fresh.id,
          title: fresh.title,
          band: fresh.band,
          topic: fresh.topic,
          sentenceCount: fresh.sentenceCount,
          rationale: "adjacent_band",
          ...explain("practice.reason.nothingNew", { band, adjacent }),
          href: passageHref("dictation", fresh.id)
        };
        break;
      }
    }
  }

  // 4. Revisit the weakest score. Never "you failed this" — framed as a second run.
  if (!primary) {
    const scored = records
      .filter((r) => r.mode === "dictation" && r.status === "completed")
      .sort((a, b) => a.accuracy - b.accuracy);
    for (const record of scored) {
      const passage = recordPassages.find((c) => c.id === record.passageId);
      if (!passage?.hasSentenceAudio) continue;
      primary = {
        mode: "dictation",
        passageId: passage.id,
        title: passage.title,
        band: passage.band,
        topic: passage.topic,
        sentenceCount: passage.sentenceCount,
        rationale: "revisit",
        ...explain("practice.reason.revisit", { pct: Math.round(record.accuracy * 100) }),
        href: passageHref("dictation", passage.id)
      };
      break;
    }
  }

  return {
    continueAction,
    recommendations: primary ? [primary] : [],
    alternatives: primary ? buildAlternatives(primary, candidates, hasPractised, band) : []
  };
};

/**
 * Directional swaps, per the review decision: the alternative to one recommendation is a
 * *meaningful choice* ("easier", "challenge me", "different topic"), not a reshuffle. Each
 * is offered only when such a passage actually exists, so no button is a dead end.
 */
const buildAlternatives = (
  primary: RecommendedAction,
  candidates: CandidatePassage[],
  hasPractised: (mode: PracticeMode, passageId: string) => boolean,
  band: string
): AlternativeAction[] => {
  const out: AlternativeAction[] = [];
  const index = cefrOrdinal(band) - 1;

  const firstFresh = (pool: CandidatePassage[]) =>
    pool
      .filter((c) => c.hasSentenceAudio && !hasPractised("dictation", c.id) && c.id !== primary.passageId)
      .sort(byTitle)[0];

  const easierBand = index - 1 >= 0 ? CEFR_LEVELS[index - 1] : null;
  if (easierBand) {
    const found = firstFresh(candidates.filter((c) => c.band === easierBand));
    if (found) {
      out.push({
        direction: "easier",
        label: "Something easier",
        passageId: found.id,
        mode: "dictation",
        href: passageHref("dictation", found.id)
      });
    }
  }

  const harderBand = index + 1 < CEFR_LEVELS.length ? CEFR_LEVELS[index + 1] : null;
  if (harderBand) {
    const found = firstFresh(candidates.filter((c) => c.band === harderBand));
    if (found) {
      out.push({
        direction: "harder",
        label: "Challenge me",
        passageId: found.id,
        mode: "dictation",
        href: passageHref("dictation", found.id)
      });
    }
  }

  const otherTopic = firstFresh(
    candidates.filter((c) => c.band === primary.band && c.topic !== primary.topic)
  );
  if (otherTopic) {
    out.push({
      direction: "other_topic",
      label: "Different topic",
      passageId: otherTopic.id,
      mode: "dictation",
      href: passageHref("dictation", otherTopic.id)
    });
  }

  return out;
};
